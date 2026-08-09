import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: CustomersList,
});

function CustomersList() {
  const t = useT();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", notes: "" });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = (data ?? []).filter((c) => {
    const s = q.toLowerCase();
    return !s || c.name.toLowerCase().includes(s) || (c.phone ?? "").includes(s);
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("customers").insert({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
      created_by: u.user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["customers"] });
    setForm({ name: "", phone: "", notes: "" });
    setOpen(false);
    toast.success(t("Клиент добавлен"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t("Клиенты")}</h1>
          <p className="text-sm text-muted-foreground">{t("Справочник покупателей")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> {t("Добавить")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("Новый клиент")}</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div><Label>{t("Имя / компания *")}</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>{t("Телефон")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>{t("Комментарий")}</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <DialogFooter><Button type="submit">{t("Сохранить")}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("Поиск…")} className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Имя / компания")}</TableHead>
                <TableHead>{t("Телефон")}</TableHead>
                <TableHead>{t("Комментарий")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">{t("Загрузка…")}</TableCell></TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-destructive space-y-1">
                    <div>{t("Ошибка подключения к серверу или базе данных.")}</div>
                    <div className="text-xs text-muted-foreground">{(error as Error)?.message}</div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">{t("Пусто")}</TableCell></TableRow>
              ) : filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link to="/customers/$id" params={{ id: c.id }} className="hover:underline">{c.name}</Link>
                  </TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
