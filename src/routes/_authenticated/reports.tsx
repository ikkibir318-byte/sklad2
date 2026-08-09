import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, formatMeters } from "@/lib/format";
import { useT } from "@/lib/i18n";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/reports")({
  component: Reports,
});

function Reports() {
  const t = useT();
  const [range, setRange] = useState<"7" | "30" | "90" | "365">("30");

  const { data } = useQuery({
    queryKey: ["reports", range],
    queryFn: async () => {
      const days = Number(range);
      const since = new Date();
      since.setDate(since.getDate() - days);
      const iso = since.toISOString();

      const [sales, items] = await Promise.all([
        supabase.from("sales").select("id, total, cost_total, customer_name_snapshot, sold_at").gte("sold_at", iso),
        supabase.from("sale_items").select("product_name_snapshot, meters, line_total, sale_id, created_at").gte("created_at", iso),
      ]);

      const totalRevenue = (sales.data ?? []).reduce((s, x) => s + Number(x.total), 0);
      const totalProfit = (sales.data ?? []).reduce((s, x) => s + Number(x.total) - Number(x.cost_total), 0);

      // Top customers
      const byCustomer = new Map<string, number>();
      for (const s of sales.data ?? []) {
        const k = s.customer_name_snapshot ?? t("Без клиента");
        byCustomer.set(k, (byCustomer.get(k) ?? 0) + Number(s.total));
      }
      const topCustomers = Array.from(byCustomer.entries())
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      // Top products
      const byProduct = new Map<string, { meters: number; total: number }>();
      for (const i of items.data ?? []) {
        const k = i.product_name_snapshot;
        const cur = byProduct.get(k) ?? { meters: 0, total: 0 };
        cur.meters += Number(i.meters);
        cur.total += Number(i.line_total);
        byProduct.set(k, cur);
      }
      const topProducts = Array.from(byProduct.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      return { totalRevenue, totalProfit, salesCount: sales.data?.length ?? 0, topCustomers, topProducts };
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t("Отчёты")}</h1>
          <p className="text-sm text-muted-foreground">{t("Аналитика продаж")}</p>
        </div>
        <div className="w-40">
          <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t("7 дней")}</SelectItem>
              <SelectItem value="30">{t("30 дней")}</SelectItem>
              <SelectItem value="90">{t("90 дней")}</SelectItem>
              <SelectItem value="365">{t("Год")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">{t("Выручка")}</div>
          <div className="mt-1 text-2xl font-semibold">{formatMoney(data?.totalRevenue ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">{t("Прибыль")}</div>
          <div className="mt-1 text-2xl font-semibold">{formatMoney(data?.totalProfit ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">{t("Продаж")}</div>
          <div className="mt-1 text-2xl font-semibold">{data?.salesCount ?? 0}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("Топ клиентов")}</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.topCustomers ?? []} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tickFormatter={(v) => formatMoney(v)} className="text-xs" />
                <YAxis type="category" dataKey="name" width={140} className="text-xs" />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Bar dataKey="total" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("Топ марок кабеля")}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(data?.topProducts ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("Нет данных за период")}</p>}
            {(data?.topProducts ?? []).map((p) => (
              <div key={p.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">{formatMeters(p.meters)} · {formatMoney(p.total)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
