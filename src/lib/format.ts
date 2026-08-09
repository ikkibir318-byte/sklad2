import { getLang } from "@/lib/i18n";

function locale() {
  return getLang() === "uz" ? "uz-UZ" : "ru-RU";
}

export function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  const unit = getLang() === "uz" ? "so'm" : "сум";
  return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(n)} ${unit}`;
}

export function formatMeters(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  const unit = getLang() === "uz" ? "m" : "м";
  return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(n)} ${unit}`;
}

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString(locale(), { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(locale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
