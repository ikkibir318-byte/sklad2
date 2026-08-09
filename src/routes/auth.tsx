import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Cable, Eye, EyeOff, KeyRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Вход — КабельУчёт" },
      { name: "description", content: "Вход в систему учёта кабельной продукции." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

/** Дефолтный код приглашения */
const DEFAULT_ACCESS_CODE = "Sm.1234567#";
const STORAGE_KEY = "kabeluchet_access_code";
const SESSION_KEY = "kabeluchet_authed";

export function getAccessCode(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_ACCESS_CODE;
}

export function isAuthenticated(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

function AuthPage() {
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);

  // Redirect if already authed
  useEffect(() => {
    if (isAuthenticated()) {
      navigate({ to: "/", replace: true });
    }
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return toast.error(t("Введите код приглашения"));

    setLoading(true);
    await new Promise((r) => setTimeout(r, 350)); // slight delay for UX

    const validCode = getAccessCode();
    if (code === validCode) {
      sessionStorage.setItem(SESSION_KEY, "true");
      toast.success(t("Добро пожаловать!"));
      navigate({ to: "/", replace: true });
    } else {
      toast.error(t("Неверный код приглашения"));
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-end">
          <Select value={lang} onValueChange={(v) => setLang(v as "ru" | "uz")}>
            <SelectTrigger className="h-8 w-[120px]" aria-label={t("Язык")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ru">Русский</SelectItem>
              <SelectItem value="uz">O'zbekcha</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Cable className="h-7 w-7" />
          </div>
          <span className="text-2xl font-semibold">КабельУчёт</span>
          <p className="text-sm text-muted-foreground text-center">
            {t("Учёт склада кабеля, клиентов и продаж")}
          </p>
        </div>

        <Card className="shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5 text-primary" />
              {t("Вход по коду")}
            </CardTitle>
            <CardDescription>
              {t("Введите код приглашения для доступа к системе")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="access-code">{t("Код приглашения")}</Label>
                <div className="relative">
                  <Input
                    id="access-code"
                    type={showCode ? "text" : "password"}
                    placeholder={t("Введите код…")}
                    autoComplete="off"
                    autoFocus
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="pr-10 font-mono tracking-wider"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowCode((v) => !v)}
                    tabIndex={-1}
                    aria-label={showCode ? t("Скрыть код") : t("Показать код")}
                  >
                    {showCode ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("Проверка…") : t("Войти")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t("Код выдаётся администратором системы")}
        </p>
      </div>
    </div>
  );
}
