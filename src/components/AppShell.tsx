import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";
import {
  LayoutDashboard,
  Package,
  Users,
  ShoppingCart,
  BarChart3,
  Settings,
  LogOut,
  Cable,
  ShieldCheck,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clearAuthSession, isAdmin, isWorker, getAuthRole } from "@/routes/auth";

const allNavItems = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard, exact: true },
  { to: "/inventory", label: "Склад", icon: Package },
  { to: "/sales", label: "Продажи", icon: ShoppingCart },
  { to: "/customers", label: "Клиенты", icon: Users },
  { to: "/reports", label: "Отчёты", icon: BarChart3 },
  { to: "/team", label: "Настройки", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t, lang, setLang } = useI18n();
  const role = getAuthRole();
  const workerMode = isWorker();

  // Для рабочего доступен только пункт "Склад"
  const navItems = workerMode
    ? allNavItems.filter((item) => item.to === "/inventory")
    : allNavItems;

  function handleSignOut() {
    clearAuthSession();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-background md:flex">
        <div className="flex h-16 flex-col justify-center border-b px-6">
          <div className="flex items-center gap-2">
            <Cable className="h-5 w-5 text-primary" />
            <span className="font-semibold text-base">КабельУчёт</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {role === "admin" ? (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-medium border-primary/30 text-primary bg-primary/5 gap-1">
                <ShieldCheck className="h-3 w-3" />
                {t("Администратор")}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-medium gap-1">
                <User className="h-3 w-3" />
                {t("Рабочий (только склад)")}
              </Badge>
            )}
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const active = item.exact
              ? pathname === item.to
              : pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {t(item.label)}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t p-3">
          <Select value={lang} onValueChange={(v) => setLang(v as "ru" | "uz")}>
            <SelectTrigger className="w-full" aria-label={t("Язык")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ru">Русский</SelectItem>
              <SelectItem value="uz">O'zbekcha</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-destructive" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> {t("Выйти")}
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
        <div className="flex items-center gap-2">
          <Cable className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">КабельУчёт</span>
          {role === "admin" ? (
            <Badge variant="outline" className="text-[9px] py-0 px-1 font-normal border-primary/30 text-primary">
              {t("Админ")}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[9px] py-0 px-1 font-normal">
              {t("Склад")}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Select value={lang} onValueChange={(v) => setLang(v as "ru" | "uz")}>
            <SelectTrigger className="h-8 w-[92px]" aria-label={t("Язык")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ru">Русский</SelectItem>
              <SelectItem value="uz">O'zbekcha</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <nav className="sticky top-14 z-20 flex overflow-x-auto border-b bg-background md:hidden">
        {navItems.map((item) => {
          const active = item.exact
            ? pathname === item.to
            : pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "whitespace-nowrap px-4 py-3 text-sm border-b-2 transition-colors",
                active
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {t(item.label)}
            </Link>
          );
        })}
      </nav>

      <main className="md:pl-60">
        <div className="mx-auto max-w-7xl p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
