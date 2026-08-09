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
import { formatMoney, formatMeters } from "@/lib/format";
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

    const items = lines
      .filter((l) => l.product_id && Number(l.meters) > 0)
      .map((l) => ({
        product_id: l.product_id,
        coil_id: l.coil_id || null,
        meters: Number(l.meters),
        unit_price: Number(l.unit_price) || 0,
      }));
    if (items.length === 0) return toast.error(t("Добавьте хотя бы одну позицию"));

    for (const l of lines) {
      if (!l.product_id || !(Number(l.meters) > 0)) continue;
      const available = coilsFor(l.product_id);
      if (available.length > 0 && !l.coil_id) {
        return toast.error(t("Выберите бухту, с которой уходит кабель"));
      }
      const coil = available.find((c) => c.id === l.coil_id);
      if (coil && Number(l.meters) > Number(coil.meters)) {
        return toast.error(`${t("На бухте")} ${coil.coil_number} ${t("только")} ${formatMeters(coil.meters)}`);
      }
    }

    const formattedNotes = formatSaleNotes({
      is_debt: isDebt,
      due_date: isDebt ? dueDate : null,
      is_paid: false,
      notes: notes.trim(),
      paid_amount: 0,
      payments: [],
    });

    setSaving(true);
    const { data, error } = await supabase.rpc("create_sale", {
      _customer_id: customerId || null,
      _notes: formattedNotes || null,
      _items: items,
    } as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["cable_products"] });
    qc.invalidateQueries({ queryKey: ["cable_coils"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    toast.success(isDebt ? t("Продажа оформлена в долг!") : t("Продажа проведена"));
    navigate({ to: "/sales/$id", params: { id: data as string } });
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/sales"><ArrowLeft className="mr-2 h-4 w-4" /> {t("К списку")}</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold">{t("Новая продажа")}</h1>
        <p className="text-sm text-muted-foreground">{t("Оформите продажу и обновите остатки")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle>{t("Клиент и способ оплаты")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{t("Клиент")} {isDebt && <span className="text-destructive">*</span>}</Label>
              <div className="flex gap-2">
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder={t("Без клиента")} /></SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
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
                  <p className="text-xs text-muted-foreground">{t("Включите, если отдаете кабель под запись/долг с датой возврата")}</p>
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
                  <Label className="text-sm font-medium">{t("Дата (число) возврата долга")} <span className="text-destructive">*</span></Label>
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
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Дополнительные заметки...")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("Позиции")}</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: crypto.randomUUID(), product_id: "", coil_id: "", meters: "", unit_price: "" }])}>
              <Plus className="mr-2 h-4 w-4" /> {t("Строка")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.map((line, idx) => {
              const prod = products?.find((p) => p.id === line.product_id);
              const meters = Number(line.meters) || 0;
              const price = Number(line.unit_price) || 0;
              const lineCoils = coilsFor(line.product_id);
              const selectedCoil = lineCoils.find((c) => c.id === line.coil_id);
              return (
                <div key={line.key} className="grid gap-2 rounded-md border p-3 md:grid-cols-12 md:items-end">
                  <div className="md:col-span-4">
                    <Label>{`${t("Кабель")} #${idx + 1}`}</Label>
                    <Select value={line.product_id} onValueChange={(v) => updateLine(line.key, { product_id: v })}>
                      <SelectTrigger><SelectValue placeholder={t("Выберите кабель")} /></SelectTrigger>
                      <SelectContent>
                        {products?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.brand} {p.cross_section} · {formatMeters(p.stock_meters)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-3">
                    <Label>{t("Бухта")}</Label>
                    <Select value={line.coil_id} onValueChange={(v) => updateLine(line.key, { coil_id: v })} disabled={!line.product_id}>
                      <SelectTrigger>
                        <SelectValue placeholder={lineCoils.length === 0 ? t("Нет бухт") : t("Выберите бухту")} />
                      </SelectTrigger>
                      <SelectContent>
                        {lineCoils.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.coil_number} · {formatMeters(c.meters)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>{t("Метров")}</Label>
                    <Input type="number" step="0.01" min="0" value={line.meters} onChange={(e) => updateLine(line.key, { meters: e.target.value })} />
                    {selectedCoil && meters > Number(selectedCoil.meters) ? (
                      <p className="mt-1 text-xs text-destructive">{t("Больше, чем на бухте")}</p>
                    ) : prod && meters > Number(prod.stock_meters) ? (
                      <p className="mt-1 text-xs text-destructive">{t("Больше остатка")}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-1">
                    <Label>{t("Цена сум/м")}</Label>
                    <Input type="number" step="0.01" min="0" value={line.unit_price} onChange={(e) => updateLine(line.key, { unit_price: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>{t("Сумма")}</Label>
                    <div className="h-10 flex items-center px-3 text-sm font-medium">{formatMoney(meters * price)}</div>
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))} disabled={lines.length === 1}>
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
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/sales" })}>{t("Отмена")}</Button>
          <Button type="submit" disabled={saving}>{t("Провести продажу")}</Button>
        </div>
      </form>

      <Dialog open={customerOpen} onOpenChange={setCustomerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Новый клиент")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("Имя / компания *")}</Label><Input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} /></div>
            <div><Label>{t("Телефон")}</Label><Input value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} /></div>
            <div><Label>{t("Комментарий")}</Label><Textarea value={newCustomer.notes} onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCustomerOpen(false)}>{t("Отмена")}</Button>
            <Button type="button" onClick={handleCreateCustomer} disabled={creatingCustomer}>{t("Сохранить и выбрать")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
