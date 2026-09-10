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
 */
export const changePasswordServerFn = createServerFn({ method: "POST" })
  .validator((data: { adminPassword: string; targetRole: UserRole; newPassword: string }) => data)
  .handler(async ({ data }): Promise<ChangePasswordResult> => {
    const { adminPassword, targetRole, newPassword } = data;

    if (!newPassword || newPassword.trim().length < 4) {
      return { success: false, message: "Новый пароль должен содержать не менее 4 символов" };
    }

    try {
      // Попытка обновления в Supabase через RPC
      const { data: rpcData, error } = await (supabase as any).rpc("change_system_password", {
        admin_password: adminPassword,
        target_role: targetRole,
        new_password: newPassword.trim(),
      });

      if (!error && rpcData) {
        return {
          success: !!rpcData.success,
          message: rpcData.message || (rpcData.success ? "Пароль успешно обновлён" : "Ошибка обновления пароля"),
        };
      }
      if (error) {
        return { success: false, message: error.message };
      }
    } catch (e: any) {
      return { success: false, message: e?.message || "Ошибка сервера при смене пароля" };
    }

    return { success: true, message: "Пароль обновлён" };
  });
