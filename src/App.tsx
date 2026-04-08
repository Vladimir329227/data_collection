import { useCallback, useEffect, useState } from "react";
import { AliasesTab } from "./components/AliasesTab";
import { KbInfoModal } from "./components/KbInfoModal";
import { QaTab } from "./components/QaTab";
import type { ZodError } from "zod";
import { HARDCODED_REMOTE_KB_URL, normalizePublicKbFetchUrl, resolvePublicKbUrl } from "./kbPublicConfig";
import { parseKnowledgeBase, safeParseKnowledgeBase, type KnowledgeBase } from "./kbSchema";
import { downloadJson } from "./kbUtils";

type MainTab = "aliases" | "qa";

function formatZodError(err: ZodError): string {
  const issues = err.issues;
  if (!issues.length) return "Ошибка валидации";
  return issues
    .slice(0, 8)
    .map((i) => `${i.path.map(String).join(".")}: ${i.message}`)
    .join("\n");
}

export default function App() {
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("qa");
  const [mode, setMode] = useState<"forms" | "json">("forms");
  const [jsonText, setJsonText] = useState("");
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  const [remoteMsg, setRemoteMsg] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [kbSourceHint, setKbSourceHint] = useState<string | null>(null);

  const bootstrapKb = useCallback((data: KnowledgeBase) => {
    setKb(data);
    setJsonText(JSON.stringify(data, null, 2));
    setLoadErr(null);
    setJsonErr(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadOnce(url: string): Promise<"success" | "invalid" | "fail"> {
      const fetchUrl = normalizePublicKbFetchUrl(url);
      try {
        const r = await fetch(fetchUrl, {
          mode: "cors",
          cache: fetchUrl.startsWith("http") ? "no-store" : "default",
        });
        if (!r.ok) return "fail";
        const data: unknown = await r.json();
        const p = safeParseKnowledgeBase(data);
        if (!p.success) {
          if (!cancelled) setLoadErr(`${fetchUrl}: ${formatZodError(p.error)}`);
          return "invalid";
        }
        if (!cancelled) {
          bootstrapKb(p.data);
          setKbSourceHint(fetchUrl.startsWith("http") ? "Удалённое хранилище" : "Локальный public/knowledge_base.json");
        }
        return "success";
      } catch {
        return "fail";
      }
    }

    async function run() {
      setLoadErr(null);
      const primary = resolvePublicKbUrl().trim();
      const primaryFetch = primary ? normalizePublicKbFetchUrl(primary) : "";
      /** В production только Blob; в dev — запасной public/knowledge_base.json для офлайна. */
      const urls = primary
        ? import.meta.env.PROD
          ? [primary]
          : [primary, "/knowledge_base.json"]
        : ["/knowledge_base.json"];
      for (const url of urls) {
        if (cancelled) return;
        const res = await loadOnce(url);
        if (res === "success" || res === "invalid") return;
      }
      if (!cancelled) {
        setLoadErr(
          primary
            ? import.meta.env.PROD
              ? `Не удалось загрузить базу с ${primaryFetch || primary}`
              : `Не удалось загрузить базу с ${primaryFetch || primary} и с /knowledge_base.json`
            : "Не удалось загрузить /knowledge_base.json",
        );
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [bootstrapKb]);

  const applyJsonToKb = useCallback((): boolean => {
    try {
      const raw: unknown = JSON.parse(jsonText);
      const p = safeParseKnowledgeBase(raw);
      if (!p.success) {
        setJsonErr(formatZodError(p.error));
        return false;
      }
      setJsonErr(null);
      setKb(p.data);
      return true;
    } catch (e: unknown) {
      setJsonErr(e instanceof Error ? e.message : "JSON");
      return false;
    }
  }, [jsonText]);

  const switchToJson = () => {
    if (kb) setJsonText(JSON.stringify(kb, null, 2));
    setJsonErr(null);
    setMode("json");
  };

  const switchToForms = () => {
    if (applyJsonToKb()) setMode("forms");
  };

  const importFile = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const text = String(r.result);
        const raw: unknown = JSON.parse(text);
        const data = parseKnowledgeBase(raw);
        bootstrapKb(data);
        setMode("forms");
      } catch (e: unknown) {
        setLoadErr(e instanceof Error ? e.message : "Ошибка файла");
      }
    };
    r.readAsText(file, "utf-8");
  };

  /** Текущее состояние для выгрузки: в режиме JSON — из редактора после валидации. */
  function kbPayloadForSave(): KnowledgeBase | null {
    if (mode !== "json") return kb;
    try {
      const raw: unknown = JSON.parse(jsonText);
      const p = safeParseKnowledgeBase(raw);
      if (!p.success) {
        setRemoteMsg(formatZodError(p.error));
        return null;
      }
      setJsonErr(null);
      setKb(p.data);
      return p.data;
    } catch (e: unknown) {
      setRemoteMsg(e instanceof Error ? e.message : "Неверный JSON");
      return null;
    }
  }

  async function saveToRemote(): Promise<void> {
    setRemoteMsg(null);
    const payload = kbPayloadForSave();
    if (!payload) return;
    try {
      const res = await fetch("/api/upload-kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        setRemoteMsg(`Ошибка ${res.status}: ${text || res.statusText}`);
        return;
      }
      setJsonText(JSON.stringify(payload, null, 2));
      setKbSourceHint("Удалённое хранилище");
      setRemoteMsg("Сохранено в удалённом хранилище.");
    } catch (e: unknown) {
      setRemoteMsg(e instanceof Error ? e.message : "Сеть");
    }
  }

  async function importFromRemote(): Promise<void> {
    setRemoteMsg(null);
    const fetchUrl = normalizePublicKbFetchUrl(HARDCODED_REMOTE_KB_URL);
    try {
      const r = await fetch(fetchUrl, { mode: "cors", cache: "no-store" });
      if (!r.ok) {
        setRemoteMsg(`Не удалось загрузить (${r.status}).`);
        return;
      }
      const data: unknown = await r.json();
      const p = safeParseKnowledgeBase(data);
      if (!p.success) {
        setRemoteMsg(formatZodError(p.error));
        return;
      }
      bootstrapKb(p.data);
      setKbSourceHint("Удалённое хранилище");
      setRemoteMsg("База обновлена с удалённого хранилища.");
    } catch {
      setRemoteMsg("Сеть или CORS: не удалось загрузить JSON.");
    }
  }

  if (loadErr && !kb) {
    return (
      <div className="app">
        <h1>База знаний</h1>
        <p className="error">Не удалось загрузить базу: {loadErr}</p>
        <p className="muted">
          Проверьте доступность удалённого JSON или импортируйте файл с диска.
        </p>
        <label className="btn primary">
          Выбрать файл
          <input
            type="file"
            accept="application/json,.json"
            className="hiddenFile"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    );
  }

  if (!kb) {
    return (
      <div className="app">
        <p className="muted">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="appHeader">
        <div>
          <h1>Редактор базы знаний</h1>
          <p className="subtitle">knowledge_base.json — совместимость с RAG-пайплайном проекта</p>
          {kbSourceHint ? (
            <p className="subtitle kbSourceTag">
              Источник данных: <strong>{kbSourceHint}</strong>
            </p>
          ) : null}
        </div>
        <div className="toolbar">
          <label className="btn secondary">
            Импорт JSON
            <input
              type="file"
              accept="application/json,.json"
              className="hiddenFile"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <button type="button" className="btn secondary" onClick={() => downloadJson("knowledge_base.json", kb)}>
            Скачать JSON
          </button>
          <button type="button" className="btn secondary" onClick={() => setInfoOpen(true)}>
            Информация
          </button>
        </div>
      </header>

      <KbInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />

      <div className="modeBar">
        <button type="button" className={mode === "forms" ? "btn primary" : "btn secondary"} onClick={() => setMode("forms")}>
          Формы
        </button>
        <button type="button" className={mode === "json" ? "btn primary" : "btn secondary"} onClick={switchToJson}>
          Сырой JSON
        </button>
        {mode === "json" ? (
          <>
            <button type="button" className="btn secondary" onClick={applyJsonToKb}>
              Применить JSON
            </button>
            <button type="button" className="btn secondary" onClick={switchToForms}>
              В формы (с проверкой)
            </button>
          </>
        ) : null}
      </div>

      {mode === "json" ? (
        <div className="panel">
          {jsonErr ? <pre className="error">{jsonErr}</pre> : null}
          <textarea className="jsonEditor" value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} />
        </div>
      ) : (
        <>
          <div className="tabs">
            {(
              [
                ["aliases", "Псевдонимы"],
                ["qa", "Вопросы и ответы"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" className={mainTab === k ? "tab active" : "tab"} onClick={() => setMainTab(k)}>
                {label}
              </button>
            ))}
          </div>
          {mainTab === "aliases" ? <AliasesTab kb={kb} onChange={setKb} /> : null}
          {mainTab === "qa" ? <QaTab kb={kb} onChange={setKb} /> : null}
        </>
      )}

      <div className="cloudPanel">
        <h4>Файл базы</h4>
        <p className="hint">
          Источник в сети задан в коде:{" "}
          <a href={HARDCODED_REMOTE_KB_URL} target="_blank" rel="noreferrer">
            открыть JSON
          </a>
          . При старте: сначала он (в production только он; в dev при ошибке — <code>/knowledge_base.json</code> из{" "}
          <code>public/</code>). Выгрузка идёт на Vercel через <code>POST /api/upload-kb</code> (на сервере нужен только{" "}
          <code>BLOB_READ_WRITE_TOKEN</code>).
        </p>
        <div className="btnRow">
          <button type="button" className="btn primary" onClick={() => void saveToRemote()}>
            Сохранить
          </button>
          <button type="button" className="btn secondary" onClick={() => void importFromRemote()}>
            Импортировать из удалённого хранилища
          </button>
        </div>
        {remoteMsg ? (
          <p
            className={
              remoteMsg.startsWith("База обновлена") || remoteMsg.startsWith("Сохранено") ? "success" : "error"
            }
          >
            {remoteMsg}
          </p>
        ) : null}
      </div>
    </div>
  );
}
