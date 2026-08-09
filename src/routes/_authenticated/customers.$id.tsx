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
import { formatMoney, formatDateTime } from "@/lib/format";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  component: CustomerDetail,
});

function CustomerDetail() {
  const t = useT();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: customer } = useQuery({
    queryKey: ["customers", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: sales } = useQuery({
    queryKey: ["customer-sales", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, sold_at")
        .eq("customer_id", id)
        .order("sold_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", notes: "" });

  function startEdit() {
    if (!customer) return;
    setForm({ name: customer.name, phone: customer.phone ?? "", notes: customer.notes ?? "" });
    setEditing(true);
  }

  async function handleSave() {
    const { error } = await supabase.from("customers").update({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["customers", id] });
    setEditing(false);
    toast.success(t("Сохранено"));
  }

  async function handleDelete() {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["customers"] });
    toast.success(t("Удалено"));
    navigate({ to: "/customers" });
  }

  if (!customer) return <p className="text-sm text-muted-foreground">{t("Загрузка…")}</p>;

  const total = (sales ?? []).reduce((s, x) => s + Number(x.total), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/customers"><ArrowLeft className="mr-2 h-4 w-4" /> {t("К списку")}</Link>
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Trash2 className="mr-2 h-4 w-4" /> {t("Удалить")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("Удалить клиента?")}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{t("Продажи сохранятся, но потеряют привязку.")}</p>
            <DialogFooter><Button variant="destructive" onClick={handleDelete}>{t("Удалить")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">{customer.name}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Продаж:")} {sales?.length ?? 0} {t("на")} {formatMoney(total)}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("Данные")}</CardTitle>
          {!editing && <Button variant="outline" size="sm" onClick={startEdit}>{t("Редактировать")}</Button>}
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-3">
              <div><Label>{t("Имя / компания")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>{t("Телефон")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>{t("Комментарий")}</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(false)}>{t("Отмена")}</Button>
                <Button onClick={handleSave}>{t("Сохранить")}</Button>
              </div>
            </div>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">{t("Телефон")}</dt><dd>{customer.phone ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">{t("Комментарий")}</dt><dd>{customer.notes ?? "—"}</dd></div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("История покупок")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Дата")}</TableHead>
                <TableHead className="text-right">{t("Сумма")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sales ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-6">{t("Пусто")}</TableCell></TableRow>
              ) : sales?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><Link to="/sales/$id" params={{ id: s.id }} className="hover:underline">{formatDateTime(s.sold_at)}</Link></TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(s.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
