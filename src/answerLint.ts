/**
 * Подсветка стиля только для **ответов** (и шаблонов ответов). Сохранение не блокируется.
 *
 * Вопросы не проверяются: допустимы короткие формулировки, цифры, аббревиатуры и вставки на другом языке.
 *
 * Исходная строка в данных не меняется. Для ответов плейсхолдеры `{…}` учитываются на копии текста при проверке.
 */

export type PhraseLintIssue = { code: string; message: string };

export type LintScope = "answer" | "question";

/** Кратко под блоком «Вопросы» / шаблоны вопросов */
export const QUESTION_EDITOR_NOTE =
  "Вопросы могут быть короткими, с цифрами, аббревиатурами и вставками на другом языке — для них подсветки нет.";

/** Подсказка только для ответов (красная рамка) */
export const ANSWER_LINT_HINT =
  "Красная рамка — только для ответов: редактор не меняет текст. Не используйте цифры (пишите словами, напр. «тридцать»); в русском — без латиницы (напр. «прожект ви»); без аббревиатур товаров (одна заглавная без точки после неё или несколько заглавных подряд — лучше полное название); не короче 4 слов. В шаблонах `{product_name}` и т.п. при проверке учитываются как «пустые» фрагменты, сам текст вы не режете.";

/** @deprecated используйте ANSWER_LINT_HINT */
export const PHRASE_STYLE_HINT = ANSWER_LINT_HINT;

/** @deprecated используйте ANSWER_LINT_HINT */
export const ANSWER_STYLE_HINT = ANSWER_LINT_HINT;

function textForLintIgnoringPlaceholders(text: string): string {
  return text.replace(/\{[^}\s]+\}/g, " ");
}

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  let n = 0;
  for (const part of t.split(/\s+/)) {
    const w = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (w.length > 0) n++;
  }
  return n;
}

function hasDigit(text: string): boolean {
  return /\d/.test(text);
}

function hasLatinWord(text: string): boolean {
  return /[a-zA-Z]{2,}/.test(text);
}

function hasLoneUpperAbbrev(text: string): boolean {
  const re = /(?<![\p{L}\p{M}\p{N}])([A-ZА-ЯЁ])(?![\p{L}\p{M}\p{N}])(?!\.)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1] === "Я") continue;
    return true;
  }
  return false;
}

function hasMultiUpperAbbrevWord(text: string): boolean {
  const re = /(?<![\p{L}\p{M}\p{N}])([A-ZА-ЯЁ]{2,})(?![\p{L}\p{M}\p{N}])/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const word = m[1];
    if (/^(.)\1+$/.test(word)) continue;
    return true;
  }
  return false;
}

const CYR = /[\u0400-\u04FFЁё]/;

export function lintPhraseText(
  text: string,
  lang: "ru" | "en" | "de",
  scope: LintScope = "answer",
): PhraseLintIssue[] {
  if (scope === "question") return [];

  const raw = text.trim();
  if (!raw) return [];

  const forLint = textForLintIgnoringPlaceholders(raw).replace(/\s+/g, " ").trim();
  const issues: PhraseLintIssue[] = [];

  const checkBody = forLint.length > 0 ? forLint : raw;

  if (hasDigit(checkBody)) {
    issues.push({
      code: "digit",
      message: "Не используйте цифры — пишите словами (например «тридцать», не «30»).",
    });
  }

  const wc = countWords(forLint.length > 0 ? forLint : raw);
  if (wc > 0 && wc < 4) {
    issues.push({
      code: "short",
      message: "Формулировка короче 4 слов — разверните текст.",
    });
  }

  if (lang === "ru") {
    if (hasLatinWord(checkBody)) {
      issues.push({
        code: "latin_in_ru",
        message:
          "В русском тексте не используйте латиницу — пишите по-русски (например «прожект ви» вместо «project V»).",
      });
    }
    if (hasLoneUpperAbbrev(checkBody)) {
      issues.push({
        code: "abbr_letter",
        message:
          "Одна заглавная буква без точки после неё похожа на аббревиатуру — лучше полное название товара.",
      });
    }
    if (hasMultiUpperAbbrevWord(checkBody)) {
      issues.push({
        code: "abbr_caps",
        message:
          "Слово из нескольких заглавных букв похоже на аббревиатуру — используйте полное название.",
      });
    }
  } else if (lang === "en") {
    if (CYR.test(checkBody)) {
      issues.push({
        code: "cyrillic_in_en",
        message: "В английском тексте не должно быть кириллицы.",
      });
    }
  } else if (lang === "de") {
    if (CYR.test(checkBody)) {
      issues.push({
        code: "cyrillic_in_de",
        message: "В немецком тексте не должно быть кириллицы.",
      });
    }
  }

  return issues;
}

export function lintPhraseMessages(
  text: string,
  lang: "ru" | "en" | "de",
  scope: LintScope = "answer",
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { message } of lintPhraseText(text, lang, scope)) {
    if (seen.has(message)) continue;
    seen.add(message);
    out.push(message);
  }
  return out;
}

/** @deprecated передайте scope; по умолчанию только ответы */
export function lintAnswerText(text: string, lang: "ru" | "en" | "de"): PhraseLintIssue[] {
  return lintPhraseText(text, lang, "answer");
}

/** @deprecated передайте scope */
export function lintAnswerMessages(text: string, lang: "ru" | "en" | "de"): string[] {
  return lintPhraseMessages(text, lang, "answer");
}
