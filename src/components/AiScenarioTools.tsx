import { useMemo, useState } from "react";
import {
  applyAiPatchesToLangStrings,
  buildAiFixPrompt,
  collectAnswerLintRows,
  parseAiFixResponse,
  type AiAnswerField,
} from "../aiAnswerFix";
import {
  appendVariantItems,
  buildVariantsPrompt,
  parseVariantsAiResponse,
  type VariantMode,
} from "../aiScenarioVariants";
import type { LangStrings } from "../kbSchema";
import { flattenLangStringsToRows } from "../langTableModel";

type Props = {
  scenarioId: string;
  mode: VariantMode;
  answerField: AiAnswerField;
  questions: LangStrings;
  answers: LangStrings;
  onApplyFixAnswers: (next: LangStrings) => void;
  onApplyVariants: (questions: LangStrings, answers: LangStrings) => void;
};

export function AiScenarioTools({
  scenarioId,
  mode,
  answerField,
  questions,
  answers,
  onApplyFixAnswers,
  onApplyVariants,
}: Props) {
  const [fixOpen, setFixOpen] = useState(false);
  const [fixPaste, setFixPaste] = useState("");
  const [fixStatus, setFixStatus] = useState<"idle" | "ok" | "err">("idle");
  const [fixStatusMsg, setFixStatusMsg] = useState("");

  const [varOpen, setVarOpen] = useState(false);
  const [varPaste, setVarPaste] = useState("");
  const [varStatus, setVarStatus] = useState<"idle" | "ok" | "err">("idle");
  const [varStatusMsg, setVarStatusMsg] = useState("");

  const linted = useMemo(() => {
    const rows = flattenLangStringsToRows(answers);
    return collectAnswerLintRows(rows);
  }, [answers]);

  const fixPrompt = useMemo(
    () => buildAiFixPrompt(scenarioId, answerField, linted),
    [scenarioId, answerField, linted],
  );

  const variantsPrompt = useMemo(
    () => buildVariantsPrompt(scenarioId, mode, questions, answers),
    [scenarioId, mode, questions, answers],
  );

  function copyFixPrompt() {
    void navigator.clipboard.writeText(fixPrompt);
    setFixStatus("ok");
    setFixStatusMsg("Промпт скопирован в буфер обмена.");
  }

  function applyFixPasted() {
    setFixStatus("idle");
    setFixStatusMsg("");
    const { patches, errors } = parseAiFixResponse(fixPaste);
    const forField = patches.filter((p) => p.field === answerField);
    if (forField.length === 0) {
      setFixStatus("err");
      setFixStatusMsg(
        errors.length > 0
          ? `Не удалось разобрать ответ ИИ: ${errors.join(" ")}`
          : "Не найдено ни одного блока @@QAI@@ с нужным полем — проверьте формат.",
      );
      return;
    }
    const next = applyAiPatchesToLangStrings(answers, forField, answerField);
    onApplyFixAnswers(next);
    const warn = errors.length > 0 ? ` Предупреждения: ${errors.join(" ")}` : "";
    setFixStatus("ok");
    setFixStatusMsg(`Подставлено записей: ${forField.length}.${warn}`);
  }

  function copyVariantsPrompt() {
    void navigator.clipboard.writeText(variantsPrompt);
    setVarStatus("ok");
    setVarStatusMsg("Промпт скопирован в буфер обмена.");
  }

  function applyVariantsPasted() {
    setVarStatus("idle");
    setVarStatusMsg("");
    const { questionItems, answerItems, errors } = parseVariantsAiResponse(varPaste);
    if (questionItems.length === 0 && answerItems.length === 0) {
      setVarStatus("err");
      setVarStatusMsg(
        errors.length > 0
          ? errors.join(" ")
          : "В JSON нет ни одного нового варианта в questions или answers.",
      );
      return;
    }
    const nextQ = appendVariantItems(questions, questionItems);
    const nextA = appendVariantItems(answers, answerItems);
    onApplyVariants(nextQ, nextA);
    const warn = errors.length > 0 ? ` Замечания: ${errors.join(" ")}` : "";
    setVarStatus("ok");
    setVarStatusMsg(
      `Добавлено вопросов: ${questionItems.length}, ответов: ${answerItems.length}.${warn}`,
    );
  }

  return (
    <div className="aiScenarioTools">
      <div className="aiScenarioAiButtonsRow">
        {linted.length > 0 ? (
          <button type="button" className="btn secondary" onClick={() => setFixOpen((o) => !o)}>
            {fixOpen ? "▼ Скрыть исправление ошибок" : "Исправить ошибки с помощью ИИ"}
          </button>
        ) : null}
        <button type="button" className="btn secondary" onClick={() => setVarOpen((o) => !o)}>
          {varOpen ? "▼ Скрыть варианты" : "Добавить варианты вопросов и ответа с помощью ИИ"}
        </button>
      </div>

      {linted.length > 0 && fixOpen ? (
        <div className="aiScenarioToolPanelBlock">
          <p className="aiScenarioFixHint muted">
            Скопируйте промпт в чат с ИИ, вставьте ответ в нижнее поле и нажмите «Применить исправления». Подставляются
            только блоки с полем <code>{answerField}</code> для сценария «{scenarioId}».
          </p>
          <div className="aiScenarioFixRow">
            <span className="aiScenarioFixLabel">Промпт для ИИ (исправление ответов)</span>
            <textarea className="aiScenarioFixTextarea" readOnly rows={14} value={fixPrompt} spellCheck={false} />
            <div className="btnRow">
              <button type="button" className="btn secondary" onClick={copyFixPrompt}>
                Копировать промпт
              </button>
            </div>
          </div>
          <div className="aiScenarioFixRow">
            <span className="aiScenarioFixLabel">Ответ ИИ</span>
            <textarea
              className="aiScenarioFixTextarea"
              rows={10}
              value={fixPaste}
              onChange={(e) => setFixPaste(e.target.value)}
              placeholder={'Блоки @@QAI@@ answer ru 0\n…'}
              spellCheck={false}
            />
            <div className="btnRow">
              <button type="button" className="btn primary" onClick={applyFixPasted}>
                Применить исправления
              </button>
            </div>
          </div>
          {fixStatus !== "idle" && fixStatusMsg ? (
            <p className={fixStatus === "ok" ? "aiScenarioFixStatus ok" : "aiScenarioFixStatus err"}>
              {fixStatusMsg}
            </p>
          ) : null}
        </div>
      ) : null}

      {varOpen ? (
        <div className="aiScenarioToolPanelBlock">
          <p className="aiScenarioFixHint muted">
            В промпте перечислены все текущие варианты вопросов и ответов. ИИ должна предложить <strong>новые</strong>{" "}
            строки в JSON без id — они <strong>добавятся</strong> в конец списков (дубликаты по точному тексту
            отбрасываются).
          </p>
          <div className="aiScenarioFixRow">
            <span className="aiScenarioFixLabel">Промпт для ИИ (новые варианты)</span>
            <textarea
              className="aiScenarioFixTextarea"
              readOnly
              rows={16}
              value={variantsPrompt}
              spellCheck={false}
            />
            <div className="btnRow">
              <button type="button" className="btn secondary" onClick={copyVariantsPrompt}>
                Копировать промпт
              </button>
            </div>
          </div>
          <div className="aiScenarioFixRow">
            <span className="aiScenarioFixLabel">Ответ ИИ (JSON)</span>
            <textarea
              className="aiScenarioFixTextarea"
              rows={12}
              value={varPaste}
              onChange={(e) => setVarPaste(e.target.value)}
              placeholder='{"questions":[{"lang":"ru","text":"..."}],"answers":[]}'
              spellCheck={false}
            />
            <div className="btnRow">
              <button type="button" className="btn primary" onClick={applyVariantsPasted}>
                Добавить варианты в сценарий
              </button>
            </div>
          </div>
          {varStatus !== "idle" && varStatusMsg ? (
            <p className={varStatus === "ok" ? "aiScenarioFixStatus ok" : "aiScenarioFixStatus err"}>
              {varStatusMsg}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
