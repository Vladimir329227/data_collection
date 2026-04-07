import type { ReactNode } from "react";
import { useCallback, useLayoutEffect, useRef } from "react";
import type { LangStrings } from "../kbSchema";
import { flattenLangStringsToRows, LANGS, type Lang, type LangTableRow } from "../langTableModel";

type Row = LangTableRow;

type Props = {
  value: LangStrings;
  onChange: (next: LangStrings) => void;
  legend?: ReactNode;
  lintCell?: (text: string, lang: Lang) => string[];
};

const LANG_LABELS: Record<Lang, string> = {
  ru: "Русский",
  en: "English",
  de: "Deutsch",
};

function newRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Таблица → JSON: у каждого языка свой массив без искусственного выравнивания пустыми строками.
 */
function rowsToLangStrings(rows: Row[]): LangStrings {
  const ru: string[] = [];
  const en: string[] = [];
  const de: string[] = [];
  for (const r of rows) {
    if (r.lang === "ru") ru.push(r.text);
    else if (r.lang === "en") en.push(r.text);
    else de.push(r.text);
  }
  return { ru, en, de };
}

function autosizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  const min = 40;
  el.style.height = `${Math.max(min, el.scrollHeight)}px`;
}

type AutoTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  className: string;
  spellCheck?: boolean;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
  title?: string;
};

function AutoTextarea({ value, onChange, className, spellCheck, ...rest }: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const sync = useCallback(() => {
    autosizeTextarea(ref.current);
  }, []);

  useLayoutEffect(() => {
    sync();
  }, [value, sync]);

  return (
    <textarea
      ref={ref}
      className={className}
      rows={1}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        requestAnimationFrame(sync);
      }}
      spellCheck={spellCheck}
      {...rest}
    />
  );
}

export function LangTripletTable({ value, onChange, legend, lintCell }: Props) {
  const rows = flattenLangStringsToRows(value);

  function commit(next: Row[]) {
    onChange(rowsToLangStrings(next));
  }

  function updateRows(mutate: (prev: Row[]) => Row[]) {
    commit(mutate(rows));
  }

  function setText(rowId: string, text: string) {
    updateRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, text } : r)));
  }

  function setLang(rowId: string, newLang: Lang) {
    updateRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, lang: newLang } : r)));
  }

  function removeRowById(rowId: string) {
    updateRows((prev) => prev.filter((r) => r.id !== rowId));
  }

  /** Одна новая строка, по умолчанию русский (пустая строка сохраняется в JSON). */
  function addRow() {
    updateRows((prev) => [...prev, { id: newRowId(), lang: "ru", text: "" }]);
  }

  return (
    <div className="langTripletWrap">
      {legend ? <p className="langTripletLegend">{legend}</p> : null}
      <table className="langRowsTable">
        <thead>
          <tr>
            <th className="langRowsColVariant" scope="col">
              №
            </th>
            <th className="langRowsColLang" scope="col">
              Язык
            </th>
            <th scope="col">Текст</th>
            <th className="langRowsColActions" scope="col" aria-label="Действия" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="langRowsEmpty">
                Нет строк. Нажмите «+ Добавить строку» — появится поле с русским языком по умолчанию.
              </td>
            </tr>
          ) : (
            rows.map((r, idx) => {
              const variantNum = idx + 1;
              const lintMsgs = lintCell?.(r.text, r.lang) ?? [];
              const hasLint = lintMsgs.length > 0;
              return (
                <tr key={r.id}>
                  <td className="langRowsColVariant">
                    <span className="langRowsVariantNum">{variantNum}</span>
                  </td>
                  <td className="langRowsColLang">
                    <select
                      className="langRowsSelect"
                      value={r.lang}
                      onChange={(e) => setLang(r.id, e.target.value as Lang)}
                      aria-label="Язык строки"
                    >
                      {LANGS.map((lang) => (
                        <option key={lang} value={lang}>
                          {LANG_LABELS[lang]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <AutoTextarea
                      className={hasLint ? "langTripletCell langTripletCell--error" : "langTripletCell"}
                      value={r.text}
                      onChange={(t) => setText(r.id, t)}
                      spellCheck={r.lang === "ru"}
                      aria-invalid={hasLint}
                      aria-label={`${LANG_LABELS[r.lang]}, запись ${variantNum}`}
                      title={hasLint ? lintMsgs.join("\n") : undefined}
                    />
                    {hasLint ? (
                      <ul className="langTripletLint">
                        {lintMsgs.map((msg) => (
                          <li key={msg}>{msg}</li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td className="langRowsColActions">
                    <button
                      type="button"
                      className="btn secondary langTripletRemove"
                      title="Удалить эту строку"
                      onClick={() => removeRowById(r.id)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <button type="button" className="btn secondary langTripletAdd" onClick={addRow}>
        + Добавить строку
      </button>
    </div>
  );
}
