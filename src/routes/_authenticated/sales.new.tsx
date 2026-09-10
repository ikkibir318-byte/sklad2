import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatMoney, formatQuantity } from "@/lib/format";
import { unitInputLabel, unitShort, unitStep, getProductUnit } from "@/lib/units";
import { ArrowLeft, Plus, Trash2, UserPlus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatSaleNotes } from "@/lib/debt";

export const Route = createFileRoute("/_authenticated/sales/new")({
  component: NewSale,
});

type Line = {
  key: string;
  product_id: string;
  coil_id: string;
  meters: string;
  unit_price: string;
};

function NewSale() {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ["cable_products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cable_products").select("*").order("brand");
      if (error) throw error;
      return data;
    },
  });
  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: allCoils } = useQuery({
    queryKey: ["cable_coils"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cable_coils")
        .select("*")
        .order("coil_number");
      if (error) throw error;
      return data;
    },
  });

  const [customerId, setCustomerId] = useState<string>("");
  const [isDebt, setIsDebt] = useState<boolean>(false);
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { key: crypto.randomUUID(), product_id: "", coil_id: "", meters: "", unit_price: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", notes: "" });
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  async function handleCreateCustomer() {
    if (!newCustomer.name.trim()) return toast.error(t("Укажите имя клиента"));
    setCreatingCustomer(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim() || null,
        notes: newCustomer.notes.trim() || null,
        created_by: u.user?.id ?? null,
      })
      .select("id, name")
      .single();
    setCreatingCustomer(false);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["customers"] });
    setCustomerId(data.id);
    setNewCustomer({ name: "", phone: "", notes: "" });
    setCustomerOpen(false);
    toast.success(t("Клиент добавлен и выбран"));
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.product_id) {
          const p = products?.find((x) => x.id === patch.product_id);
          if (p && !next.unit_price) next.unit_price = String(p.sale_price);
          if (patch.product_id !== l.product_id) next.coil_id = "";
        }
        return next;
      }),
    );
  }

  function coilsFor(productId: string) {
    return (allCoils ?? []).filter((c) => c.product_id === productId);
  }

  const total = lines.reduce((s, l) => s + (Number(l.meters) || 0) * (Number(l.unit_price) || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isDebt && !customerId) {
      return toast.error(t("Для продажи в долг обязательно укажите клиента"));
    }
    if (isDebt && !dueDate) {
      return toast.error(t("Укажите дату (число) возврата долга"));
    }

    const validLines = lines.filter((l) => l.product_id && Number(l.meters) > 0);
    if (validLines.length === 0) return toast.error(t("Добавьте хотя бы одну позицию"));

    for (const l of validLines) {
      const product = products?.find((p) => p.id === l.product_id);
      const unit = getProductUnit(product);
      const available = unit === "meter" ? coilsFor(l.product_id) : [];
      if (unit === "meter" && available.length > 0 && !l.coil_id) {
        return toast.error(t("Выберите бухту, с которой уходит кабель"));
      }
      const coil = available.find((c) => c.id === l.coil_id);
      if (coil && Number(l.meters) > Number(coil.meters)) {
        return toast.error(`${t("На бухте")} ${coil.coil_number} ${t("только")} ${formatQuantity(coil.meters, "meter")}`);
      }
      const currentStock = Number((product as any)?.stock_quantity ?? product?.stock_meters ?? 0);
      if (Number(l.meters) > currentStock) {
        return toast.error(`${t("Недостаточно товара на складе")} (${product?.brand}: ${formatQuantity(currentStock, unit)})`);
      }
    }

    const items = validLines.map((l) => {
      const prod = products?.find((p) => p.id === l.product_id);
      const unit = getProductUnit(prod);
      const qty = Number(l.meters);
      return {
        product_id: l.product_id,
        coil_id: l.coil_id || null,
        meters: qty,
        quantity: qty,
        unit_type: unit,
        unit_price: Number(l.unit_price) || Number(prod?.sale_price ?? 0),
      };
    });

    const formattedNotes = formatSaleNotes({
      is_debt: isDebt,
      due_date: isDebt ? dueDate : null,
      is_paid: false,
      notes: notes.trim(),
      paid_amount: 0,
      payments: [],
    });

    setSaving(true);
    let finalSaleId: string | null = null;

    try {
      const { data: rpcSaleId, error: rpcErr } = await (supabase as any).rpc("create_sale", {
        _customer_id: customerId || null,
        _notes: formattedNotes || null,
        _items: items,
      });

      if (!rpcErr && rpcSaleId) {
        finalSaleId = rpcSaleId;
      } else {
        // Fallback to direct client transactions if RPC has constraints/issues
        const { data: userData } = await supabase.auth.getUser();
        const selectedCustomer = customers?.find((c) => c.id === customerId);

        const { data: createdSale, error: saleErr } = await (supabase as any)
          .from("sales")
          .insert({
            customer_id: customerId || null,
            customer_name_snapshot: selectedCustomer?.name ?? null,
            notes: formattedNotes || null,
            total: 0,
            cost_total: 0,
          })
          .select("id")
          .single();

        if (saleErr) throw saleErr;
        finalSaleId = createdSale.id;

        let saleTotal = 0;
        let saleCostTotal = 0;

        for (const it of items) {
          const prod = products?.find((p) => p.id === it.product_id);
          const unit = getProductUnit(prod);
          const isMeter = unit === "meter";
          const unitPrice = it.unit_price || Number(prod?.sale_price ?? 0);
          const purchasePrice = Number(prod?.purchase_price ?? 0);
          const lineTotal = it.quantity * unitPrice;
          const currentQty = Number((prod as any)?.stock_quantity ?? prod?.stock_meters ?? 0);
          const newQty = Math.max(0, currentQty - it.quantity);
          const prodName = `${prod?.brand ?? ""}${prod?.cross_section && prod.cross_section !== "-" ? ` ${prod.cross_section}` : ""}`.trim();

          let coilNumberSnapshot: string | null = null;
          if (isMeter && it.coil_id) {
            const coil = allCoils?.find((c) => c.id === it.coil_id);
            if (coil) {
              coilNumberSnapshot = coil.coil_number;
              const newCoilMeters = Math.max(0, Number(coil.meters) - it.quantity);
              await (supabase as any)
                .from("cable_coils")
                .update({ meters: newCoilMeters, updated_at: new Date().toISOString() })
                .eq("id", it.coil_id);
            }
          }

          let itemRes = await (supabase as any).from("sale_items").insert({
            sale_id: finalSaleId,
            product_id: it.product_id,
            product_name_snapshot: prodName,
            meters: it.quantity,
            quantity: it.quantity,
            unit_type: unit,
            unit_price: unitPrice,
            unit_cost: purchasePrice,
            line_total: lineTotal,
            coil_id: it.coil_id || null,
            coil_number_snapshot: coilNumberSnapshot,
          });

          if (
            itemRes.error &&
            (itemRes.error.message?.includes("schema cache") ||
              itemRes.error.code === "PGRST204" ||
              itemRes.error.message?.includes("column"))
          ) {
            await (supabase as any).from("sale_items").insert({
              sale_id: finalSaleId,
              product_id: it.product_id,
              product_name_snapshot: prodName,
              meters: it.quantity,
              unit_price: unitPrice,
              unit_cost: purchasePrice,
              line_total: lineTotal,
              coil_id: it.coil_id || null,
              coil_number_snapshot: coilNumberSnapshot,
            });
          }

          let prodUpd = await (supabase as any)
            .from("cable_products")
            .update({
              stock_quantity: newQty,
              stock_meters: newQty,
              updated_at: new Date().toISOString(),
            })
            .eq("id", it.product_id);

          if (
            prodUpd.error &&
            (prodUpd.error.message?.includes("schema cache") ||
              prodUpd.error.code === "PGRST204" ||
              prodUpd.error.message?.includes("column"))
          ) {
            await (supabase as any)
              .from("cable_products")
              .update({
                stock_meters: newQty,
                updated_at: new Date().toISOString(),
              })
              .eq("id", it.product_id);
          }

          let movRes = await (supabase as any).from("stock_movements").insert({
            product_id: it.product_id,
            sale_id: finalSaleId,
            kind: "sale",
            change_meters: -it.quantity,
            change_quantity: -it.quantity,
            note: t("Продажа"),
            created_by: userData.user?.id ?? null,
          });

          if (
            movRes.error &&
            (movRes.error.message?.includes("schema cache") ||
              movRes.error.code === "PGRST204" ||
              movRes.error.message?.includes("column"))
          ) {
            await (supabase as any).from("stock_movements").insert({
              product_id: it.product_id,
              sale_id: finalSaleId,
              kind: "sale",
              change_meters: -it.quantity,
              note: t("Продажа"),
              created_by: userData.user?.id ?? null,
            });
          }

          saleTotal += lineTotal;
          saleCostTotal += it.quantity * purchasePrice;
        }

        await (supabase as any)
          .from("sales")
          .update({ total: saleTotal, cost_total: saleCostTotal })
          .eq("id", finalSaleId);
      }

      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["cable_products"] });
      qc.invalidateQueries({ queryKey: ["cable_coils"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(isDebt ? t("Продажа оформлена в долг!") : t("Продажа проведена"));
      if (finalSaleId) {
        navigate({ to: "/sales/$id", params: { id: finalSaleId } });
      } else {
        navigate({ to: "/sales" });
      }
    } catch (err: any) {
      toast.error(err.message || t("Ошибка проведения продажи"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/sales">
          <ArrowLeft className="mr-2 h-4 w-4" /> {t("К списку")}
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold">{t("Новая продажа")}</h1>
        <p className="text-sm text-muted-foreground">{t("Оформите продажу и обновите остатки")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("Клиент и способ оплаты")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>
                {t("Клиент")} {isDebt && <span className="text-destructive">*</span>}
              </Label>
              <div className="flex gap-2">
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t("Без клиента")} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => setCustomerOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" /> {t("Новый клиент")}
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Выберите клиента из списка или добавьте нового прямо здесь.")}
              </p>
            </div>

            {/* В долг / Оплата */}
            <div className="rounded-lg border p-4 bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold cursor-pointer">{t("Оформить продажу в долг")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("Включите, если отдаете кабель под запись/долг с датой возврата")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={isDebt ? "default" : "outline"}
                  className={isDebt ? "bg-amber-600 hover:bg-amber-700 text-white font-medium" : ""}
                  onClick={() => setIsDebt(!isDebt)}
                >
                  {isDebt ? t("✓ В долг (активно)") : t("Отдать в долг")}
                </Button>
              </div>

              {isDebt && (
                <div className="pt-2 border-t space-y-2">
                  <Label className="text-sm font-medium">
                    {t("Дата (число) возврата долга")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="max-w-xs border-amber-400 focus-visible:ring-amber-500"
                  />
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    {t("Напоминание об этом долге отобразится на главном дашборде.")}
                  </p>
                </div>
              )}
            </div>

            <div>
              <Label>{t("Комментарий")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("Дополнительные заметки...")}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("Позиции")}</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLines((ls) => [
                  ...ls,
                  { key: crypto.randomUUID(), product_id: "", coil_id: "", meters: "", unit_price: "" },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" /> {t("Строка")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.map((line, idx) => {
              const prod = products?.find((p) => p.id === line.product_id);
              const meters = Number(line.meters) || 0;
              const price = Number(line.unit_price) || 0;
              const unit = getProductUnit(prod);
              const productQuantity = Number((prod as any)?.stock_quantity ?? prod?.stock_meters ?? 0);
              const lineCoils = unit === "meter" ? coilsFor(line.product_id) : [];
              const selectedCoil = lineCoils.find((c) => c.id === line.coil_id);
              return (
                <div key={line.key} className="grid gap-2 rounded-md border p-3 md:grid-cols-12 md:items-end">
                  <div className={unit === "meter" ? "md:col-span-4" : "md:col-span-5"}>
                    <Label>{`${t("Товар")} #${idx + 1}`}</Label>
                    <Select value={line.product_id} onValueChange={(v) => updateLine(line.key, { product_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("Выберите товар")} />
                      </SelectTrigger>
                      <SelectContent>
                        {products?.map((p) => {
                          const pUnit = getProductUnit(p);
                          return (
                            <SelectItem key={p.id} value={p.id}>
                              {p.brand}
                              {p.cross_section && p.cross_section !== "-" ? ` ${p.cross_section}` : ""} ·{" "}
                              {formatQuantity(
                                (p as any).stock_quantity ?? p.stock_meters,
                                pUnit,
                              )}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  {unit === "meter" && (
                    <div className="md:col-span-3">
                      <Label>{t("Бухта")}</Label>
                      <Select
                        value={line.coil_id}
                        onValueChange={(v) => updateLine(line.key, { coil_id: v })}
                        disabled={!line.product_id}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={lineCoils.length === 0 ? t("Нет бухт") : t("Выберите бухту")} />
                        </SelectTrigger>
                        <SelectContent>
                          {lineCoils.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.coil_number} · {formatQuantity(c.meters, "meter")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className={unit === "meter" ? "md:col-span-2" : "md:col-span-3"}>
                    <Label>{unitInputLabel(unit)}</Label>
                    <Input
                      type="number"
                      step={unitStep(unit)}
                      min="0"
                      value={line.meters}
                      onChange={(e) => updateLine(line.key, { meters: e.target.value })}
                    />
                    {selectedCoil && meters > Number(selectedCoil.meters) ? (
                      <p className="mt-1 text-xs text-destructive">{t("Больше, чем на бухте")}</p>
                    ) : prod && meters > productQuantity ? (
                      <p className="mt-1 text-xs text-destructive">{t("Больше остатка")}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-2">
                    <Label>{t("Цена")}, сум/{unitShort(unit)}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.unit_price}
                      onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <Label>{t("Сумма")}</Label>
                    <div className="h-10 flex items-center px-1 text-sm font-medium">{formatMoney(meters * price)}</div>
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-end border-t pt-3 text-lg font-semibold">
              {t("Итого")}: {formatMoney(total)}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/sales" })}>
            {t("Отмена")}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? t("Сохранение…") : t("Провести продажу")}
          </Button>
        </div>
      </form>

      <Dialog open={customerOpen} onOpenChange={setCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Новый клиент")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("Имя / компания *")}</Label>
              <Input
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("Телефон")}</Label>
              <Input
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("Комментарий")}</Label>
              <Textarea
                value={newCustomer.notes}
                onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCustomerOpen(false)}>
              {t("Отмена")}
            </Button>
            <Button type="button" onClick={handleCreateCustomer} disabled={creatingCustomer}>
              {creatingCustomer ? t("Сохранение…") : t("Сохранить и выбрать")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
