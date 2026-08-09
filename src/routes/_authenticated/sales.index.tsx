import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, formatDateTime, formatDate } from "@/lib/format";
import { Plus, Clock, AlertTriangle, CheckCircle2, Banknote } from "lucide-react";
import { useT } from "@/lib/i18n";
import { parseSaleNotes, getDebtStatus, getRemainingDebt } from "@/lib/debt";

export const Route = createFileRoute("/_authenticated/sales/")({
  component: SalesList,
});

function SalesList() {
  const t = useT();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, customer_name_snapshot, total, sold_at, notes")
        .order("sold_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("Продажи")}</h1>
          <p className="text-sm text-muted-foreground">{t("История всех продаж")}</p>
        </div>
        <Button asChild>
          <Link to="/sales/new"><Plus className="mr-2 h-4 w-4" /> {t("Новая продажа")}</Link>
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Дата")}</TableHead>
                <TableHead>{t("Клиент")}</TableHead>
                <TableHead>{t("Оплата / Долг")}</TableHead>
                <TableHead className="text-right">{t("Сумма")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t("Загрузка…")}</TableCell></TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-destructive py-8 space-y-1">
                    <div>{t("Ошибка подключения к серверу или базе данных.")}</div>
                    <div className="text-xs text-muted-foreground">{(error as Error)?.message}</div>
                  </TableCell>
                </TableRow>
              ) : (data ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  {t("Пусто.")} <Link to="/sales/new" className="underline">{t("Оформить продажу")}</Link>
                </TableCell></TableRow>
              ) : data?.map((s) => {
                const debtInfo = parseSaleNotes(s.notes);
                const saleTotal = Number(s.total);
                const debtStatus = getDebtStatus(debtInfo, saleTotal);
                const remaining = getRemainingDebt(debtInfo, saleTotal);

                return (
                  <TableRow key={s.id}>
                    <TableCell><Link to="/sales/$id" params={{ id: s.id }} className="hover:underline font-medium">{formatDateTime(s.sold_at)}</Link></TableCell>
                    <TableCell>{s.customer_name_snapshot ?? "—"}</TableCell>
                    <TableCell>
                      {!debtInfo.is_debt ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {t("Оплачено")}
                        </span>
                      ) : debtInfo.is_paid ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-2.5 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" /> {t("Долг погашен")}
                        </span>
                      ) : debtStatus.status === "partial" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-2.5 py-0.5 rounded-full">
                          <Banknote className="h-3 w-3" /> {debtStatus.label}
                          <span className="text-muted-foreground ml-1">({t("Ост")}: {formatMoney(remaining)})</span>
                        </span>
                      ) : debtStatus.status === "overdue" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-2.5 py-0.5 rounded-full">
                          <AlertTriangle className="h-3 w-3" /> {t("В долг")} ({debtStatus.label})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-2.5 py-0.5 rounded-full">
                          <Clock className="h-3 w-3" /> {t("В долг")} {debtInfo.due_date ? `(до ${formatDate(debtInfo.due_date)})` : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatMoney(s.total)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
