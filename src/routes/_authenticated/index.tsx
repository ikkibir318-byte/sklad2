import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney, formatMeters, formatQuantity, formatDateTime, formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { getProductUnit } from "@/lib/units";
import { Package, TrendingUp, AlertTriangle, HandCoins, Clock, CheckCircle2 } from "lucide-react";
import { parseSaleNotes, getDebtStatus, getRemainingDebt } from "@/lib/debt";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { isAdmin } from "@/routes/auth";

export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: async () => {
    if (typeof window !== "undefined" && !isAdmin()) {
      throw redirect({ to: "/inventory" });
    }
  },
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "КабельУчёт — склад, продажи и клиенты" },
      {
        name: "description",
        content:
          "Учёт кабельной продукции: остатки на складе, продажи, клиенты и аналитика прибыли за 30 дней.",
      },
      { property: "og:title", content: "КабельУчёт — склад, продажи и клиенты" },
      {
        property: "og:description",
        content:
          "Учёт кабельной продукции: остатки на складе, продажи, клиенты и аналитика прибыли.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Dashboard() {
  const t = useT();
  const { data: stats, isError, error } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const isoSince = since.toISOString();

      const [products, sales, lowStock, recentSales, allSales] = await Promise.all([
        supabase.from("cable_products").select("*"),
        supabase.from("sales").select("total, cost_total, sold_at").gte("sold_at", isoSince),
        supabase
          .from("cable_products")
          .select("*")
          .order("stock_meters", { ascending: true })
          .limit(5),
        supabase
          .from("sales")
          .select("id, total, sold_at, customer_name_snapshot, notes")
          .order("sold_at", { ascending: false })
          .limit(5),
        supabase
          .from("sales")
          .select("id, total, sold_at, customer_name_snapshot, notes")
          .ilike("notes", "%is_debt%")
          .order("sold_at", { ascending: false })
          .limit(250),
      ]);

      const totalStockMeters = (products.data ?? []).reduce((s, p) => {
        const isMeter = getProductUnit(p) === "meter";
        return s + (isMeter ? Number((p as any).stock_quantity ?? p.stock_meters ?? 0) : 0);
      }, 0);

      const stockValuePurchase = (products.data ?? []).reduce(
        (s, p) => s + Number((p as any).stock_quantity ?? p.stock_meters ?? 0) * Number(p.purchase_price ?? 0),
        0,
      );
      const stockValueSale = (products.data ?? []).reduce(
        (s, p) => s + Number((p as any).stock_quantity ?? p.stock_meters ?? 0) * Number(p.sale_price ?? 0),
        0,
      );
      const revenue30 = (sales.data ?? []).reduce((s, x) => s + Number(x.total), 0);
      const profit30 = (sales.data ?? []).reduce(
        (s, x) => s + Number(x.total) - Number(x.cost_total),
        0,
      );

      // Process debt sales
      const activeDebts = (allSales.data ?? [])
        .map((s) => {
          const debtInfo = parseSaleNotes(s.notes);
          const saleTotal = Number(s.total);
          const debtStatus = getDebtStatus(debtInfo, saleTotal);
          const remainingDebt = getRemainingDebt(debtInfo, saleTotal);
          return {
            ...s,
            debtInfo,
            debtStatus,
            remainingDebt,
          };
        })
        .filter((s) => s.debtInfo.is_debt && !s.debtInfo.is_paid);

      const totalDebtAmount = activeDebts.reduce((sum, s) => sum + s.remainingDebt, 0);

      // Group by day
      const byDay = new Map<string, number>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        byDay.set(d.toISOString().slice(0, 10), 0);
      }
      for (const s of sales.data ?? []) {
        const k = new Date(s.sold_at).toISOString().slice(0, 10);
        byDay.set(k, (byDay.get(k) ?? 0) + Number(s.total));
      }
      const chart = Array.from(byDay.entries()).map(([date, total]) => ({
        date: date.slice(5),
        total,
      }));

      const lowStockItems = (lowStock.data ?? []).filter(
        (p) => Number((p as any).stock_quantity ?? p.stock_meters ?? 0) <= Number(p.low_stock_threshold ?? 0),
      );

      return {
        productCount: products.data?.length ?? 0,
        totalStockMeters,
        stockValuePurchase,
        stockValueSale,
        revenue30,
        profit30,
        salesCount30: sales.data?.length ?? 0,
        chart,
        lowStockItems,
        recentSales: recentSales.data ?? [],
        activeDebts,
        totalDebtAmount,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("Дашборд")}</h1>
          <p className="text-sm text-muted-foreground">{t("Ключевые показатели и напоминания")}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/inventory/new">{t("Добавить позицию")}</Link>
          </Button>
          <Button asChild>
            <Link to="/sales/new">{t("Новая продажа")}</Link>
          </Button>
        </div>
      </div>

      {isError && (
        <Card className="border-red-300 bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-300">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">{t("Ошибка подключения к серверу или базе данных Supabase")}</div>
              <div className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                {(error as Error)?.message} — {t("проверьте настройки сети или VITE_SUPABASE_URL в файле .env.")}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label={t("Выручка (30 дн)")}
          value={formatMoney(stats?.revenue30 ?? 0)}
          sub={`${t("Прибыль")}: ${formatMoney(stats?.profit30 ?? 0)}`}
        />
        <StatCard
          icon={<HandCoins className="h-4 w-4 text-amber-500" />}
          label={t("Долги клиентов")}
          value={formatMoney(stats?.totalDebtAmount ?? 0)}
          sub={`${stats?.activeDebts.length ?? 0} ${t("непогашенных долгов")}`}
          highlight={Boolean(stats && stats.totalDebtAmount > 0)}
        />
        <StatCard
          icon={<Package className="h-4 w-4" />}
          label={t("На складе")}
          value={formatMeters(stats?.totalStockMeters ?? 0)}
          sub={`${stats?.productCount ?? 0} ${t("позиций")}`}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label={t("Стоимость склада")}
          value={formatMoney(stats?.stockValueSale ?? 0)}
          sub={`${t("Закуп")}: ${formatMoney(stats?.stockValuePurchase ?? 0)}`}
        />
      </div>

      {/* Блок долгов и напоминаний */}
      <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/10">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-lg">
            <HandCoins className="h-5 w-5 text-amber-600" />
            {t("Долги и напоминания о возврате")}
            {stats && stats.activeDebts.length > 0 && (
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100">
                {stats.activeDebts.length}
              </span>
            )}
          </CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/sales">{t("Все продажи")}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!stats || stats.activeDebts.length === 0 ? (
            <div className="flex items-center gap-2 py-2 text-sm text-green-700 dark:text-green-400 font-medium">
              <CheckCircle2 className="h-5 w-5" />
              {t("Отлично! Все долги погашены, просрочек нет.")}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t("Клиенты, которым товар был отдан в долг. Автоматическое напоминание о сроках:")}
              </p>
              <div className="divide-y rounded-md border bg-background">
                {stats.activeDebts.map((s) => (
                  <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-2 text-sm">
                    <div className="space-y-0.5">
                      <Link to="/sales/$id" params={{ id: s.id }} className="font-semibold hover:underline flex items-center gap-2">
                        <span>{s.customer_name_snapshot ?? t("Без имени")}</span>
                        <span className="text-muted-foreground text-xs font-normal">({formatDateTime(s.sold_at)})</span>
                      </Link>
                      {s.debtInfo.due_date && (
                        <div className="text-xs text-muted-foreground">
                          {t("Число/срок возврата")}: <span className="font-medium">{formatDate(s.debtInfo.due_date)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 justify-between sm:justify-end">
                      <span className="font-semibold text-base">{formatMoney(s.remainingDebt)}</span>
                      {s.debtInfo.paid_amount > 0 && (
                        <span className="text-xs text-green-600 dark:text-green-400">
                          (оплачено {formatMoney(s.debtInfo.paid_amount)} из {formatMoney(s.total)})
                        </span>
                      )}
                      {s.debtStatus.status === "overdue" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/60 px-2.5 py-1 rounded-full border border-red-300">
                          <AlertTriangle className="h-3.5 w-3.5" /> {s.debtStatus.label}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2.5 py-1 rounded-full border border-amber-300">
                          <Clock className="h-3.5 w-3.5" /> {s.debtStatus.label}
                        </span>
                      )}
                      <Button asChild size="sm" variant="outline" className="h-8">
                        <Link to="/sales/$id" params={{ id: s.id }}>{t("Посмотреть / Погасить")}</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Продажи за 30 дней")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats?.chart ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> {t("Заканчивается")}
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/inventory">{t("Весь склад")}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats && stats.lowStockItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Всё в норме.")}</p>
            ) : (
              <ul className="divide-y">
                {stats?.lowStockItems.map((p) => {
                  const qty = Number((p as any).stock_quantity ?? p.stock_meters ?? 0);
                  const unit = getProductUnit(p);
                  return (
                    <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                      <Link to="/inventory/$id" params={{ id: p.id }} className="hover:underline">
                        {p.brand} {p.cross_section && p.cross_section !== "-" ? p.cross_section : ""}
                      </Link>
                      <span className="font-medium text-amber-600">{formatQuantity(qty, unit)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("Последние продажи")}</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/sales">{t("Все продажи")}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats && stats.recentSales.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Пока пусто.")}</p>
            ) : (
              <ul className="divide-y">
                {stats?.recentSales.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                    <Link to="/sales/$id" params={{ id: s.id }} className="hover:underline">
                      <div>{s.customer_name_snapshot ?? t("Без клиента")}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(s.sold_at)}</div>
                    </Link>
                    <span className="font-medium">{formatMoney(s.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/20" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
