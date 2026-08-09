import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatMeters, formatDateTime, formatDate } from "@/lib/format";
import { ArrowLeft, Trash2, Printer, CheckCircle2, AlertTriangle, Clock, Banknote, History, Undo2, Pencil, Plus, Percent } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { parseSaleNotes, formatSaleNotes, getDebtStatus, getRemainingDebt, getDebtProgress } from "@/lib/debt";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/sales/$id")({
  component: SaleDetail,
});

function SaleDetail() {
  const t = useT();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [updating, setUpdating] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [returnItem, setReturnItem] = useState<any | null>(null);
  const [returnMeters, setReturnMeters] = useState("");
  const [priceItem, setPriceItem] = useState<any | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addLine, setAddLine] = useState({ product_id: "", coil_id: "", meters: "", unit_price: "" });
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountValue, setDiscountValue] = useState("");

  const { data } = useQuery({
    queryKey: ["sales", id],
    queryFn: async () => {
      const [sale, items] = await Promise.all([
        supabase.from("sales").select("*").eq("id", id).single(),
        supabase.from("sale_items").select("*").eq("sale_id", id),
      ]);
      if (sale.error) throw sale.error;
      if (items.error) throw items.error;
      return { sale: sale.data, items: items.data };
    },
  });

  const { data: products } = useQuery({
    queryKey: ["cable_products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cable_products").select("*").order("brand");
      if (error) throw error;
      return data;
    },
  });

  const { data: allCoils } = useQuery({
    queryKey: ["cable_coils"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cable_coils").select("*").order("coil_number");
      if (error) throw error;
      return data;
    },
  });

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["sales", id] });
    qc.invalidateQueries({ queryKey: ["cable_products"] });
    qc.invalidateQueries({ queryKey: ["cable_coils"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  }

  /** Долг не может превышать новую сумму продажи — подгоняем статус после изменений */
  async function syncDebtAfterTotalChange() {
    const { data: fresh } = await supabase.from("sales").select("total, notes").eq("id", id).single();
    if (!fresh) return;
    const info = parseSaleNotes(fresh.notes);
    if (!info.is_debt) return;
    const total = Number(fresh.total);
    const paid = Math.min(info.paid_amount, total);
    const paidFlag = paid >= total;
    if (paid !== info.paid_amount || paidFlag !== info.is_paid) {
      info.paid_amount = paid;
      info.is_paid = paidFlag;
      await supabase.from("sales").update({ notes: formatSaleNotes(info) }).eq("id", id);
    }
  }

  async function handleReturn() {
    if (!returnItem) return;
    const m = Number(returnMeters);
    if (!m || m <= 0) return toast.error(t("Введите количество метров"));
    if (m > Number(returnItem.meters)) return toast.error(t("Больше, чем продано"));
    setUpdating(true);
    const { error } = await supabase.rpc("return_sale_item", {
      _sale_item_id: returnItem.id,
      _meters: m,
      _note: null,
    } as never);
    if (!error) await syncDebtAfterTotalChange();
    setUpdating(false);
    if (error) return toast.error(error.message);
    refreshAll();
    setReturnItem(null);
    setReturnMeters("");
    toast.success(t("Возврат оформлен, кабель вернулся на склад"));
  }

  async function handleSavePrice() {
    if (!priceItem) return;
    const p = Number(newPrice);
    if (isNaN(p) || p < 0) return toast.error(t("Некорректная цена"));
    setUpdating(true);
    const { error } = await supabase.rpc("set_sale_item_price", {
      _sale_item_id: priceItem.id,
      _unit_price: p,
    } as never);
    if (!error) await syncDebtAfterTotalChange();
    setUpdating(false);
    if (error) return toast.error(error.message);
    refreshAll();
    setPriceItem(null);
    toast.success(t("Цена изменена"));
  }

  async function handleSaveDiscount() {
    const d = Number(discountValue) || 0;
    if (d < 0) return toast.error(t("Некорректная скидка"));
    setUpdating(true);
    const { error } = await supabase.rpc("set_sale_discount", { _sale_id: id, _discount: d } as never);
    if (!error) await syncDebtAfterTotalChange();
    setUpdating(false);
    if (error) return toast.error(error.message);
    refreshAll();
    setDiscountOpen(false);
    toast.success(t("Скидка сохранена"));
  }

  async function handleAddItem() {
    const meters = Number(addLine.meters);
    if (!addLine.product_id) return toast.error(t("Выберите кабель"));
    if (!meters || meters <= 0) return toast.error(t("Введите количество метров"));
    const lineCoils = (allCoils ?? []).filter((c) => c.product_id === addLine.product_id);
    if (lineCoils.length > 0 && !addLine.coil_id) return toast.error(t("Выберите бухту, с которой уходит кабель"));
    setUpdating(true);
    const { error } = await supabase.rpc("add_sale_item", {
      _sale_id: id,
      _product_id: addLine.product_id,
      _coil_id: addLine.coil_id || null,
      _meters: meters,
      _unit_price: addLine.unit_price === "" ? null : Number(addLine.unit_price),
    } as never);
    if (!error) await syncDebtAfterTotalChange();
    setUpdating(false);
    if (error) return toast.error(error.message);
    refreshAll();
    setAddOpen(false);
    setAddLine({ product_id: "", coil_id: "", meters: "", unit_price: "" });
    toast.success(t("Позиция добавлена в продажу"));
  }

  async function handlePartialPayment() {
    if (!data?.sale) return;
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      return toast.error(t("Введите корректную сумму"));
    }

    const debtInfo = parseSaleNotes(data.sale.notes);
    const remaining = getRemainingDebt(debtInfo, Number(data.sale.total));

    if (amount > remaining) {
      return toast.error(t("Сумма больше остатка долга") + ` (${formatMoney(remaining)})`);
    }

    // Add the payment
    debtInfo.paid_amount = (debtInfo.paid_amount || 0) + amount;
    debtInfo.payments = [
      ...(debtInfo.payments || []),
      { amount, date: new Date().toISOString() },
    ];

    // Mark as fully paid if the debt is covered
    if (debtInfo.paid_amount >= Number(data.sale.total)) {
      debtInfo.is_paid = true;
    }

    setUpdating(true);
    const updatedNotes = formatSaleNotes(debtInfo);
    const { error } = await supabase
      .from("sales")
      .update({ notes: updatedNotes })
      .eq("id", id);
    setUpdating(false);

    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["sales", id] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });

    setPaymentDialogOpen(false);
    setPaymentAmount("");

    if (debtInfo.is_paid) {
      toast.success(t("Долг полностью погашен!"));
    } else {
      toast.success(t("Платёж внесён!") + ` ${formatMoney(amount)}`);
    }
  }

  function handleFillRemaining() {
    if (!data?.sale) return;
    const debtInfo = parseSaleNotes(data.sale.notes);
    const remaining = getRemainingDebt(debtInfo, Number(data.sale.total));
    setPaymentAmount(String(remaining));
  }

  async function handleDelete() {
    const items = data?.items ?? [];
    for (const it of items) {
      const { error } = await supabase.rpc("return_sale_item", {
        _sale_item_id: it.id,
        _meters: Number(it.meters),
        _note: `Отмена продажи ${id.slice(0, 8)}`,
      } as never);
      if (error) return toast.error(error.message);
    }
    const { error } = await supabase.from("sales").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refreshAll();
    toast.success(t("Продажа отменена, остатки возвращены"));
    navigate({ to: "/sales" });
  }

  if (!data) return <p className="text-sm text-muted-foreground">{t("Загрузка…")}</p>;
  const { sale, items } = data;
  const saleTotal = Number(sale.total);
  const profit = saleTotal - Number(sale.cost_total);
  const debtInfo = parseSaleNotes(sale.notes);
  const debtStatus = getDebtStatus(debtInfo, saleTotal);
  const remaining = getRemainingDebt(debtInfo, saleTotal);
  const progress = getDebtProgress(debtInfo, saleTotal);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to="/sales"><ArrowLeft className="mr-2 h-4 w-4" /> {t("К списку")}</Link>
        </Button>
        <div className="flex gap-2">
          {debtInfo.is_debt && !debtInfo.is_paid && (
            <Button
              variant="default"
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white font-medium"
              onClick={() => {
                setPaymentAmount("");
                setPaymentDialogOpen(true);
              }}
              disabled={updating}
            >
              <Banknote className="mr-2 h-4 w-4" /> {t("Внести оплату")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> {t("Печать")}
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Trash2 className="mr-2 h-4 w-4" /> {t("Отменить")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("Отменить продажу?")}</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">{t("Проданный кабель вернётся на склад.")}</p>
              <DialogFooter><Button variant="destructive" onClick={handleDelete}>{t("Отменить продажу")}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Debt status card */}
      {debtInfo.is_debt && (
        <Card className={
          debtInfo.is_paid
            ? "border-green-300 bg-green-50 dark:bg-green-950/20"
            : debtStatus.status === "overdue"
            ? "border-red-300 bg-red-50 dark:bg-red-950/20"
            : debtStatus.status === "partial"
            ? "border-blue-300 bg-blue-50 dark:bg-blue-950/20"
            : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
        }>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {debtInfo.is_paid ? (
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                ) : debtStatus.status === "overdue" ? (
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                ) : debtStatus.status === "partial" ? (
                  <Banknote className="h-6 w-6 text-blue-600" />
                ) : (
                  <Clock className="h-6 w-6 text-amber-600" />
                )}
                <div>
                  <div className="font-semibold">
                    {debtInfo.is_paid
                      ? t("Продажа была в долг — долг ПОГАШЕН")
                      : t("Продажа оформлена В ДОЛГ")}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t("Клиент")}: <span className="font-medium text-foreground">{sale.customer_name_snapshot ?? t("Без имени")}</span>
                    {debtInfo.due_date && (
                      <> · {t("Срок возврата")}: <span className="font-medium text-foreground">{formatDate(debtInfo.due_date)}</span></>
                    )}
                    {" "}({debtStatus.label})
                  </div>
                </div>
              </div>
              {!debtInfo.is_paid && (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => {
                    setPaymentAmount("");
                    setPaymentDialogOpen(true);
                  }}
                  disabled={updating}
                >
                  {t("Внести оплату")}
                </Button>
              )}
            </div>

            {/* Progress bar and amounts */}
            {!debtInfo.is_paid && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("Оплачено")}: <span className="font-medium text-foreground">{formatMoney(debtInfo.paid_amount)}</span></span>
                  <span className="text-muted-foreground">{t("Остаток")}: <span className="font-semibold text-foreground">{formatMoney(remaining)}</span></span>
                </div>
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${progress}%`,
                      background: progress > 0
                        ? "linear-gradient(90deg, #22c55e, #3b82f6)"
                        : "transparent",
                    }}
                  />
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  {Math.round(progress)}% {t("из")} {formatMoney(saleTotal)}
                </div>
              </div>
            )}

            {/* Fully paid summary */}
            {debtInfo.is_paid && debtInfo.payments.length > 0 && (
              <div className="text-sm text-muted-foreground">
                {t("Оплачено за")} {debtInfo.payments.length} {debtInfo.payments.length === 1 ? t("платёж") : t("платежей")} · {t("Итого")}: {formatMoney(debtInfo.paid_amount)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment history */}
      {debtInfo.is_debt && debtInfo.payments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" /> {t("История платежей")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-md border">
              {debtInfo.payments.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-xs font-semibold">
                      {idx + 1}
                    </div>
                    <span className="text-muted-foreground">{formatDateTime(p.date)}</span>
                  </div>
                  <span className="font-semibold text-green-700 dark:text-green-400">+{formatMoney(p.amount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h1 className="text-2xl font-semibold">{t("Продажа")}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(sale.sold_at)} · {sale.customer_name_snapshot ?? t("Без клиента")}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("Позиции")}</CardTitle>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => { setDiscountValue(String(Number((sale as any).discount ?? 0))); setDiscountOpen(true); }}>
              <Percent className="mr-2 h-4 w-4" /> {t("Скидка")}
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> {t("Добавить позицию")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Кабель")}</TableHead>
                <TableHead>{t("Бухта")}</TableHead>
                <TableHead className="text-right">{t("Метров")}</TableHead>
                <TableHead className="text-right">{t("Цена")}</TableHead>
                <TableHead className="text-right">{t("Сумма")}</TableHead>
                <TableHead className="text-right print:hidden">{t("Действия")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">{t("Все позиции возвращены")}</TableCell></TableRow>
              )}
              {items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.product_name_snapshot}</TableCell>
                  <TableCell className="text-muted-foreground">{(i as any).coil_number_snapshot || "—"}</TableCell>
                  <TableCell className="text-right">{formatMeters(i.meters)}</TableCell>
                  <TableCell className="text-right">{formatMoney(i.unit_price)}/м</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(i.line_total)}</TableCell>
                  <TableCell className="text-right print:hidden">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setPriceItem(i); setNewPrice(String(Number(i.unit_price))); }}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> {t("Цена")}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-amber-700 dark:text-amber-400" onClick={() => { setReturnItem(i); setReturnMeters(String(Number(i.meters))); }}>
                        <Undo2 className="mr-1 h-3.5 w-3.5" /> {t("Вернуть")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 space-y-1 border-t pt-4 text-right">
            <div className="text-sm text-muted-foreground">{t("Себестоимость")}: {formatMoney(sale.cost_total)}</div>
            {Number((sale as any).discount ?? 0) > 0 && (
              <div className="text-sm font-medium text-blue-600 dark:text-blue-400">{t("Скидка")}: −{formatMoney((sale as any).discount)}</div>
            )}
            <div className="text-sm text-muted-foreground">{t("Прибыль")}: {formatMoney(profit)}</div>
            <div className="text-xl font-semibold">{t("Итого")}: {formatMoney(sale.total)}</div>
          </div>
          {debtInfo.notes && (
            <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">{t("Заметка")}: {debtInfo.notes}</p>
          )}
        </CardContent>
      </Card>

      {/* Return dialog */}
      <Dialog open={!!returnItem} onOpenChange={(o) => !o && setReturnItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Undo2 className="h-5 w-5 text-amber-600" /> {t("Возврат позиции")}</DialogTitle></DialogHeader>
          {returnItem && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <div className="font-medium">{returnItem.product_name_snapshot}</div>
                <div className="text-muted-foreground">
                  {t("Продано")}: {formatMeters(returnItem.meters)}
                  {returnItem.coil_number_snapshot ? ` · ${t("Бухта")}: ${returnItem.coil_number_snapshot}` : ""}
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">{t("Сколько метров возвращает клиент")}</Label>
                <div className="mt-1 flex gap-2">
                  <Input type="number" step="0.01" min="0" max={Number(returnItem.meters)} value={returnMeters} onChange={(e) => setReturnMeters(e.target.value)} autoFocus />
                  <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" onClick={() => setReturnMeters(String(Number(returnItem.meters)))}>
                    {t("Всё")}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("Метры вернутся на склад и на ту же бухту.")}</p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReturnItem(null)}>{t("Отмена")}</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleReturn} disabled={updating}>{t("Оформить возврат")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price dialog */}
      <Dialog open={!!priceItem} onOpenChange={(o) => !o && setPriceItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("Изменить цену позиции")}</DialogTitle></DialogHeader>
          {priceItem && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {priceItem.product_name_snapshot} · {formatMeters(priceItem.meters)}
              </div>
              <div>
                <Label className="text-sm font-medium">{t("Цена сум/м")}</Label>
                <Input type="number" step="0.01" min="0" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} autoFocus />
              </div>
              <div className="text-sm">
                {t("Новая сумма")}: <span className="font-semibold">{formatMoney(Number(priceItem.meters) * (Number(newPrice) || 0))}</span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPriceItem(null)}>{t("Отмена")}</Button>
            <Button onClick={handleSavePrice} disabled={updating}>{t("Сохранить")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount dialog */}
      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-blue-600" /> {t("Скидка на продажу")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("Скидка вычитается из итоговой суммы. Долг клиента пересчитается автоматически.")}</p>
            <div>
              <Label className="text-sm font-medium">{t("Сумма скидки")}</Label>
              <Input type="number" step="0.01" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} autoFocus />
            </div>
            <div className="flex gap-2">
              {[5, 10, 15].map((pct) => (
                <Button key={pct} type="button" variant="outline" size="sm"
                  onClick={() => setDiscountValue(String(Math.round((items.reduce((s, i) => s + Number(i.line_total), 0) * pct) / 100)))}>
                  {pct}%
                </Button>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setDiscountValue("0")}>{t("Без скидки")}</Button>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDiscountOpen(false)}>{t("Отмена")}</Button>
            <Button onClick={handleSaveDiscount} disabled={updating}>{t("Сохранить")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add item dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("Добавить позицию в продажу")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("Кабель")}</Label>
              <Select
                value={addLine.product_id}
                onValueChange={(v) => {
                  const p = products?.find((x) => x.id === v);
                  setAddLine({ ...addLine, product_id: v, coil_id: "", unit_price: p ? String(p.sale_price) : "" });
                }}
              >
                <SelectTrigger><SelectValue placeholder={t("Выберите кабель")} /></SelectTrigger>
                <SelectContent>
                  {products?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.brand} {p.cross_section} · {formatMeters(p.stock_meters)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("Бухта")}</Label>
              <Select value={addLine.coil_id} onValueChange={(v) => setAddLine({ ...addLine, coil_id: v })} disabled={!addLine.product_id}>
                <SelectTrigger><SelectValue placeholder={t("Выберите бухту")} /></SelectTrigger>
                <SelectContent>
                  {(allCoils ?? []).filter((c) => c.product_id === addLine.product_id).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.coil_number} · {formatMeters(c.meters)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Метров")}</Label>
                <Input type="number" step="0.01" min="0" value={addLine.meters} onChange={(e) => setAddLine({ ...addLine, meters: e.target.value })} />
              </div>
              <div>
                <Label>{t("Цена сум/м")}</Label>
                <Input type="number" step="0.01" min="0" value={addLine.unit_price} onChange={(e) => setAddLine({ ...addLine, unit_price: e.target.value })} />
              </div>
            </div>
            <div className="text-right text-sm">
              {t("Сумма")}: <span className="font-semibold">{formatMoney((Number(addLine.meters) || 0) * (Number(addLine.unit_price) || 0))}</span>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t("Отмена")}</Button>
            <Button onClick={handleAddItem} disabled={updating}>{t("Добавить")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-green-600" />
              {t("Внести оплату по долгу")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("Общая сумма долга")}:</span>
                <span className="font-medium">{formatMoney(saleTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("Уже оплачено")}:</span>
                <span className="font-medium text-green-600">{formatMoney(debtInfo.paid_amount)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t pt-1">
                <span>{t("Остаток")}:</span>
                <span className="text-amber-600">{formatMoney(remaining)}</span>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">{t("Сумма платежа")}</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={remaining}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder={`${t("Максимум")}: ${remaining}`}
                  className="flex-1"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={handleFillRemaining}
                >
                  {t("Весь остаток")}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              {t("Отмена")}
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handlePartialPayment}
              disabled={updating || !paymentAmount || Number(paymentAmount) <= 0}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {t("Внести")} {paymentAmount ? formatMoney(Number(paymentAmount)) : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
