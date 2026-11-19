import { createContext, useContext } from "react";
import { danish } from "./translations";

export type Language = "en" | "da";
export const Locale = createContext<Language>("en");

export function translator(language: Language) {
  return (text: string, values: Record<string, string | number> = {}): string =>
    (language === "da" ? danish[text] ?? text : text).replace(/\{(\w+)\}/g,
      (placeholder, key: string) => key in values ? String(values[key]) : placeholder);
}

export function useLocale() {
  const language = useContext(Locale);
  return { language, t: translator(language) };
}
