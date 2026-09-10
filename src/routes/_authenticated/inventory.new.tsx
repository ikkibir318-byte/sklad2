import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { Plus, Trash2 } from "lucide-react";
import { formatQuantity } from "@/lib/format";
import { getProductUnits, type ProductUnit, unitInputLabel, unitShort, unitStep, formatProductNotes } from "@/lib/units";
import { isAdmin } from "@/routes/auth";

export const Route = createFileRoute("/_authenticated/inventory/new")({
  beforeLoad: async () => {
    if (typeof window !== "undefined" && !isAdmin()) throw redirect({ to: "/inventory" });
  },
  component: NewProduct,
});

type CoilRow = { key: string; coil_number: string; meters: string };

function NewProduct() {
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
    unit_type: "meter" as ProductUnit,
    initial_quantity: "",
  });
  const [coils, setCoils] = useState<CoilRow[]>([{ key: crypto.randomUUID(), coil_number: "1", meters: "" }]);
  const [saving, setSaving] = useState(false);
  const isMeter = form.unit_type === "meter";
  const units = getProductUnits();

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function updateCoil(key: string, patch: Partial<CoilRow>) {
    setCoils((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function addCoil() {
    setCoils((rows) => [...rows, { key: crypto.randomUUID(), coil_number: String(rows.length + 1), meters: "" }]);
  }
  const initialQuantity = Number(form.initial_quantity) || 0;
  const totalMeters = coils.reduce((sum, coil) => sum + (Number(coil.meters) || 0), 0);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.unit_type) return toast.error(t("Выберите единицу учёта: метры, килограммы или штуки"));
    
    const validCoils = coils.filter((coil) => coil.coil_number.trim() && Number(coil.meters) > 0);
    if (isMeter && validCoils.length === 0) {
      return toast.error(t("Добавьте хотя бы одну бухту с метражом"));
    }
    if (!isMeter && initialQuantity <= 0) {
      return toast.error(`${t("Укажите начальный остаток в")} ${unitShort(form.unit_type)}`);
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const quantity = isMeter ? totalMeters : initialQuantity;
      const formattedNotes = formatProductNotes(form.notes, form.unit_type);

      const basePayload: any = {
        brand: form.brand.trim(),
        cross_section: form.cross_section.trim() || "-",
        supplier: form.supplier.trim() || null,
        batch: form.batch.trim() || null,
        purchase_price: Number(form.purchase_price) || 0,
        sale_price: Number(form.sale_price) || 0,
        stock_meters: quantity,
        low_stock_threshold: Number(form.low_stock_threshold) || 0,
        notes: formattedNotes || null,
        created_by: userData.user?.id ?? null,
      };

      // Try inserting with unit_type and stock_quantity first, if schema cache lacks them, fallback cleanly
      let insertRes = await (supabase as any)
        .from("cable_products")
        .insert({
          ...basePayload,
          unit_type: form.unit_type,
          stock_quantity: quantity,
        })
        .select()
        .single();

      if (
        insertRes.error &&
        (insertRes.error.message?.includes("schema cache") ||
          insertRes.error.code === "PGRST204" ||
          insertRes.error.message?.includes("column"))
      ) {
        insertRes = await (supabase as any)
          .from("cable_products")
          .insert(basePayload)
          .select()
          .single();
      }

      if (insertRes.error) throw insertRes.error;
      const data = insertRes.data;

      if (isMeter && validCoils.length > 0) {
        const { error: coilError } = await (supabase as any).from("cable_coils").insert(
          validCoils.map((coil) => ({
            product_id: data.id,
            coil_number: coil.coil_number.trim(),
            meters: Number(coil.meters),
            created_by: userData.user?.id ?? null,
          }))
        );
        if (coilError) {
          console.error("Coils insert error:", coilError);
        }
      }

      // Stock movements: try with change_quantity, fallback to change_meters only
      let movRes = await (supabase as any).from("stock_movements").insert({
        product_id: data.id,
        change_meters: quantity,
        change_quantity: quantity,
        kind: "incoming",
        note: isMeter ? `Начальный остаток (${validCoils.length} бухт)` : "Начальный остаток",
        created_by: userData.user?.id ?? null,
      });

      if (
        movRes.error &&
        (movRes.error.message?.includes("schema cache") ||
          movRes.error.code === "PGRST204" ||
          movRes.error.message?.includes("column"))
      ) {
        await (supabase as any).from("stock_movements").insert({
          product_id: data.id,
          change_meters: quantity,
          kind: "incoming",
          note: isMeter ? `Начальный остаток (${validCoils.length} бухт)` : "Начальный остаток",
          created_by: userData.user?.id ?? null,
        });
      }

      qc.invalidateQueries({ queryKey: ["cable_products"] });
      qc.invalidateQueries({ queryKey: ["cable_coils"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(t("Позиция добавлена"));
      navigate({ to: "/inventory" });
    } catch (err: any) {
      toast.error(err.message || "Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("Новая позиция")}</h1>
        <p className="text-sm text-muted-foreground">{t("Добавьте кабель, товар на вес или штучный товар")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("Данные позиции")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{t("Наименование")} *</Label>
                <Input
                  required
                  value={form.brand}
                  onChange={(e) => update("brand", e.target.value)}
                  placeholder={form.unit_type === "meter" ? "ВВГнг-LS" : form.unit_type === "piece" ? "Клемма WAGO" : "Медная жила"}
                />
              </div>
              <div>
                <Label>{t("Единица учёта")} *</Label>
                <Select
                  value={form.unit_type}
                  onValueChange={(value) => update("unit_type", value as ProductUnit)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("Выберите единицу")} />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("Сечение / характеристика")}</Label>
                <Input
                  value={form.cross_section}
                  onChange={(e) => update("cross_section", e.target.value)}
                  placeholder={form.unit_type === "meter" ? "3x2.5" : "16 А, 2-проводная"}
                />
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
                <Label>{t("Закупочная цена")}, сум/{unitShort(form.unit_type)}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.purchase_price}
                  onChange={(e) => update("purchase_price", e.target.value)}
                />
              </div>
              <div>
                <Label>{t("Продажная цена")}, сум/{unitShort(form.unit_type)}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.sale_price}
                  onChange={(e) => update("sale_price", e.target.value)}
                />
              </div>
              <div>
                <Label>{t("Порог низкого остатка")}, {unitShort(form.unit_type)}</Label>
                <Input
                  type="number"
                  step={unitStep(form.unit_type)}
                  min="0"
                  value={form.low_stock_threshold}
                  onChange={(e) => update("low_stock_threshold", e.target.value)}
                />
              </div>
            </div>

            {isMeter ? (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-semibold">{t("Бухты")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("Укажите каждую бухту и её метраж — остаток считается автоматически")}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addCoil}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t("Добавить бухту")}
                  </Button>
                </div>
                {coils.map((coil, index) => (
                  <div key={coil.key} className="grid gap-2 sm:grid-cols-12 sm:items-end">
                    <div className="sm:col-span-6">
                      <Label>{t("Номер бухты")} #{index + 1}</Label>
                      <Input
                        value={coil.coil_number}
                        onChange={(e) => updateCoil(coil.key, { coil_number: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <Label>{t("Метраж")}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={coil.meters}
                        onChange={(e) => updateCoil(coil.key, { meters: e.target.value })}
                        placeholder="100"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={coils.length === 1}
                        onClick={() => setCoils((rows) => rows.filter((row) => row.key !== coil.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="border-t pt-2 text-right text-sm font-medium">
                  {t("Всего")}: {coils.length} {t("бухт")} · {formatQuantity(totalMeters, "meter")}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border p-4 space-y-2">
                <Label className="text-base font-semibold">{unitInputLabel(form.unit_type)} *</Label>
                <p className="text-xs text-muted-foreground">
                  {t("Начальный остаток. Позже его можно изменить в карточке товара — изменение попадёт в историю.")}
                </p>
                <Input
                  required
                  type="number"
                  step={unitStep(form.unit_type)}
                  min="0"
                  value={form.initial_quantity}
                  onChange={(e) => update("initial_quantity", e.target.value)}
                  placeholder={form.unit_type === "piece" ? "100" : "25.5"}
                />
              </div>
            )}

            <div>
              <Label>{t("Примечание")}</Label>
              <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/inventory" })}>
                {t("Отмена")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t("Сохранение…") : t("Сохранить")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
