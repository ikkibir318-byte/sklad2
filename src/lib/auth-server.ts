import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "admin" | "worker";

export interface VerifyPasswordResult {
  success: boolean;
  role: UserRole | null;
  message?: string;
}

export interface ChangePasswordResult {
  success: boolean;
  message?: string;
}

// Fallback passwords stored securely on server side if database migration is pending
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Sm.1234567#";
const DEFAULT_WORKER_PASSWORD = process.env.WORKER_PASSWORD || "worker123";

/**
 * Проверка пароля на стороне СЕРВЕРА (бэкенда).
 * Клиент передаёт пароль, сервер проверяет его через Supabase RPC
 * или безопасный серверный резерв.
 */
export const verifyPasswordServerFn = createServerFn({ method: "POST" })
  .validator((data: { password: string }) => data)
  .handler(async ({ data }): Promise<VerifyPasswordResult> => {
    const password = (data?.password ?? "").trim();
    if (!password) {
      return { success: false, role: null, message: "Введите пароль" };
    }

    try {
      // 1. Попытка вызова серверного RPC в базе данных Supabase
      const { data: rpcData, error } = await (supabase as any).rpc("verify_system_password", {
        input_password: password,
      });

      if (!error && rpcData) {
        if (rpcData.success && (rpcData.role === "admin" || rpcData.role === "worker")) {
          return {
            success: true,
            role: rpcData.role as UserRole,
          };
        }
        return {
          success: false,
          role: null,
          message: rpcData.message || "Неверный пароль",
        };
      }
    } catch (e) {
      console.warn("verify_system_password RPC not available, using server fallback:", e);
    }

    // 2. Серверный резерв (выполняется только на бэкенде Node/Nitro)
    if (password === DEFAULT_ADMIN_PASSWORD) {
      return { success: true, role: "admin" };
    }
    if (password === DEFAULT_WORKER_PASSWORD) {
      return { success: true, role: "worker" };
    }

    return { success: false, role: null, message: "Неверный пароль" };
  });

/**
 * Смена пароля администратором на стороне СЕРВЕРА.
 * Используем service_role клиент для обхода RLS на таблице system_auth.
 */
export const changePasswordServerFn = createServerFn({ method: "POST" })
  .validator((data: { adminPassword: string; targetRole: UserRole; newPassword: string }) => data)
  .handler(async ({ data }): Promise<ChangePasswordResult> => {
    const { adminPassword, targetRole, newPassword } = data;

    if (!newPassword || newPassword.trim().length < 4) {
      return { success: false, message: "Новый пароль должен содержать не менее 4 символов" };
    }

    try {
      // Предпочтительно: admin-клиент (service_role) для надёжного обхода RLS
      let client: any;
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        client = supabaseAdmin;
      } catch {
        // service_role key не настроен — используем обычный клиент как fallback
        console.warn("SUPABASE_SERVICE_ROLE_KEY не настроен, используем обычный клиент для RPC");
        client = supabase;
      }

      const { data: rpcData, error } = await client.rpc("change_system_password", {
        admin_password: adminPassword,
        target_role: targetRole,
        new_password: newPassword.trim(),
      });

      if (error) {
        console.error("change_system_password RPC error:", error);
        return { success: false, message: error.message || "Ошибка при вызове функции смены пароля" };
      }

      if (rpcData) {
        return {
          success: !!rpcData.success,
          message: rpcData.message || (rpcData.success ? "Пароль успешно обновлён" : "Ошибка обновления пароля"),
        };
      }

      // rpcData пустой — RPC не вернул результат
      return { success: false, message: "Функция смены пароля не вернула результат. Проверьте, что миграция базы данных выполнена." };
    } catch (e: any) {
      console.error("changePasswordServerFn error:", e);
      return { success: false, message: e?.message || "Ошибка сервера при смене пароля" };
    }
  });
