import { useEffect, useMemo, useState } from "react";
import type { KnowledgeBase, QaPair } from "../kbSchema";
import { isProductTemplate } from "../kbSchema";
import { ANSWER_LINT_HINT, lintPhraseMessages, QUESTION_EDITOR_NOTE } from "../answerLint";
import { AiScenarioTools } from "./AiScenarioTools";
import { LangTripletTable } from "./LangTripletTable";

type Props = {
  kb: KnowledgeBase;
  onChange: (next: KnowledgeBase) => void;
};

const CATEGORIES = ["small_talk", "info", "recommendation", "product_info"] as const;

export function QaTab({ kb, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pairs = kb.qa_pairs;
    if (!q) return pairs;
    return pairs.filter((p) => {
      if (p.id.toLowerCase().includes(q)) return true;
      if (p.category.toLowerCase().includes(q)) return true;
      if (isProductTemplate(p)) {
        return Object.values(p.question_templates)
          .flat()
          .some((s) => s.toLowerCase().includes(q));
      }
      return Object.values(p.questions)
        .flat()
        .some((s) => s.toLowerCase().includes(q));
    });
  }, [kb.qa_pairs, search]);

  const selected = selectedId ? kb.qa_pairs.find((p) => p.id === selectedId) : null;

  const displayList = filtered.slice(0, 250);
  const truncated = filtered.length > 250;

  function replacePair(updated: QaPair) {
    const idx = kb.qa_pairs.findIndex((p) => p.id === updated.id);
    if (idx < 0) return;
    const nextPairs = kb.qa_pairs.slice();
    nextPairs[idx] = updated;
    onChange({ ...kb, qa_pairs: nextPairs });
  }

  function addDialogScenario() {
    const id =
      window.prompt("ID новой пары (уникальный):", `NEW_${Date.now()}`)?.trim() ?? "";
    if (!id || kb.qa_pairs.some((p) => p.id === id)) return;
    const pair: QaPair = {
      id,
      category: "info",
      questions: { ru: [], en: [], de: [] },
      answers: { ru: [], en: [], de: [] },
      product_filter: null,
    };
    onChange({ ...kb, qa_pairs: [...kb.qa_pairs, pair] });
    setSelectedId(id);
  }

  function removeSelected() {
    if (!selected) return;
    if (!window.confirm(`Удалить пару «${selected.id}»?`)) return;
    onChange({
      ...kb,
      qa_pairs: kb.qa_pairs.filter((p) => p.id !== selected.id),
    });
    setSelectedId(null);
  }

  return (
    <div className="qaLayout">
      <div className="qaListPane">
        <input
          type="search"
          className="searchInput"
          placeholder="Поиск по id, категории, тексту вопроса…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="panelHead">
          <span>
            Показано {displayList.length} / {filtered.length}
            {truncated ? " (лимит 250, уточните поиск)" : ""}
          </span>
          <div className="btnRow">
            <button type="button" className="btn secondary" onClick={addDialogScenario}>
              Добавить сценарий диалога
            </button>
          </div>
        </div>
        <ul className="qaList">
          {displayList.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={selectedId === p.id ? "qaItem active" : "qaItem"}
                onClick={() => setSelectedId(p.id)}
              >
                <span className="qaId">{p.id}</span>
                <span className="qaCat">{p.category}</span>
                {isProductTemplate(p) ? (
                  <span className="tag">шаблон</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="qaEditorPane">
        {!selected ? (
          <p className="muted">Выберите пару слева или создайте новую.</p>
        ) : isProductTemplate(selected) ? (
          <TemplateEditor pair={selected} onSave={replacePair} onRemove={removeSelected} />
        ) : (
          <RegularEditor pair={selected} onSave={replacePair} onRemove={removeSelected} />
        )}
      </div>
    </div>
  );
}

function RegularEditor({
  pair,
  onSave,
  onRemove,
}: {
  pair: Exclude<QaPair, { type: "product_template" }>;
  onSave: (p: QaPair) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(pair);
  useEffect(() => {
    setDraft(pair);
  }, [pair]);

  return (
    <div className="editorCard">
      <div className="editorHead">
        <strong>{pair.id}</strong>
        <button type="button" className="btn danger secondary" onClick={onRemove}>
          Удалить
        </button>
      </div>
      <label className="field inline">
        <span className="label">Категория</span>
        <select
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="field inline">
        <span className="label">product_filter</span>
        <input
          type="text"
          value={draft.product_filter ?? ""}
          placeholder="null — пусто"
          onChange={(e) =>
            setDraft({
              ...draft,
              product_filter: e.target.value.trim() || null,
            })
          }
        />
      </label>
      <h4>Вопросы</h4>
      <LangTripletTable
        value={draft.questions}
        onChange={(questions) => setDraft({ ...draft, questions })}
        legend={
          <>
            Каждая строка — отдельная запись с своим номером; язык в списке. «Добавить строку» создаёт одно поле (по умолчанию русский).
            <br />
            <br />
            {QUESTION_EDITOR_NOTE}
          </>
        }
      />
      <h4>Ответы</h4>
      <LangTripletTable
        value={draft.answers}
        onChange={(answers) => setDraft({ ...draft, answers })}
        legend={
          <>
            Каждая строка — свой номер; ответы на разных языках — отдельные строки.
            <br />
            <br />
            {ANSWER_LINT_HINT}
          </>
        }
        lintCell={(text, lang) => lintPhraseMessages(text, lang, "answer")}
      />
      <button
        type="button"
        className="btn primary"
        onClick={() =>
          onSave({
            ...draft,
            product_filter: draft.product_filter?.trim() ? draft.product_filter.trim() : null,
          })
        }
      >
        Сохранить пару
      </button>
      <AiScenarioTools
        scenarioId={pair.id}
        mode="regular"
        answerField="answer"
        questions={draft.questions}
        answers={draft.answers}
        onApplyFixAnswers={(answers) => setDraft({ ...draft, answers })}
        onApplyVariants={(questions, answers) => setDraft({ ...draft, questions, answers })}
      />
    </div>
  );
}

function TemplateEditor({
  pair,
  onSave,
  onRemove,
}: {
  pair: Extract<QaPair, { type: "product_template" }>;
  onSave: (p: QaPair) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(pair);
  useEffect(() => {
    setDraft(pair);
  }, [pair]);

  return (
    <div className="editorCard">
      <div className="editorHead">
        <strong>{pair.id}</strong>
        <span className="tag">product_template</span>
        <button type="button" className="btn danger secondary" onClick={onRemove}>
          Удалить
        </button>
      </div>
      <label className="field inline">
        <span className="label">Категория</span>
        <select
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <h4>Шаблоны вопросов ({`{product}`})</h4>
      <LangTripletTable
        value={draft.question_templates}
        onChange={(question_templates) => setDraft({ ...draft, question_templates })}
        legend={
          <>
            Вариант вопроса: выберите язык строки и шаблон с {"{product}"}.
            <br />
            <br />
            {QUESTION_EDITOR_NOTE}
          </>
        }
      />
      <h4>Шаблоны ответов ({`{product_name}`}, {`{product_benefit}`})</h4>
      <LangTripletTable
        value={draft.answer_template}
        onChange={(answer_template) => setDraft({ ...draft, answer_template })}
        legend={
          <>
            Шаблон ответа: язык в списке, в тексте — плейсхолдеры вроде {"{product_name}"}, {"{product_benefit}"}.
            <br />
            <br />
            {ANSWER_LINT_HINT}
          </>
        }
        lintCell={(text, lang) => lintPhraseMessages(text, lang, "answer")}
      />
      <button type="button" className="btn primary" onClick={() => onSave(draft)}>
        Сохранить шаблон
      </button>
      <AiScenarioTools
        scenarioId={pair.id}
        mode="template"
        answerField="answer_template"
        questions={draft.question_templates}
        answers={draft.answer_template}
        onApplyFixAnswers={(answer_template) => setDraft({ ...draft, answer_template })}
        onApplyVariants={(question_templates, answer_template) =>
          setDraft({ ...draft, question_templates, answer_template })
        }
      />
    </div>
  );
}
