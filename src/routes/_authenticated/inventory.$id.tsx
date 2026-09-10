import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatMeters, formatQuantity, formatMoney, formatDateTime } from "@/lib/format";
import {
  getProductUnits,
  type ProductUnit,
  unitInputLabel,
  unitShort,
  unitStep,
  getProductUnit,
  getProductCleanNotes,
  formatProductNotes,
} from "@/lib/units";
import { ArrowLeft, Trash2, Plus, Package } from "lucide-react";
import { useT } from "@/lib/i18n";
import { isAdmin } from "@/routes/auth";

export const Route = createFileRoute("/_authenticated/inventory/$id")({
  component: CableDetail,
});

function CableDetail() {
  const t = useT();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: product, isLoading } = useQuery({
    queryKey: ["cable_products", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cable_products").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: movements } = useQuery({
    queryKey: ["stock_movements", id],
    queryFn: async () => {
      const { data: movs, error } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("product_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;

      const saleIds = (movs ?? []).map((m) => m.sale_id).filter(Boolean) as string[];
      const salesMap: Record<string, string | null> = {};

      if (saleIds.length > 0) {
        const { data: salesData } = await supabase
          .from("sales")
          .select("id, customer_name_snapshot")
          .in("id", saleIds);
        (salesData ?? []).forEach((s) => {
          salesMap[s.id] = s.customer_name_snapshot;
        });
      }

      return (movs ?? []).map((m) => ({
        ...m,
        client_name:
          m.kind === "sale" || m.sale_id
            ? m.sale_id && salesMap[m.sale_id]
              ? salesMap[m.sale_id]
              : "Без клиента"
            : "—",
      }));
    },
  });

  const { data: coils } = useQuery({
    queryKey: ["cable_coils", id],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("cable_coils")
          .select("*")
          .eq("product_id", id)
          .order("coil_number", { ascending: true });
        if (error) throw error;
        return data;
      } catch (error) {
        return [];
      }
    },
  });

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  // Coil management state
  const [coilDialogOpen, setCoilDialogOpen] = useState(false);
  const [coilForm, setCoilForm] = useState({ coil_number: "", meters: "", notes: "" });
  const [editingCoil, setEditingCoil] = useState<string | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const units = getProductUnits();

  function startEdit() {
    if (!product) return;
    const currentUnit = getProductUnit(product);
    const cleanNotes = getProductCleanNotes(product);
    const currentQty = Number((product as any).stock_quantity ?? product.stock_meters ?? 0);
    setForm({
      brand: product.brand,
      cross_section: product.cross_section && product.cross_section !== "-" ? product.cross_section : "",
      supplier: product.supplier ?? "",
      batch: product.batch ?? "",
      purchase_price: String(product.purchase_price),
      sale_price: String(product.sale_price),
      low_stock_threshold: String(product.low_stock_threshold),
      notes: cleanNotes,
      unit_type: currentUnit,
      stock_quantity: String(currentQty),
    });
    setEditing(true);
  }

  async function handleSave() {
    if (!product) return;
    setSaving(true);
    try {
      const unitType = (form.unit_type || getProductUnit(product)) as ProductUnit;
      const isMeter = unitType === "meter";
      const newQuantity = Number(form.stock_quantity) || 0;
      const oldQuantity = Number((product as any).stock_quantity ?? product.stock_meters ?? 0);
      const formattedNotes = formatProductNotes(form.notes, unitType);

      const basePayload: any = {
        brand: form.brand.trim(),
        cross_section: form.cross_section.trim() || "-",
        supplier: form.supplier.trim() || null,
        batch: form.batch.trim() || null,
        purchase_price: Number(form.purchase_price) || 0,
        sale_price: Number(form.sale_price) || 0,
        low_stock_threshold: Number(form.low_stock_threshold) || 0,
        notes: formattedNotes || null,
      };

      if (!isMeter) {
        basePayload.stock_meters = newQuantity;
      }

      let updRes = await (supabase as any)
        .from("cable_products")
        .update({
          ...basePayload,
          unit_type: unitType,
          stock_quantity: newQuantity,
        })
        .eq("id", id);

      if (
        updRes.error &&
        (updRes.error.message?.includes("schema cache") ||
          updRes.error.code === "PGRST204" ||
          updRes.error.message?.includes("column"))
      ) {
        updRes = await (supabase as any)
          .from("cable_products")
          .update(basePayload)
          .eq("id", id);
      }

      if (updRes.error) throw updRes.error;

      // Log movement if non-meter quantity was changed during edit
      if (!isMeter && newQuantity !== oldQuantity) {
        const diff = newQuantity - oldQuantity;
        const { data: userData } = await supabase.auth.getUser();
        let movRes = await (supabase as any).from("stock_movements").insert({
          product_id: id,
          kind: "adjustment",
          change_meters: diff,
          change_quantity: diff,
          note: t("Корректировка при редактировании"),
          created_by: userData.user?.id ?? null,
        });

        if (
          movRes.error &&
          (movRes.error.message?.includes("schema cache") ||
            movRes.error.code === "PGRST204" ||
            movRes.error.message?.includes("column"))
        ) {
          await (supabase as any).from("stock_movements").insert({
            product_id: id,
            kind: "adjustment",
            change_meters: diff,
            note: t("Корректировка при редактировании"),
            created_by: userData.user?.id ?? null,
          });
        }
      }

      qc.invalidateQueries({ queryKey: ["cable_products"] });
      qc.invalidateQueries({ queryKey: ["cable_products", id] });
      qc.invalidateQueries({ queryKey: ["stock_movements", id] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setEditing(false);
      toast.success(t("Сохранено"));
    } catch (err: any) {
      toast.error(err.message || t("Ошибка при сохранении"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const { error } = await supabase.from("cable_products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["cable_products"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    toast.success(t("Позиция удалена"));
    navigate({ to: "/inventory" });
  }

  // Coil management functions
  function openCoilDialog(coilId: string | null = null) {
    if (coilId) {
      const coil = coils?.find((c: any) => c.id === coilId);
      if (coil) {
        setCoilForm({
          coil_number: coil.coil_number,
          meters: String(coil.meters),
          notes: coil.notes || "",
        });
        setEditingCoil(coilId);
      }
    } else {
      setCoilForm({ coil_number: "", meters: "", notes: "" });
      setEditingCoil(null);
    }
    setCoilDialogOpen(true);
  }

  async function syncStockFromCoils() {
    const { data: rows } = await (supabase as any).from("cable_coils").select("meters").eq("product_id", id);
    const total = (rows ?? []).reduce((s: number, r: any) => s + Number(r.meters || 0), 0);
    
    let upd = await (supabase as any)
      .from("cable_products")
      .update({ stock_meters: total, stock_quantity: total, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (upd.error && (upd.error.message?.includes("schema cache") || upd.error.code === "PGRST204")) {
      await (supabase as any)
        .from("cable_products")
        .update({ stock_meters: total, updated_at: new Date().toISOString() })
        .eq("id", id);
    }

    qc.invalidateQueries({ queryKey: ["cable_products"] });
    qc.invalidateQueries({ queryKey: ["cable_products", id] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  }

  async function handleSaveCoil() {
    try {
      const coilNumber = coilForm.coil_number.trim();
      const newMeters = Number(coilForm.meters) || 0;
      const coilNotes = coilForm.notes.trim();

      if (!coilNumber) return toast.error(t("Укажите номер бухты"));
      if (newMeters <= 0) return toast.error(t("Укажите метраж бухты"));

      const prevCoil = editingCoil ? coils?.find((c: any) => c.id === editingCoil) : null;
      const prevMeters = prevCoil ? Number(prevCoil.meters || 0) : 0;
      const { data: userData } = await supabase.auth.getUser();

      const { error } = editingCoil
        ? await (supabase as any)
            .from("cable_coils")
            .update({
              coil_number: coilNumber,
              meters: newMeters,
              notes: coilNotes || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", editingCoil)
        : await (supabase as any).from("cable_coils").insert({
            product_id: id,
            coil_number: coilNumber,
            meters: newMeters,
            notes: coilNotes || null,
            created_by: userData.user?.id ?? null,
          });

      if (error) throw error;
      await syncStockFromCoils();

      if (editingCoil) {
        const diff = newMeters - prevMeters;
        if (diff !== 0) {
          let movRes = await (supabase as any).from("stock_movements").insert({
            product_id: id,
            kind: "adjustment",
            change_meters: diff,
            change_quantity: diff,
            note: `${t("Изменение бухты")} №${coilNumber} (${formatMeters(prevMeters)} → ${formatMeters(newMeters)})${coilNotes ? ` · ${coilNotes}` : ""}`,
            created_by: userData.user?.id ?? null,
          });
          if (movRes.error && (movRes.error.message?.includes("schema cache") || movRes.error.code === "PGRST204")) {
            await (supabase as any).from("stock_movements").insert({
              product_id: id,
              kind: "adjustment",
              change_meters: diff,
              note: `${t("Изменение бухты")} №${coilNumber} (${formatMeters(prevMeters)} → ${formatMeters(newMeters)})${coilNotes ? ` · ${coilNotes}` : ""}`,
              created_by: userData.user?.id ?? null,
            });
          }
        }
      } else {
        let movRes = await (supabase as any).from("stock_movements").insert({
          product_id: id,
          kind: "incoming",
          change_meters: newMeters,
          change_quantity: newMeters,
          note: `${t("Добавлена бухта")} №${coilNumber}${coilNotes ? ` (${coilNotes})` : ""}`,
          created_by: userData.user?.id ?? null,
        });
        if (movRes.error && (movRes.error.message?.includes("schema cache") || movRes.error.code === "PGRST204")) {
          await (supabase as any).from("stock_movements").insert({
            product_id: id,
            kind: "incoming",
            change_meters: newMeters,
            note: `${t("Добавлена бухта")} №${coilNumber}${coilNotes ? ` (${coilNotes})` : ""}`,
            created_by: userData.user?.id ?? null,
          });
        }
      }

      qc.invalidateQueries({ queryKey: ["cable_coils", id] });
      qc.invalidateQueries({ queryKey: ["cable_products", id] });
      qc.invalidateQueries({ queryKey: ["stock_movements", id] });
      setCoilDialogOpen(false);
      setCoilForm({ coil_number: "", meters: "", notes: "" });
      setEditingCoil(null);
      toast.success(editingCoil ? t("Бухта обновлена") : t("Бухта добавлена"));
    } catch (error: any) {
      toast.error(error.message || t("Ошибка при работе с бухтами"));
    }
  }

  async function handleDeleteCoil(coilId: string) {
    try {
      const deletedCoil = coils?.find((c: any) => c.id === coilId);
      const { error } = await (supabase as any).from("cable_coils").delete().eq("id", coilId);
      if (error) throw error;
      await syncStockFromCoils();

      if (deletedCoil && Number(deletedCoil.meters) > 0) {
        const { data: userData } = await supabase.auth.getUser();
        let movRes = await (supabase as any).from("stock_movements").insert({
          product_id: id,
          kind: "adjustment",
          change_meters: -Number(deletedCoil.meters),
          change_quantity: -Number(deletedCoil.meters),
          note: `${t("Удалена бухта")} №${deletedCoil.coil_number}`,
          created_by: userData.user?.id ?? null,
        });
        if (movRes.error && (movRes.error.message?.includes("schema cache") || movRes.error.code === "PGRST204")) {
          await (supabase as any).from("stock_movements").insert({
            product_id: id,
            kind: "adjustment",
            change_meters: -Number(deletedCoil.meters),
            note: `${t("Удалена бухта")} №${deletedCoil.coil_number}`,
            created_by: userData.user?.id ?? null,
          });
        }
      }

      qc.invalidateQueries({ queryKey: ["cable_coils", id] });
      qc.invalidateQueries({ queryKey: ["cable_products", id] });
      qc.invalidateQueries({ queryKey: ["stock_movements", id] });
      toast.success(t("Бухта удалена"));
    } catch (error: any) {
      toast.error(error.message || t("Ошибка при удалении бухты"));
    }
  }

  async function handleAdjustQuantity() {
    const nextQuantity = Number(adjustQuantity);
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0) return toast.error(t("Укажите корректный остаток"));
    
    setAdjusting(true);
    try {
      const currentQty = Number((product as any).stock_quantity ?? product.stock_meters ?? 0);
      const diff = nextQuantity - currentQty;

      // Direct update to ensure reliable execution
      let updErr = null;
      const updRes = await (supabase as any)
        .from("cable_products")
        .update({
          stock_quantity: nextQuantity,
          stock_meters: nextQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (
        updRes.error &&
        (updRes.error.message?.includes("schema cache") ||
          updRes.error.code === "PGRST204" ||
          updRes.error.message?.includes("column"))
      ) {
        const updRes2 = await (supabase as any)
          .from("cable_products")
          .update({
            stock_meters: nextQuantity,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (updRes2.error) updErr = updRes2.error;
      } else if (updRes.error) {
        updErr = updRes.error;
      }

      if (updErr) throw updErr;

      if (diff !== 0) {
        const { data: userData } = await supabase.auth.getUser();
        let movRes = await (supabase as any).from("stock_movements").insert({
          product_id: id,
          kind: "adjustment",
          change_meters: diff,
          change_quantity: diff,
          note: adjustNote.trim() || t("Корректировка остатка"),
          created_by: userData.user?.id ?? null,
        });

        if (
          movRes.error &&
          (movRes.error.message?.includes("schema cache") ||
            movRes.error.code === "PGRST204" ||
            movRes.error.message?.includes("column"))
        ) {
          await (supabase as any).from("stock_movements").insert({
            product_id: id,
            kind: "adjustment",
            change_meters: diff,
            note: adjustNote.trim() || t("Корректировка остатка"),
            created_by: userData.user?.id ?? null,
          });
        }
      }

      setAdjustQuantity("");
      setAdjustNote("");
      qc.invalidateQueries({ queryKey: ["cable_products"] });
      qc.invalidateQueries({ queryKey: ["cable_products", id] });
      qc.invalidateQueries({ queryKey: ["stock_movements", id] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(t("Остаток скорректирован"));
    } catch (err: any) {
      toast.error(err.message || t("Ошибка при корректировке остатка"));
    } finally {
      setAdjusting(false);
    }
  }

  if (isLoading || !product) return <p className="text-sm text-muted-foreground">{t("Загрузка…")}</p>;
  const unit = getProductUnit(product);
  const cleanNotes = getProductCleanNotes(product);
  const quantity = Number((product as any).stock_quantity ?? product.stock_meters ?? 0);
  const isMeter = unit === "meter";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/inventory">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("К списку")}
          </Link>
        </Button>
        {isAdmin() && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="mr-2 h-4 w-4" /> {t("Удалить")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("Удалить позицию?")}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{t("Это удалит кабель и историю его движений.")}</p>
              <DialogFooter>
                <Button variant="destructive" onClick={handleDelete}>
                  {t("Удалить")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-semibold">
          {product.brand}
          {product.cross_section && product.cross_section !== "-" ? ` ${product.cross_section}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("Остаток")}: <span className="font-medium text-foreground">{formatQuantity(quantity, unit)}</span>
          {" · "}
          {t("Закуп")}: {formatMoney(product.purchase_price)}/{unitShort(unit)} · {t("Продажа")}: {formatMoney(product.sale_price)}/{unitShort(unit)}
        </p>
      </div>

      {!isMeter && isAdmin() && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Корректировка остатка")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("Укажите фактический остаток. В истории сохранится разница с точной датой и временем.")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{unitInputLabel(unit)}</Label>
                <Input
                  type="number"
                  min="0"
                  step={unitStep(unit)}
                  value={adjustQuantity}
                  onChange={(e) => setAdjustQuantity(e.target.value)}
                  placeholder={String(quantity)}
                />
              </div>
              <div>
                <Label>{t("Комментарий")}</Label>
                <Input
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder={t("Причина корректировки")}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleAdjustQuantity} disabled={adjusting}>
                {adjusting ? t("Сохранение…") : t("Скорректировать остаток")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("Карточка")}</CardTitle>
          {!editing && isAdmin() && (
            <Button variant="outline" size="sm" onClick={startEdit}>
              {t("Редактировать")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t("Наименование")} *</Label>
                  <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
                </div>
                <div>
                  <Label>{t("Единица учёта")} *</Label>
                  <Select
                    value={form.unit_type}
                    onValueChange={(val) => setForm({ ...form, unit_type: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u.value} value={u.value}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("Сечение / характеристика")}</Label>
                  <Input
                    value={form.cross_section}
                    onChange={(e) => setForm({ ...form, cross_section: e.target.value })}
                  />
                </div>
                {form.unit_type !== "meter" && (
                  <div>
                    <Label>{unitInputLabel(form.unit_type)} ({t("Остаток")})</Label>
                    <Input
                      type="number"
                      step={unitStep(form.unit_type)}
                      min="0"
                      value={form.stock_quantity}
                      onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                    />
                  </div>
                )}
                <div>
                  <Label>{t("Поставщик")}</Label>
                  <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
                </div>
                <div>
                  <Label>{t("№ партии")}</Label>
                  <Input value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} />
                </div>
                <div>
                  <Label>{t("Порог низкого остатка")}, {unitShort(form.unit_type)}</Label>
                  <Input
                    type="number"
                    step={unitStep(form.unit_type)}
                    value={form.low_stock_threshold}
                    onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t("Закупочная цена")}, сум/{unitShort(form.unit_type)}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.purchase_price}
                    onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t("Продажная цена")}, сум/{unitShort(form.unit_type)}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.sale_price}
                    onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>{t("Примечание")}</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(false)}>
                  {t("Отмена")}
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? t("Сохранение…") : t("Сохранить")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <Row label={t("Единица учёта")} value={units.find((u) => u.value === unit)?.label ?? unitShort(unit)} />
              <Row label={t("Поставщик")} value={product.supplier ?? "—"} />
              <Row label={t("№ партии")} value={product.batch ?? "—"} />
              <Row label={t("Закупочная цена")} value={`${formatMoney(product.purchase_price)}/${unitShort(unit)}`} />
              <Row label={t("Продажная цена")} value={`${formatMoney(product.sale_price)}/${unitShort(unit)}`} />
              <Row label={t("Порог низкого остатка")} value={formatQuantity(product.low_stock_threshold, unit)} />
              <Row label={t("Примечание")} value={cleanNotes || "—"} />
            </div>
          )}
        </CardContent>
      </Card>

      {isMeter && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {t("Бухты")}
              </CardTitle>
              {isAdmin() && (
                <Button variant="outline" size="sm" onClick={() => openCoilDialog()}>
                  <Plus className="mr-2 h-4 w-4" /> {t("Добавить бухту")}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Номер бухты")}</TableHead>
                      <TableHead className="text-right">{t("Метров")}</TableHead>
                      <TableHead>{t("Примечание")}</TableHead>
                      {isAdmin() && <TableHead className="text-right">{t("Действия")}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!coils || coils.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isAdmin() ? 4 : 3} className="text-center text-muted-foreground py-6">
                          {t("Нет бухт")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      coils.map((coil: any) => (
                        <TableRow key={coil.id}>
                          <TableCell className="font-medium">{coil.coil_number}</TableCell>
                          <TableCell className="text-right">{formatMeters(coil.meters)}</TableCell>
                          <TableCell className="text-muted-foreground">{coil.notes || "—"}</TableCell>
                          {isAdmin() && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => openCoilDialog(coil.id)}>
                                  {t("Редактировать")}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteCoil(coil.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Dialog open={coilDialogOpen} onOpenChange={setCoilDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCoil ? t("Редактировать бухту") : t("Добавить бухту")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{t("Номер бухты")}</Label>
                  <Input
                    value={coilForm.coil_number}
                    onChange={(e) => setCoilForm({ ...coilForm, coil_number: e.target.value })}
                    placeholder={t("Бухта 1, A001 и т.д.")}
                  />
                </div>
                <div>
                  <Label>{t("Метров")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={coilForm.meters}
                    onChange={(e) => setCoilForm({ ...coilForm, meters: e.target.value })}
                    placeholder="100"
                  />
                </div>
                <div>
                  <Label>{t("Примечание")}</Label>
                  <Input
                    value={coilForm.notes}
                    onChange={(e) => setCoilForm({ ...coilForm, notes: e.target.value })}
                    placeholder={t("Опционально")}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCoilDialogOpen(false)}>
                  {t("Отмена")}
                </Button>
                <Button onClick={handleSaveCoil}>{editingCoil ? t("Сохранить") : t("Добавить")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("История движений")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Дата")}</TableHead>
                  <TableHead>{t("Тип")}</TableHead>
                  <TableHead>{t("Клиент")}</TableHead>
                  <TableHead className="text-right">{t("Изменение")}</TableHead>
                  <TableHead>{t("Комментарий")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(movements ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      {t("Пока пусто")}
                    </TableCell>
                  </TableRow>
                ) : (
                  movements?.map((m) => {
                    const diffNum = Number((m as any).change_quantity ?? m.change_meters ?? 0);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-muted-foreground">{formatDateTime(m.created_at)}</TableCell>
                        <TableCell>{kindLabel(m.kind, t)}</TableCell>
                        <TableCell>
                          {m.sale_id ? (
                            <Link
                              to="/sales/$id"
                              params={{ id: m.sale_id }}
                              className="hover:underline font-medium text-foreground"
                            >
                              {m.client_name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">{m.client_name}</span>
                          )}
                        </TableCell>
                        <TableCell
                          className={
                            "text-right font-medium " + (diffNum < 0 ? "text-destructive" : "text-emerald-600")
                          }
                        >
                          {diffNum > 0 ? "+" : ""}
                          {formatQuantity(diffNum, unit)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{m.note ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function kindLabel(k: string, t: (s: string) => string) {
  switch (k) {
    case "incoming":
      return t("Приход");
    case "sale":
      return t("Продажа");
    case "return":
      return t("Возврат");
    case "adjustment":
      return t("Корректировка");
    default:
      return k;
  }
}
