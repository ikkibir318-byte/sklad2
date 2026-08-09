import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { dictCommon } from "./dict-common";
import { dictAuth } from "./dict-auth";
import { dictDashboard } from "./dict-dashboard";
import { dictInventory } from "./dict-inventory";
import { dictSales } from "./dict-sales";
import { dictCustomers } from "./dict-customers";
import { dictReports } from "./dict-reports";
import { dictTeam } from "./dict-team";

export type Lang = "ru" | "uz";

const uz: Record<string, string> = {
  ...dictCommon,
  ...dictAuth,
  ...dictDashboard,
  ...dictInventory,
  ...dictSales,
  ...dictCustomers,
  ...dictReports,
  ...dictTeam,
};

const STORAGE_KEY = "kabeluchet_lang";

/** Current language, mirrored outside React for formatters. */
let currentLang: Lang = "ru";

export function getLang(): Lang {
  return currentLang;
}

/** Translate a Russian source string into the active language. */
export function translate(text: string, lang: Lang = currentLang): string {
  if (lang === "ru") return text;
  return uz[text] ?? text;
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (s: string) => string };

const LanguageContext = createContext<Ctx>({
  lang: "ru",
  setLang: () => {},
  t: (s) => s,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ru");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored === "uz" || stored === "ru") {
      currentLang = stored;
      setLangState(stored);
      document.documentElement.lang = stored;
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    currentLang = l;
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
    setLangState(l);
  }, []);

  const t = useCallback((s: string) => translate(s, lang), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>
  );
}

export function useI18n() {
  return useContext(LanguageContext);
}

/** Shorthand hook returning just the translate function. */
export function useT() {
  return useI18n().t;
}
