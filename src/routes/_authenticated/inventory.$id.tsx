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
import { toast } from "sonner";
import { formatMeters, formatMoney, formatDateTime } from "@/lib/format";
import { ArrowLeft, Trash2, Plus, Package } from "lucide-react";
import { useT } from "@/lib/i18n";

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
        client_name: m.kind === "sale" || m.sale_id
          ? (m.sale_id && salesMap[m.sale_id] ? salesMap[m.sale_id] : "Без клиента")
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
        // If table doesn't exist yet, return empty array
        console.log("cable_coils table not yet created or other error:", error);
        return [];
      }
    },
  });

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [movementQty, setMovementQty] = useState("");
  const [movementKind, setMovementKind] = useState<"incoming" | "adjustment" | "return">("incoming");
  const [movementNote, setMovementNote] = useState("");
  
  // Coil management state
  const [coilDialogOpen, setCoilDialogOpen] = useState(false);
  const [coilForm, setCoilForm] = useState({ coil_number: "", meters: "", notes: "" });
  const [editingCoil, setEditingCoil] = useState<string | null>(null);

  function startEdit() {
    if (!product) return;
    setForm({
      brand: product.brand,
      cross_section: product.cross_section,
      supplier: product.supplier ?? "",
      batch: product.batch ?? "",
      purchase_price: String(product.purchase_price),
      sale_price: String(product.sale_price),
      low_stock_threshold: String(product.low_stock_threshold),
      notes: product.notes ?? "",
    });
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from("cable_products")
      .update({
        brand: form.brand.trim(),
        cross_section: form.cross_section.trim(),
        supplier: form.supplier.trim() || null,
        batch: form.batch.trim() || null,
        purchase_price: Number(form.purchase_price) || 0,
        sale_price: Number(form.sale_price) || 0,
        low_stock_threshold: Number(form.low_stock_threshold) || 0,
        notes: form.notes.trim() || null,
      })
      .eq("id", id);
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["cable_products"] });
    qc.invalidateQueries({ queryKey: ["cable_products", id] });
    qc.invalidateQueries({ queryKey: ["stock_movements", id] });
    setEditing(false);
    toast.success(t("Сохранено"));
  }

  async function handleMovement() {
    const qty = Number(movementQty);
    if (!qty || qty <= 0) return toast.error(t("Укажите количество"));
    const change = movementKind === "adjustment" ? qty : qty;
    const { error } = await supabase.rpc("adjust_stock", {
      _product_id: id,
      _change_meters: change,
      _kind: movementKind,
      _note: movementNote || null,
    } as never);
    if (error) return toast.error(error.message);
    setMovementQty("");
    setMovementNote("");
    qc.invalidateQueries({ queryKey: ["cable_products", id] });
    qc.invalidateQueries({ queryKey: ["stock_movements", id] });
    qc.invalidateQueries({ queryKey: ["cable_products"] });
    toast.success(t("Остаток обновлён"));
  }

  async function handleDelete() {
    const { error } = await supabase.from("cable_products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["cable_products"] });
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
    await supabase.from("cable_products").update({ stock_meters: total }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["cable_products"] });
    qc.invalidateQueries({ queryKey: ["cable_products", id] });
  }

  async function handleSaveCoil() {
    try {
      const { error } = editingCoil
        ? await (supabase as any)
            .from("cable_coils")
            .update({
              coil_number: coilForm.coil_number.trim(),
              meters: Number(coilForm.meters) || 0,
              notes: coilForm.notes.trim() || null,
            })
            .eq("id", editingCoil)
        : await (supabase as any)
            .from("cable_coils")
            .insert({
              product_id: id,
              coil_number: coilForm.coil_number.trim(),
              meters: Number(coilForm.meters) || 0,
              notes: coilForm.notes.trim() || null,
            });
      
      if (error) throw error;
      await syncStockFromCoils();
      qc.invalidateQueries({ queryKey: ["cable_coils", id] });
      qc.invalidateQueries({ queryKey: ["cable_products", id] });
      setCoilDialogOpen(false);
      setCoilForm({ coil_number: "", meters: "", notes: "" });
      setEditingCoil(null);
      toast.success(editingCoil ? t("Бухта обновлена") : t("Бухта добавлена"));
    } catch (error: any) {
      toast.error(error.message || t("Ошибка при работе с бухтами. Таблица не создана?"));
    }
  }

  async function handleDeleteCoil(coilId: string) {
    try {
      const { error } = await (supabase as any).from("cable_coils").delete().eq("id", coilId);
      if (error) throw error;
      await syncStockFromCoils();
      qc.invalidateQueries({ queryKey: ["cable_coils", id] });
      qc.invalidateQueries({ queryKey: ["cable_products", id] });
      toast.success(t("Бухта удалена"));
    } catch (error: any) {
      toast.error(error.message || t("Ошибка при удалении бухты"));
    }
  }

  if (isLoading || !product) return <p className="text-sm text-muted-foreground">{t("Загрузка…")}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/inventory"><ArrowLeft className="mr-2 h-4 w-4" /> {t("К списку")}</Link>
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Trash2 className="mr-2 h-4 w-4" /> {t("Удалить")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("Удалить позицию?")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t("Это удалит кабель и историю его движений.")}</p>
            <DialogFooter>
              <Button variant="destructive" onClick={handleDelete}>{t("Удалить")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">{product.brand} {product.cross_section}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Остаток")}: <span className="font-medium text-foreground">{formatMeters(product.stock_meters)}</span>
          {" · "}
          {t("Закуп")}: {formatMoney(product.purchase_price)}/{t("м")} · {t("Продажа")}: {formatMoney(product.sale_price)}/{t("м")}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("Карточка")}</CardTitle>
            {!editing && <Button variant="outline" size="sm" onClick={startEdit}>{t("Редактировать")}</Button>}
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label>{t("Марка")}</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
                  <div><Label>{t("Сечение")}</Label><Input value={form.cross_section} onChange={(e) => setForm({ ...form, cross_section: e.target.value })} /></div>
                  <div><Label>{t("Поставщик")}</Label><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
                  <div><Label>{t("Партия")}</Label><Input value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} /></div>
                  <div><Label>{t("Порог низкого остатка")}</Label><Input type="number" step="0.01" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} /></div>
                  <div><Label>{t("Закуп сум/м")}</Label><Input type="number" step="0.01" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} /></div>
                  <div><Label>{t("Продажа сум/м")}</Label><Input type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} /></div>
                </div>
                <div><Label>{t("Примечание")}</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditing(false)}>{t("Отмена")}</Button>
                  <Button onClick={handleSave} disabled={saving}>{t("Сохранить")}</Button>
                </div>
              </div>
            ) : (
              <dl className="space-y-2 text-sm">
                <Row label={t("Поставщик")} value={product.supplier ?? "—"} />
                <Row label={t("№ партии")} value={product.batch ?? "—"} />
                <Row label={t("Закупочная цена")} value={`${formatMoney(product.purchase_price)}/${t("м")}`} />
                <Row label={t("Продажная цена")} value={`${formatMoney(product.sale_price)}/${t("м")}`} />
                <Row label={t("Порог низкого остатка")} value={formatMeters(product.low_stock_threshold)} />
                <Row label={t("Примечание")} value={product.notes ?? "—"} />
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Движение остатка")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("Тип")}</Label>
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={movementKind}
                  onChange={(e) => setMovementKind(e.target.value as typeof movementKind)}
                >
                  <option value="incoming">{t("Приход")}</option>
                  <option value="return">{t("Возврат")}</option>
                  <option value="adjustment">{t("Корректировка (можно с минусом)")}</option>
                </select>
              </div>
              <div>
                <Label>{t("Метров")}</Label>
                <Input type="number" step="0.01" value={movementQty} onChange={(e) => setMovementQty(e.target.value)} placeholder="100" />
              </div>
            </div>
            <div>
              <Label>{t("Комментарий")}</Label>
              <Input value={movementNote} onChange={(e) => setMovementNote(e.target.value)} />
            </div>
            <Button onClick={handleMovement} className="w-full">{t("Провести")}</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t("Бухты")}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => openCoilDialog()}>
            <Plus className="mr-2 h-4 w-4" /> {t("Добавить бухту")}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Номер бухты")}</TableHead>
                  <TableHead className="text-right">{t("Метров")}</TableHead>
                  <TableHead>{t("Примечание")}</TableHead>
                  <TableHead className="text-right">{t("Действия")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!coils || coils.length === 0) ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">{t("Нет бухт")}</TableCell></TableRow>
                ) : coils?.map((coil: any) => (
                  <TableRow key={coil.id}>
                    <TableCell className="font-medium">{coil.coil_number}</TableCell>
                    <TableCell className="text-right">{formatMeters(coil.meters)}</TableCell>
                    <TableCell className="text-muted-foreground">{coil.notes || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openCoilDialog(coil.id)}>{t("Редактировать")}</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteCoil(coil.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
            <Button variant="outline" onClick={() => setCoilDialogOpen(false)}>{t("Отмена")}</Button>
            <Button onClick={handleSaveCoil}>{editingCoil ? t("Сохранить") : t("Добавить")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">{t("Пока пусто")}</TableCell></TableRow>
                ) : movements?.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground">{formatDateTime(m.created_at)}</TableCell>
                    <TableCell>{kindLabel(m.kind, t)}</TableCell>
                    <TableCell>
                      {m.sale_id ? (
                        <Link to="/sales/$id" params={{ id: m.sale_id }} className="hover:underline font-medium text-foreground">
                          {m.client_name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{m.client_name}</span>
                      )}
                    </TableCell>
                    <TableCell className={"text-right font-medium " + (Number(m.change_meters) < 0 ? "text-destructive" : "text-emerald-600")}>
                      {Number(m.change_meters) > 0 ? "+" : ""}{formatMeters(m.change_meters)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
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
    case "incoming": return t("Приход");
    case "sale": return t("Продажа");
    case "return": return t("Возврат");
    case "adjustment": return t("Корректировка");
    default: return k;
  }
}
