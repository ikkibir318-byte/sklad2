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
import { Cable, Eye, EyeOff, Lock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { verifyPasswordServerFn, type UserRole } from "@/lib/auth-server";

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

const ROLE_STORAGE_KEY = "kabeluchet_user_role";

export function getAuthRole(): UserRole | null {
  if (typeof window === "undefined") return null;
  const role = sessionStorage.getItem(ROLE_STORAGE_KEY) || localStorage.getItem(ROLE_STORAGE_KEY);
  if (role === "admin" || role === "worker") return role;
  return null;
}

export function isAuthenticated(): boolean {
  return getAuthRole() !== null;
}

export function isAdmin(): boolean {
  return getAuthRole() === "admin";
}

export function isWorker(): boolean {
  return getAuthRole() === "worker";
}

export function setAuthSession(role: UserRole): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ROLE_STORAGE_KEY, role);
  localStorage.setItem(ROLE_STORAGE_KEY, role);
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ROLE_STORAGE_KEY);
  localStorage.removeItem(ROLE_STORAGE_KEY);
}

function AuthPage() {
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    const role = getAuthRole();
    if (role === "admin") {
      navigate({ to: "/", replace: true });
    } else if (role === "worker") {
      navigate({ to: "/inventory", replace: true });
    }
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanPassword = password.trim();
    if (!cleanPassword) {
      return toast.error(t("Введите пароль"));
    }

    setLoading(true);
    try {
      // Серверная проверка пароля через TanStack Start Server Function / Supabase RPC
      const result = await verifyPasswordServerFn({
        data: { password: cleanPassword },
      });

      if (result.success && result.role) {
        setAuthSession(result.role);
        if (result.role === "admin") {
          toast.success(t("Добро пожаловать, Администратор!"));
          navigate({ to: "/", replace: true });
        } else {
          toast.success(t("Добро пожаловать!"));
          navigate({ to: "/inventory", replace: true });
        }
      } else {
        toast.error(result.message || t("Неверный пароль"));
      }
    } catch (err: any) {
      console.error("Authentication error:", err);
      toast.error(t("Ошибка проверки пароля на сервере"));
    } finally {
      setLoading(false);
    }
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
              <Lock className="h-5 w-5 text-primary" />
              {t("Вход в систему")}
            </CardTitle>
            <CardDescription>
              {t("Введите пароль для входа")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="password">{t("Пароль")}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("Введите пароль…")}
                    autoComplete="current-password"
                    autoFocus
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10 font-mono tracking-wider"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? t("Скрыть пароль") : t("Показать пароль")}
                  >
                    {showPassword ? (
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
          {t("Пароль выдаётся администратором системы")}
        </p>
      </div>
    </div>
  );
}
