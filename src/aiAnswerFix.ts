import { ANSWER_LINT_HINT, lintPhraseMessages } from "./answerLint";
import type { LangStrings } from "./kbSchema";
import { parseSlotRowId, type Lang, type LangTableRow } from "./langTableModel";

export type AiAnswerField = "answer" | "answer_template";

export type AiAnswerPatch = {
  field: AiAnswerField;
  lang: Lang;
  slot: number;
  text: string;
};

export type LintedAnswerRow = {
  row: LangTableRow;
  messages: string[];
  slot: number;
};

function outputFormatBlock(field: AiAnswerField): string {
  return `Формат ответа (строго соблюдайте, иначе редактор не сможет подставить текст):

1. Для каждой исправляемой записи начните строку с маркера (ровно так, латиница и пробелы):
   @@QAI@@ <поле> <язык> <индекс>
   где <поле> в этом сценарии должно быть ровно: ${field};
   <язык> — ru, en или de;
   <индекс> — целое число из задания (индекс слота в массиве).

2. Сразу после этой строки — полный исправленный текст записи (можно несколько абзацев).

3. Повторите блок для других записей. Не объединяйте две записи в один блок.

Пример:
@@QAI@@ ${field} ru 0
Здесь полный исправленный текст на русском, не короче четырёх слов и без цифр (для шаблонов сохраняйте плейсхолдеры вроде {product_name}).
@@QAI@@ ${field} en 0
Here is the full corrected text in English.`;
}

export function collectAnswerLintRows(rows: LangTableRow[]): LintedAnswerRow[] {
  const out: LintedAnswerRow[] = [];
  for (const row of rows) {
    const parsed = parseSlotRowId(row.id);
    if (!parsed) continue;
    const messages = lintPhraseMessages(row.text, row.lang, "answer");
    if (messages.length === 0) continue;
    out.push({ row, messages, slot: parsed.slot });
  }
  return out;
}

export function buildAiFixPrompt(
  scenarioId: string,
  field: AiAnswerField,
  rowsWithLint: LintedAnswerRow[],
): string {
  const fieldLabel =
    field === "answer" ? "ответы сценария (answers)" : "шаблоны ответов (answer_template)";

  const blocks = rowsWithLint.map(({ row, messages, slot }) => {
    const header = `@@QAI@@ ${field} ${row.lang} ${slot}`;
    const issues = messages.map((m) => `- ${m}`).join("\n");
    return [
      `--- Запись ${header}`,
      `Текущий текст (${row.lang}):`,
      row.text.trim() ? row.text : "(пусто)",
      "",
      "Что нужно исправить:",
      issues,
    ].join("\n");
  });

  return [
    "Вы редактор базы знаний голосового аватара магазина Project V. Нужно исправить формулировки ответов по правилам ниже.",
    "",
    `Сценарий (id): ${scenarioId}`,
    `Раздел: ${fieldLabel}`,
    "",
    "Правила для ответов (и шаблонов с плейсхолдерами вроде {product_name}):",
    ANSWER_LINT_HINT,
    "",
    "Задания по записям с замечаниями редактора:",
    "",
    blocks.join("\n\n"),
    "",
    outputFormatBlock(field),
  ].join("\n");
}

export function parseAiFixResponse(raw: string): { patches: AiAnswerPatch[]; errors: string[] } {
  const patches: AiAnswerPatch[] = [];
  const errors: string[] = [];
  const parts = raw.split(/^@@QAI@@[ \t]*/m);
  const headerRe = /^(answer|answer_template)[ \t]+(ru|en|de)[ \t]+(\d+)\s*(?:\r?\n|$)/;

  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const hm = headerRe.exec(chunk);
    if (!hm) {
      errors.push(`Блок ${i}: нет заголовка «answer|answer_template lang slot» после @@QAI@@`);
      continue;
    }
    const field = hm[1] as AiAnswerField;
    const lang = hm[2] as Lang;
    const slot = Number(hm[3]);
    if (!Number.isInteger(slot) || slot < 0) {
      errors.push(`Блок ${i}: неверный индекс слота`);
      continue;
    }
    const body = chunk.slice(hm[0].length).replace(/\s+$/u, "");
    patches.push({ field, lang, slot, text: body });
  }

  return { patches, errors };
}

export function applyAiPatchesToLangStrings(
  current: LangStrings,
  patches: AiAnswerPatch[],
  field: AiAnswerField,
): LangStrings {
  const relevant = patches.filter((p) => p.field === field);
  if (relevant.length === 0) return current;
  const next: LangStrings = {
    ru: [...current.ru],
    en: [...current.en],
    de: [...current.de],
  };
  for (const p of relevant) {
    const arr = [...next[p.lang]];
    while (arr.length <= p.slot) arr.push("");
    arr[p.slot] = p.text;
    next[p.lang] = arr;
  }
  return next;
}
