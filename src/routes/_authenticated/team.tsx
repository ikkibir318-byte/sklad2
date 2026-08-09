import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Save, RefreshCw } from "lucide-react";
import { getAccessCode } from "@/routes/auth";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/team")({
  ssr: false,
  component: SettingsPage,
});

const STORAGE_KEY = "kabeluchet_access_code";
const DEFAULT_CODE = "Sm.1234567#";

function SettingsPage() {
  const t = useT();
  const [currentCode] = useState<string>(getAccessCode());
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Show current active code (masked by default)
  const [showCurrent, setShowCurrent] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim()) return toast.error(t("Введите новый код"));
    if (newCode.length < 6) return toast.error(t("Код должен быть не менее 6 символов"));
    if (newCode !== confirmCode) return toast.error(t("Коды не совпадают"));

    setSaving(true);
    await new Promise((r) => setTimeout(r, 300));

    localStorage.setItem(STORAGE_KEY, newCode);
    setSaving(false);
    setNewCode("");
    setConfirmCode("");
    toast.success(t("Код приглашения успешно обновлён!"));
  }

  async function handleReset(e: React.MouseEvent) {
    e.preventDefault();
    localStorage.setItem(STORAGE_KEY, DEFAULT_CODE);
    setNewCode("");
    setConfirmCode("");
    toast.success(`${t("Код сброшен до:")} ${DEFAULT_CODE}`);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">{t("Настройки")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Управление доступом к системе КабельУчёт.")}
        </p>
      </div>

      {/* ── ACCESS CODE SETTINGS ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            {t("Код приглашения")}
          </CardTitle>
          <CardDescription>
            {t("Единый код для входа в систему. Передайте его всем, кто должен иметь доступ.")}
            {" "}
            {t("При смене кода существующие сессии не прерываются — только следующий вход потребует новый код.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current code display */}
          <div className="rounded-lg border bg-muted/40 px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {t("Текущий код")}
            </p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold tracking-widest">
                {showCurrent ? currentCode : "•".repeat(currentCode.length)}
              </span>
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowCurrent((v) => !v)}
                aria-label={showCurrent ? t("Скрыть код") : t("Показать код")}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Change code form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="new-code">{t("Новый код приглашения")}</Label>
              <div className="relative">
                <Input
                  id="new-code"
                  type={showNew ? "text" : "password"}
                  placeholder={t("Введите новый код…")}
                  autoComplete="off"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="pr-10 font-mono tracking-wider"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowNew((v) => !v)}
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="confirm-code">{t("Подтвердите новый код")}</Label>
              <div className="relative">
                <Input
                  id="confirm-code"
                  type={showConfirm ? "text" : "password"}
                  placeholder={t("Повторите код…")}
                  autoComplete="off"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  className="pr-10 font-mono tracking-wider"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowConfirm((v) => !v)}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button type="submit" disabled={saving} className="flex-1">
                <Save className="mr-2 h-4 w-4" />
                {saving ? t("Сохранение…") : t("Сохранить код")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                title={`${t("Сбросить до:")} ${DEFAULT_CODE}`}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("Сбросить")}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              {t("Минимальная длина кода — 6 символов. Рекомендуется использовать буквы, цифры и спецсимволы.")}
            </p>
          </form>
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="flex gap-3 text-sm text-muted-foreground">
            <KeyRound className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <p>
              {t("Код приглашения хранится в браузере (localStorage) на данном устройстве.")}
              {" "}
              {t("Если вы хотите использовать другой компьютер для администрирования — укажите там тот же код вручную.")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
