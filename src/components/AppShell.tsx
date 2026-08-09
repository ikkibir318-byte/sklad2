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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SESSION_KEY = "kabeluchet_authed";

const navItems = [
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

  function handleSignOut() {
    sessionStorage.removeItem(SESSION_KEY);
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-background md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Cable className="h-6 w-6 text-primary" />
          <span className="font-semibold">КабельУчёт</span>
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
                    ? "bg-primary text-primary-foreground"
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
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> {t("Выйти")}
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
        <div className="flex items-center gap-2">
          <Cable className="h-5 w-5 text-primary" />
          <span className="font-semibold">КабельУчёт</span>
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
                  ? "border-primary text-foreground"
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
