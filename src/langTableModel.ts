import type { LangStrings } from "./kbSchema";

export const LANGS = ["ru", "en", "de"] as const;

export type Lang = (typeof LANGS)[number];

export type LangTableRow = {
  id: string;
  lang: Lang;
  text: string;
};

/** Из id вида slot12-ru → индекс в массиве языка для применения правок ИИ */
export function parseSlotRowId(id: string): { slot: number; lang: Lang } | null {
  const m = /^slot(\d+)-(ru|en|de)$/.exec(id);
  if (!m) return null;
  return { slot: Number(m[1]), lang: m[2] as Lang };
}

function siblingHasNonEmptyText(i: number, exclude: Lang, v: LangStrings): boolean {
  for (const L of LANGS) {
    if (L === exclude) continue;
    if (i >= v[L].length) continue;
    if ((v[L][i] ?? "").trim() !== "") return true;
  }
  return false;
}

function hasAnyNonEmptyBeforeSlot(v: LangStrings, i: number): boolean {
  for (let j = 0; j < i; j++) {
    for (const L of LANGS) {
      if (j < v[L].length && (v[L][j] ?? "").trim() !== "") return true;
    }
  }
  return false;
}

function isSuffixAllEmptyForLang(v: LangStrings, lang: Lang, i: number): boolean {
  const arr = v[lang];
  for (let k = i; k < arr.length; k++) {
    if ((arr[k] ?? "").trim() !== "") return false;
  }
  return true;
}

/**
 * JSON → строки таблицы: не показываем пустые en/de «подпорки» у непустого ru/en/de на том же индексе.
 * Ведущий блок ru[i]=en[i]=de[i]="" без контента выше — не показываем (старый padding в JSON).
 * Несколько пустых ru подряд в конце массива — каждая строка видна («+ Добавить строку»).
 */
export function flattenLangStringsToRows(v: LangStrings): LangTableRow[] {
  const n = Math.max(v.ru.length, v.en.length, v.de.length);
  if (n === 0) return [];
  const rows: LangTableRow[] = [];
  for (let i = 0; i < n; i++) {
    const triplePresent = i < v.ru.length && i < v.en.length && i < v.de.length;
    if (
      triplePresent &&
      !v.ru[i].trim() &&
      !v.en[i].trim() &&
      !v.de[i].trim() &&
      !hasAnyNonEmptyBeforeSlot(v, i)
    ) {
      continue;
    }
    for (const lang of LANGS) {
      if (i >= v[lang].length) continue;
      const text = v[lang][i] ?? "";
      if (text.trim() !== "") {
        rows.push({ id: `slot${i}-${lang}`, lang, text });
        continue;
      }
      if (!isSuffixAllEmptyForLang(v, lang, i)) continue;
      const earlierEmptyAtSameIndex = LANGS.slice(0, LANGS.indexOf(lang)).some(
        (L) => i < v[L].length && (v[L][i] ?? "") === "",
      );
      if (earlierEmptyAtSameIndex) continue;
      if (siblingHasNonEmptyText(i, lang, v)) continue;
      rows.push({ id: `slot${i}-${lang}`, lang, text: "" });
    }
  }
  return rows;
}
