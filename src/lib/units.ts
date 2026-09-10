import { getLang } from "@/lib/i18n";

export type ProductUnit = "meter" | "kilogram" | "piece";

export function getProductUnits(): { value: ProductUnit; label: string }[] {
  const isUz = getLang() === "uz";
  return [
    { value: "meter", label: isUz ? "Metr (m)" : "Метры (м)" },
    { value: "kilogram", label: isUz ? "Kilogramm (kg)" : "Килограммы (кг)" },
    { value: "piece", label: isUz ? "Dona (dona)" : "Штуки (шт)" },
  ];
}

export const productUnits = getProductUnits();

export function unitShort(unit: string | null | undefined): string {
  const isUz = getLang() === "uz";
  const u = (unit ?? "").toLowerCase().trim();
  if (u === "kilogram" || u === "kg" || u === "кг") return isUz ? "kg" : "кг";
  if (u === "piece" || u === "pcs" || u === "шт" || u === "dona" || u === "d") return isUz ? "dona" : "шт";
  return isUz ? "m" : "м";
}

export function unitName(unit: string | null | undefined): string {
  const isUz = getLang() === "uz";
  const u = (unit ?? "").toLowerCase().trim();
  if (u === "kilogram" || u === "kg" || u === "кг") return isUz ? "kilogrammlarda" : "килограммах";
  if (u === "piece" || u === "pcs" || u === "шт" || u === "dona" || u === "d") return isUz ? "donalarda" : "штуках";
  return isUz ? "metrlarda" : "метрах";
}

export function unitInputLabel(unit: string | null | undefined): string {
  const isUz = getLang() === "uz";
  const u = (unit ?? "").toLowerCase().trim();
  if (u === "kilogram" || u === "kg" || u === "кг") return isUz ? "Miqdori, kg" : "Количество, кг";
  if (u === "piece" || u === "pcs" || u === "шт" || u === "dona" || u === "d") return isUz ? "Miqdori, dona" : "Количество, шт";
  return isUz ? "Miqdori, m" : "Количество, м";
}

export function unitStep(unit: string | null | undefined): string {
  const u = (unit ?? "").toLowerCase().trim();
  if (u === "piece" || u === "pcs" || u === "шт" || u === "dona" || u === "d") return "1";
  return "0.01";
}

export function parseProductNotes(notesStr: string | null | undefined): { unit_type: ProductUnit; notes: string } {
  if (!notesStr) return { unit_type: "meter", notes: "" };
  
  if (notesStr.startsWith("{") && notesStr.endsWith("}")) {
    try {
      const parsed = JSON.parse(notesStr);
      if (parsed && typeof parsed === "object") {
        const u = parsed.unit_type;
        const validUnit: ProductUnit = (u === "kilogram" || u === "piece" || u === "meter") ? u : "meter";
        return { unit_type: validUnit, notes: parsed.notes ?? "" };
      }
    } catch (_) {}
  }
  
  const match = notesStr.match(/^\[unit:(meter|kilogram|piece)\]\s*(.*)$/s);
  if (match) {
    return { unit_type: match[1] as ProductUnit, notes: match[2] };
  }
  
  return { unit_type: "meter", notes: notesStr };
}

export function formatProductNotes(notes: string | null | undefined, unit_type: ProductUnit): string {
  const cleanNotes = (notes ?? "").trim();
  if (unit_type === "meter") return cleanNotes;
  return `[unit:${unit_type}] ${cleanNotes}`.trim();
}

export function getProductUnit(product: any): ProductUnit {
  if (!product) return "meter";
  if (product.unit_type && (product.unit_type === "kilogram" || product.unit_type === "piece" || product.unit_type === "meter")) {
    return product.unit_type;
  }
  return parseProductNotes(product.notes).unit_type;
}

export function getProductCleanNotes(product: any): string {
  if (!product) return "";
  if (product.unit_type) return product.notes ?? "";
  return parseProductNotes(product.notes).notes;
}
