import { ANSWER_LINT_HINT, QUESTION_EDITOR_NOTE } from "./answerLint";
import type { LangStrings } from "./kbSchema";
import { LANGS, type Lang } from "./langTableModel";

export type VariantMode = "regular" | "template";

export type LangTextItem = { lang: Lang; text: string };

function stripMarkdownJsonFence(s: string): string {
  let t = s.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/im;
  const m = fence.exec(t);
  if (m) t = m[1].trim();
  return t;
}

/** Все непустые строки из массивов ru/en/de (как в JSON сценария). */
export function formatExistingLinesForPrompt(v: LangStrings, title: string): string {
  const lines: string[] = [];
  for (const lang of LANGS) {
    const arr = v[lang];
    for (let i = 0; i < arr.length; i++) {
      const text = (arr[i] ?? "").trim();
      if (!text) continue;
      const oneLine = text.replace(/\s+/g, " ");
      lines.push(`- [${lang}] ${oneLine}`);
    }
  }
  const body = lines.length > 0 ? lines.join("\n") : "(непустых строк пока нет)";
  return `${title}\n${body}`;
}

const JSON_SPEC = `Верните только один JSON-объект (без пояснений до и после, без markdown-ограждений), строго такой структуры:
{
  "questions": [ { "lang": "ru", "text": "новый вариант вопроса" } ],
  "answers": [ { "lang": "en", "text": "новый вариант ответа" } ]
}

Поля:
- "lang" — только "ru", "en" или "de".
- "text" — одна строка варианта (допускается несколько предложений; переносы строк внутри допустимы в JSON-строке).
- Массивы могут быть пустыми, если новых вариантов для этой части не предлагаете.
- Не включайте id, номера слотов и служебные поля — только lang и text для каждого нового варианта.`;

export function buildVariantsPrompt(
  scenarioId: string,
  mode: VariantMode,
  questions: LangStrings,
  answers: LangStrings,
): string {
  const qTitle =
    mode === "regular" ? "Текущие варианты вопросов сценария" : "Текущие шаблоны вопросов (с {product})";
  const aTitle =
    mode === "regular" ? "Текущие варианты ответов сценария" : "Текущие шаблоны ответов (плейсхолдеры вроде {product_name})";

  const templateBlock =
    mode === "template"
      ? [
          "",
          "Особенности шаблонов product_template:",
          "- В новых вопросах используйте плейсхолдер {product} там, где нужно подставить название товара.",
          "- В новых ответах сохраняйте принятые в базе плейсхолдеры ({product_name}, {product_benefit} и т.д.), не вырезайте их ради «красоты» текста.",
        ].join("\n")
      : "";

  return [
    "Вы помощник по расширению базы знаний голосового аватара магазина Project V.",
    "Нужно придумать **новые** формулировки вопросов и ответов для уже существующего сценария диалога — они **добавятся** к данным, а не заменят текущие строки.",
    "",
    `Сценарий (id): ${scenarioId}`,
    "",
    formatExistingLinesForPrompt(questions, qTitle),
    "",
    formatExistingLinesForPrompt(answers, aTitle),
    "",
    "Важно: новые варианты **не должны дублировать** уже перечисленные (ни дословно, ни близким перефразированием с тем же смыслом). Предлагайте осмысленно другие углы, формулировки и ситуации, оставаясь в контексте магазина и темы сценария.",
    templateBlock,
    "",
    "Правила для **новых вопросов** (и шаблонов вопросов):",
    QUESTION_EDITOR_NOTE,
    "Не повторяйте уже существующие вопросы. Можно короткие формулировки, цифры, аббревиатуры, вставки на другом языке — это нормально.",
    "",
    "Правила для **новых ответов** (чтобы потом не пришлось править вручную):",
    ANSWER_LINT_HINT,
    "Дополнительно: не используйте цифры — только словами; в русском без латиницы; без «аббревиатурных» заглавных букв в названиях; ответ не короче четырёх слов (плейсхолдеры {…} в шаблонах не считаются за «слова» при оценке длины — оставляйте их как есть).",
    "",
    JSON_SPEC,
  ].join("\n");
}

function parseItemArray(raw: unknown, section: string, errors: string[]): LangTextItem[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push(`Раздел "${section}" должен быть массивом.`);
    return [];
  }
  const out: LangTextItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const el = raw[i];
    if (!el || typeof el !== "object") {
      errors.push(`"${section}"[${i}]: пропущен объект.`);
      continue;
    }
    const lang = (el as { lang?: unknown }).lang;
    const text = (el as { text?: unknown }).text;
    if (lang !== "ru" && lang !== "en" && lang !== "de") {
      errors.push(`"${section}"[${i}]: поле lang должно быть ru, en или de.`);
      continue;
    }
    if (typeof text !== "string") {
      errors.push(`"${section}"[${i}]: поле text должно быть строкой.`);
      continue;
    }
    out.push({ lang, text });
  }
  return out;
}

export function parseVariantsAiResponse(raw: string): {
  questionItems: LangTextItem[];
  answerItems: LangTextItem[];
  errors: string[];
} {
  const errors: string[] = [];
  const cleaned = stripMarkdownJsonFence(raw);
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    errors.push("Ответ не удалось разобрать как JSON. Уберите текст вокруг и проверьте кавычки.");
    return { questionItems: [], answerItems: [], errors };
  }
  if (!data || typeof data !== "object") {
    errors.push("Корень JSON должен быть объектом.");
    return { questionItems: [], answerItems: [], errors };
  }
  const o = data as Record<string, unknown>;
  const questionItems = parseItemArray(o.questions, "questions", errors);
  const answerItems = parseItemArray(o.answers, "answers", errors);
  return { questionItems, answerItems, errors };
}

function hasExactLine(langStrings: LangStrings, lang: Lang, text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return langStrings[lang].some((x) => x.trim() === t);
}

/** Добавляет в конец массивов языка; дубликаты (точное совпадение после trim) пропускает. */
export function appendVariantItems(current: LangStrings, items: LangTextItem[]): LangStrings {
  const next: LangStrings = {
    ru: [...current.ru],
    en: [...current.en],
    de: [...current.de],
  };
  for (const { lang, text } of items) {
    const t = text.trim();
    if (!t) continue;
    if (hasExactLine(next, lang, t)) continue;
    next[lang] = [...next[lang], text];
  }
  return next;
}
