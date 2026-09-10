import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldCheck, UserCheck, Save, Lock, Info } from "lucide-react";
import { useT } from "@/lib/i18n";
import { isAdmin } from "@/routes/auth";
import { changePasswordServerFn } from "@/lib/auth-server";

export const Route = createFileRoute("/_authenticated/team")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window !== "undefined" && !isAdmin()) {
      throw redirect({ to: "/inventory" });
    }
  },
  component: SettingsPage,
});

function PasswordInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete = "off",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10 font-mono tracking-wider"
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShow((v) => !v)}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function SettingsPage() {
  const t = useT();

  // Admin password change state
  const [adminCurrentPass, setAdminCurrentPass] = useState("");
  const [adminNewPass, setAdminNewPass] = useState("");
  const [adminConfirmPass, setAdminConfirmPass] = useState("");
  const [savingAdmin, setSavingAdmin] = useState(false);

  // Worker password change state
  const [workerAdminPass, setWorkerAdminPass] = useState("");
  const [workerNewPass, setWorkerNewPass] = useState("");
  const [workerConfirmPass, setWorkerConfirmPass] = useState("");
  const [savingWorker, setSavingWorker] = useState(false);

  async function handleSaveAdminPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!adminCurrentPass.trim()) return toast.error(t("Введите текущий пароль администратора"));
    if (!adminNewPass.trim()) return toast.error(t("Введите новый пароль администратора"));
    if (adminNewPass.length < 4) return toast.error(t("Пароль должен быть не менее 4 символов"));
    if (adminNewPass !== adminConfirmPass) return toast.error(t("Новые пароли не совпадают"));

    setSavingAdmin(true);
    try {
      const result = await changePasswordServerFn({
        data: {
          adminPassword: adminCurrentPass.trim(),
          targetRole: "admin",
          newPassword: adminNewPass.trim(),
        },
      });

      if (result.success) {
        toast.success(t("Пароль администратора успешно изменён!"));
        setAdminCurrentPass("");
        setAdminNewPass("");
        setAdminConfirmPass("");
      } else {
        toast.error(result.message || t("Ошибка при смене пароля"));
      }
    } catch (err: any) {
      toast.error(err?.message || t("Ошибка соединения с сервером"));
    } finally {
      setSavingAdmin(false);
    }
  }

  async function handleSaveWorkerPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!workerAdminPass.trim()) return toast.error(t("Введите текущий пароль администратора"));
    if (!workerNewPass.trim()) return toast.error(t("Введите новый пароль для рабочего"));
    if (workerNewPass.length < 4) return toast.error(t("Пароль должен быть не менее 4 символов"));
    if (workerNewPass !== workerConfirmPass) return toast.error(t("Новые пароли не совпадают"));

    setSavingWorker(true);
    try {
      const result = await changePasswordServerFn({
        data: {
          adminPassword: workerAdminPass.trim(),
          targetRole: "worker",
          newPassword: workerNewPass.trim(),
        },
      });

      if (result.success) {
        toast.success(t("Пароль для рабочего успешно изменён!"));
        setWorkerAdminPass("");
        setWorkerNewPass("");
        setWorkerConfirmPass("");
      } else {
        toast.error(result.message || t("Ошибка при смене пароля"));
      }
    } catch (err: any) {
      toast.error(err?.message || t("Ошибка соединения с сервером"));
    } finally {
      setSavingWorker(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">{t("Настройки доступа")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Управление паролями доступа для администратора и сотрудников склада.")}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── СМЕНА ПАРОЛЯ АДМИНИСТРАТОРА ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t("Пароль администратора")}
            </CardTitle>
            <CardDescription>
              {t("Полный доступ ко всем функциям системы (дашборд, продажи, склад, отчёты, настройки).")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveAdminPassword} className="space-y-4">
              <PasswordInput
                id="admin-curr"
                label={t("Текущий пароль администратора")}
                placeholder={t("Введите текущий пароль…")}
                value={adminCurrentPass}
                onChange={setAdminCurrentPass}
              />

              <PasswordInput
                id="admin-new"
                label={t("Новый пароль администратора")}
                placeholder={t("Введите новый пароль…")}
                value={adminNewPass}
                onChange={setAdminNewPass}
              />

              <PasswordInput
                id="admin-confirm"
                label={t("Подтвердите новый пароль")}
                placeholder={t("Повторите новый пароль…")}
                value={adminConfirmPass}
                onChange={setAdminConfirmPass}
              />

              <Button type="submit" disabled={savingAdmin} className="w-full">
                <Save className="mr-2 h-4 w-4" />
                {savingAdmin ? t("Сохранение…") : t("Сохранить пароль админа")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ── СМЕНА ПАРОЛЯ РАБОТЯГИ ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-5 w-5 text-primary" />
              {t("Пароль рабочего (склад)")}
            </CardTitle>
            <CardDescription>
              {t("Доступ только к просмотру склада. Без права редактирования, списания, продаж и настроек.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveWorkerPassword} className="space-y-4">
              <PasswordInput
                id="worker-admin-pass"
                label={t("Текущий пароль администратора")}
                placeholder={t("Для подтверждения прав…")}
                value={workerAdminPass}
                onChange={setWorkerAdminPass}
              />

              <PasswordInput
                id="worker-new"
                label={t("Новый пароль для рабочего")}
                placeholder={t("Введите пароль для рабочего…")}
                value={workerNewPass}
                onChange={setWorkerNewPass}
              />

              <PasswordInput
                id="worker-confirm"
                label={t("Подтвердите пароль рабочего")}
                placeholder={t("Повторите пароль для рабочего…")}
                value={workerConfirmPass}
                onChange={setWorkerConfirmPass}
              />

              <Button type="submit" disabled={savingWorker} variant="secondary" className="w-full">
                <Save className="mr-2 h-4 w-4" />
                {savingWorker ? t("Сохранение…") : t("Сохранить пароль рабочего")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Info card */}
      <Card className="border-dashed bg-muted/20">
        <CardContent className="pt-6">
          <div className="flex gap-3 text-sm text-muted-foreground">
            <Info className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                {t("Безопасное хранение на сервере")}
              </p>
              <p>
                {t("Пароли проверяются и хэшируются на бэкенде. При смене пароля новые данные мгновенно сохраняются в базе данных и действуют для всех устройств и пользователей.")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
