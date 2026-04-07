import type { KnowledgeBase } from "../kbSchema";
import { LangTripletTable } from "./LangTripletTable";

type Props = {
  kb: KnowledgeBase;
  onChange: (next: KnowledgeBase) => void;
};

export function AliasesTab({ kb, onChange }: Props) {
  const ids = Object.keys(kb.product_aliases).sort();

  function setAliases(pid: string, langs: { ru: string[]; en: string[]; de: string[] }) {
    const next = { ...kb, product_aliases: { ...kb.product_aliases } };
    next.product_aliases[pid] = langs;
    onChange(next);
  }

  function addProduct() {
    const id = window.prompt("ID продукта (например GS):", "")?.trim();
    if (!id || kb.product_aliases[id]) return;
    onChange({
      ...kb,
      product_aliases: {
        ...kb.product_aliases,
        [id]: { ru: [], en: [], de: [] },
      },
    });
  }

  function removeProduct(pid: string) {
    if (!window.confirm(`Удалить псевдонимы для «${pid}»?`)) return;
    const next = { ...kb, product_aliases: { ...kb.product_aliases } };
    delete next.product_aliases[pid];
    onChange(next);
  }

  return (
    <div className="panel">
      <div className="panelHead">
        <span>Продуктов: {ids.length}</span>
        <button type="button" className="btn secondary" onClick={addProduct}>
          + Продукт
        </button>
      </div>
      <div className="aliasList">
        {ids.map((pid) => {
          const a = kb.product_aliases[pid];
          return (
            <details key={pid} className="aliasCard">
              <summary>
                <strong>{pid}</strong>
                <button
                  type="button"
                  className="btn link danger"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeProduct(pid);
                  }}
                >
                  Удалить
                </button>
              </summary>
              <LangTripletTable
                value={a}
                onChange={(langs) => setAliases(pid, langs)}
                legend="Каждая строка — свой номер и язык. «Добавить строку» — одно поле, по умолчанию русский."
              />
            </details>
          );
        })}
      </div>
    </div>
  );
}
