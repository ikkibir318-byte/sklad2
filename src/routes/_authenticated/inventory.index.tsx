import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatQuantity } from "@/lib/format";
import { unitShort, getProductUnit } from "@/lib/units";
import { useT } from "@/lib/i18n";
import { Plus, Search } from "lucide-react";
import { isAdmin } from "@/routes/auth";

export const Route = createFileRoute("/_authenticated/inventory/")({
  component: InventoryList,
});

function InventoryList() {
  const t = useT();
  const [q, setQ] = useState("");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["cable_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cable_products")
        .select("*")
        .order("brand");
      if (error) throw error;
      return data;
    },
  });

  const { data: coils } = useQuery({
    queryKey: ["cable_coils"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cable_coils")
        .select("id, product_id, coil_number, meters")
        .order("coil_number");
      if (error) throw error;
      return data;
    },
  });

  const coilsByProduct = (coils ?? []).reduce<Record<string, { id: string; coil_number: string; meters: number }[]>>((acc, c) => {
    (acc[c.product_id] ||= []).push({ id: c.id, coil_number: c.coil_number, meters: Number(c.meters) });
    return acc;
  }, {});

  const filtered = (data ?? []).filter((p) => {
    const s = q.toLowerCase();
    return (
      !s ||
      p.brand.toLowerCase().includes(s) ||
      (p.cross_section ?? "").toLowerCase().includes(s) ||
      (p.supplier ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t("Склад")}</h1>
          <p className="text-sm text-muted-foreground">{t("Кабели, товары на вес и штучные товары")}</p>
        </div>
        {isAdmin() && (
          <Button asChild>
            <Link to="/inventory/new">
              <Plus className="mr-2 h-4 w-4" /> {t("Добавить позицию")}
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("Поиск по марке, сечению, поставщику…")}
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Наименование")}</TableHead>
                  <TableHead>{t("Характеристика")}</TableHead>
                  <TableHead>{t("Поставщик")}</TableHead>
                  <TableHead className="text-right">{t("Закуп")}</TableHead>
                  <TableHead className="text-right">{t("Продажа")}</TableHead>
                  <TableHead>{t("Единица / бухты")}</TableHead>
                  <TableHead className="text-right">{t("Остаток")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t("Загрузка…")}</TableCell></TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-destructive py-8 space-y-1">
                      <div>{t("Ошибка подключения к серверу или базе данных.")}</div>
                      <div className="text-xs text-muted-foreground">{(error as Error)?.message}</div>
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {t("Ничего не найдено.")} {isAdmin() && <Link to="/inventory/new" className="underline ml-1">{t("Добавить позицию")}</Link>}
                  </TableCell></TableRow>
                ) : filtered.map((p) => {
                  const unit = getProductUnit(p);
                  const quantity = Number((p as any).stock_quantity ?? p.stock_meters ?? 0);
                  const low = quantity <= Number(p.low_stock_threshold ?? 0);
                  return (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <Link to="/inventory/$id" params={{ id: p.id }} className="block">
                          {p.brand}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link to="/inventory/$id" params={{ id: p.id }}>
                          {p.cross_section && p.cross_section !== "-" ? p.cross_section : "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.supplier ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatMoney(p.purchase_price)}/{unitShort(unit)}</TableCell>
                      <TableCell className="text-right">{formatMoney(p.sale_price)}/{unitShort(unit)}</TableCell>
                      <TableCell>
                        {unit !== "meter" ? (
                          <Badge variant="outline" className="font-normal uppercase">
                            {unitShort(unit)}
                          </Badge>
                        ) : (coilsByProduct[p.id] ?? []).length === 0 ? (
                          <span className="text-muted-foreground">{t("Нет бухт")}</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(coilsByProduct[p.id] ?? []).map((c) => (
                              <Badge key={c.id} variant="secondary" className="font-normal">
                                {c.coil_number}: {formatQuantity(c.meters, "meter")}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {low ? (
                          <Badge variant="destructive">{formatQuantity(quantity, unit)}</Badge>
                        ) : (
                          <span className="font-medium">{formatQuantity(quantity, unit)}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
