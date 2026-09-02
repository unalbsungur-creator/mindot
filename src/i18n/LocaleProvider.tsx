"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultLocale, isLocale, matchBrowserLocale, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./translations";

const STORAGE_KEY = "mindot-locale";

interface LocaleContextValue {
  locale: Locale;
  dictionary: Dictionary;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Client-side locale state: the interface language, kept separate from the
 * language any given thought is written in. Initializes from a saved
 * choice, falls back to the browser's language as a suggestion, and always
 * falls back to English. Persists to localStorage so the choice survives a
 * reload; a real account-level preference can replace this later without
 * changing how components read the dictionary.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    // A one-time correction from a browser-only source (localStorage, then
    // navigator.language) that can't be read during SSR or the first client
    // render, so the SSR-safe `defaultLocale` above is deliberately what
    // renders first. This is the one legitimate case the "no setState in an
    // effect" rule doesn't have a lighter-weight escape hatch for.
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && isLocale(saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocaleState(saved);
        return;
      }
    } catch {
      // localStorage unavailable (private browsing, etc.) — fall through.
    }
    setLocaleState(matchBrowserLocale(window.navigator.language));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore — persistence is a nicety, not a requirement.
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, dictionary: getDictionary(locale), setLocale }),
    [locale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return context;
}
