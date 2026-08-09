export type DebtPayment = {
  amount: number;
  date: string;
};

export type DebtInfo = {
  is_debt: boolean;
  due_date: string | null;
  is_paid: boolean;
  notes: string;
  paid_amount: number;
  payments: DebtPayment[];
};

export function parseSaleNotes(notesStr: string | null): DebtInfo {
  if (!notesStr) {
    return { is_debt: false, due_date: null, is_paid: false, notes: "", paid_amount: 0, payments: [] };
  }
  try {
    if (notesStr.startsWith("{") && notesStr.endsWith("}")) {
      const parsed = JSON.parse(notesStr);
      if (typeof parsed === "object" && parsed !== null && ("is_debt" in parsed || "is_paid" in parsed)) {
        return {
          is_debt: Boolean(parsed.is_debt),
          due_date: parsed.due_date ?? null,
          is_paid: Boolean(parsed.is_paid),
          notes: parsed.notes ?? "",
          paid_amount: Number(parsed.paid_amount) || 0,
          payments: Array.isArray(parsed.payments) ? parsed.payments : [],
        };
      }
    }
  } catch (e) {
    // Ignore JSON parse error, treat as raw text notes
  }
  return { is_debt: false, due_date: null, is_paid: false, notes: notesStr, paid_amount: 0, payments: [] };
}

export function formatSaleNotes(info: DebtInfo): string {
  if (!info.is_debt && !info.notes && !info.is_paid) return "";
  return JSON.stringify({
    is_debt: info.is_debt,
    due_date: info.due_date,
    is_paid: info.is_paid,
    notes: info.notes,
    paid_amount: info.paid_amount,
    payments: info.payments,
  });
}

/** Returns how much is still owed */
export function getRemainingDebt(debtInfo: DebtInfo, saleTotal: number): number {
  if (!debtInfo.is_debt) return 0;
  const remaining = saleTotal - debtInfo.paid_amount;
  return Math.max(0, remaining);
}

/** Returns percentage paid (0-100) */
export function getDebtProgress(debtInfo: DebtInfo, saleTotal: number): number {
  if (!debtInfo.is_debt || saleTotal <= 0) return 0;
  const pct = (debtInfo.paid_amount / saleTotal) * 100;
  return Math.min(100, Math.max(0, pct));
}

export function getDebtStatus(debtInfo: DebtInfo, saleTotal?: number): {
  status: "none" | "paid" | "partial" | "active" | "overdue";
  label: string;
  daysRemaining?: number;
} {
  if (!debtInfo.is_debt) return { status: "none", label: "Оплачено" };
  if (debtInfo.is_paid) return { status: "paid", label: "Долг погашен" };

  // Check if partially paid
  const hasPartialPayment = debtInfo.paid_amount > 0 && saleTotal !== undefined && debtInfo.paid_amount < saleTotal;

  if (!debtInfo.due_date) {
    if (hasPartialPayment) {
      const pct = Math.round((debtInfo.paid_amount / saleTotal!) * 100);
      return { status: "partial", label: `Частично оплачено (${pct}%)` };
    }
    return { status: "active", label: "В долг" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(debtInfo.due_date);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (hasPartialPayment) {
    const pct = Math.round((debtInfo.paid_amount / saleTotal!) * 100);
    if (diffDays < 0) {
      const overdueDays = Math.abs(diffDays);
      return {
        status: "overdue",
        label: `Частично (${pct}%), просрочено на ${overdueDays} дн.`,
        daysRemaining: diffDays,
      };
    }
    return {
      status: "partial",
      label: `Частично оплачено (${pct}%)`,
      daysRemaining: diffDays,
    };
  }

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      status: "overdue",
      label: `Просрочено на ${overdueDays} дн.`,
      daysRemaining: diffDays,
    };
  } else if (diffDays === 0) {
    return {
      status: "active",
      label: "Срок сегодня!",
      daysRemaining: 0,
    };
  } else {
    return {
      status: "active",
      label: `Срок через ${diffDays} дн.`,
      daysRemaining: diffDays,
    };
  }
}
