import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { Plus, Trash2 } from "lucide-react";
import { formatMeters } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory/new")({
  component: NewCable,
});

type CoilRow = { key: string; coil_number: string; meters: string };

function NewCable() {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    brand: "",
    cross_section: "",
    supplier: "",
    batch: "",
    purchase_price: "",
    sale_price: "",
    low_stock_threshold: "",
    notes: "",
  });
  const [coils, setCoils] = useState<CoilRow[]>([
    { key: crypto.randomUUID(), coil_number: "1", meters: "" },
  ]);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function updateCoil(key: string, patch: Partial<CoilRow>) {
    setCoils((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function addCoil() {
    setCoils((cs) => [
      ...cs,
      { key: crypto.randomUUID(), coil_number: String(cs.length + 1), meters: "" },
    ]);
  }

  const totalMeters = coils.reduce((s, c) => s + (Number(c.meters) || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validCoils = coils.filter((c) => c.coil_number.trim() && Number(c.meters) > 0);
    if (validCoils.length === 0) return toast.error(t("Добавьте хотя бы одну бухту с метражом"));
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("cable_products")
      .insert({
        brand: form.brand.trim(),
        cross_section: form.cross_section.trim(),
        supplier: form.supplier.trim() || null,
        batch: form.batch.trim() || null,
        purchase_price: Number(form.purchase_price) || 0,
        sale_price: Number(form.sale_price) || 0,
        stock_meters: totalMeters,
        low_stock_threshold: Number(form.low_stock_threshold) || 0,
        notes: form.notes.trim() || null,
        created_by: userData.user?.id ?? null,
      })
      .select()
      .single();
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }

    if (data) {
      const { error: coilError } = await supabase.from("cable_coils").insert(
        validCoils.map((c) => ({
          product_id: data.id,
          coil_number: c.coil_number.trim(),
          meters: Number(c.meters),
          created_by: userData.user?.id ?? null,
        })),
      );
      if (coilError) {
        setSaving(false);
        return toast.error(coilError.message);
      }
      await supabase.from("stock_movements").insert({
        product_id: data.id,
        change_meters: totalMeters,
        kind: "incoming",
        note: `${t("Начальный остаток")} (${validCoils.length} ${t("бухт")})`,
        created_by: userData.user?.id ?? null,
      });
    }
    setSaving(false);

    qc.invalidateQueries({ queryKey: ["cable_products"] });
    qc.invalidateQueries({ queryKey: ["cable_coils"] });
    toast.success(t("Кабель добавлен"));
    navigate({ to: "/inventory" });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("Новый кабель")}</h1>
        <p className="text-sm text-muted-foreground">{t("Добавьте марку в справочник")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("Данные позиции")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{t("Марка *")}</Label>
                <Input required value={form.brand} onChange={(e) => update("brand", e.target.value)} placeholder="ВВГнг-LS" />
              </div>
              <div>
                <Label>{t("Сечение / жилы *")}</Label>
                <Input required value={form.cross_section} onChange={(e) => update("cross_section", e.target.value)} placeholder="3x2.5" />
              </div>
              <div>
                <Label>{t("Поставщик")}</Label>
                <Input value={form.supplier} onChange={(e) => update("supplier", e.target.value)} />
              </div>
              <div>
                <Label>{t("№ партии")}</Label>
                <Input value={form.batch} onChange={(e) => update("batch", e.target.value)} />
              </div>
              <div>
                <Label>{t("Закупочная цена, сум/м")}</Label>
                <Input type="number" step="0.01" min="0" value={form.purchase_price} onChange={(e) => update("purchase_price", e.target.value)} />
              </div>
              <div>
                <Label>{t("Продажная цена, сум/м")}</Label>
                <Input type="number" step="0.01" min="0" value={form.sale_price} onChange={(e) => update("sale_price", e.target.value)} />
              </div>
              <div>
                <Label>{t("Порог низкого остатка, м")}</Label>
                <Input type="number" step="0.01" min="0" value={form.low_stock_threshold} onChange={(e) => update("low_stock_threshold", e.target.value)} />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold">{t("Бухты")}</Label>
                  <p className="text-xs text-muted-foreground">{t("Укажите каждую бухту и её метраж — остаток считается автоматически")}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addCoil}>
                  <Plus className="mr-2 h-4 w-4" /> {t("Добавить бухту")}
                </Button>
              </div>
              {coils.map((c, idx) => (
                <div key={c.key} className="grid gap-2 sm:grid-cols-12 sm:items-end">
                  <div className="sm:col-span-6">
                    <Label>{`${t("Номер бухты")} #${idx + 1}`}</Label>
                    <Input value={c.coil_number} onChange={(e) => updateCoil(c.key, { coil_number: e.target.value })} placeholder={t("Бухта 1, A001 и т.д.")} />
                  </div>
                  <div className="sm:col-span-5">
                    <Label>{t("Метраж")}</Label>
                    <Input type="number" step="0.01" min="0" value={c.meters} onChange={(e) => updateCoil(c.key, { meters: e.target.value })} placeholder="100" />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" disabled={coils.length === 1} onClick={() => setCoils((cs) => cs.filter((x) => x.key !== c.key))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="border-t pt-2 text-right text-sm font-medium">
                {t("Всего")}: {coils.length} {t("бухт")} · {formatMeters(totalMeters)}
              </div>
            </div>

            <div>
              <Label>{t("Примечание")}</Label>
              <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/inventory" })}>
                {t("Отмена")}
              </Button>
              <Button type="submit" disabled={saving}>{t("Сохранить")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
