import { useCallback, useEffect, useState } from "react";
import { AliasesTab } from "./components/AliasesTab";
import { KbInfoModal } from "./components/KbInfoModal";
import { QaTab } from "./components/QaTab";
import type { ZodError } from "zod";
import { parseKnowledgeBase, safeParseKnowledgeBase, type KnowledgeBase } from "./kbSchema";
import { downloadJson } from "./kbUtils";

type MainTab = "aliases" | "qa";

const TOKEN_KEY = "kb_upload_token";

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

  const [uploadToken, setUploadToken] = useState(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) ?? "" : "",
  );
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const bootstrapKb = useCallback((data: KnowledgeBase) => {
    setKb(data);
    setJsonText(JSON.stringify(data, null, 2));
    setLoadErr(null);
    setJsonErr(null);
  }, []);

  useEffect(() => {
    fetch("/knowledge_base.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        const p = safeParseKnowledgeBase(data);
        if (!p.success) {
          setLoadErr(formatZodError(p.error));
          return;
        }
        bootstrapKb(p.data);
      })
      .catch((e: unknown) => {
        setLoadErr(e instanceof Error ? e.message : "Сеть");
      });
  }, [bootstrapKb]);

  useEffect(() => {
    localStorage.setItem(TOKEN_KEY, uploadToken);
  }, [uploadToken]);

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

  async function uploadCloud() {
    if (!kb) return;
    setUploadMsg(null);
    const tok = uploadToken.trim();
    if (!tok) {
      setUploadMsg("Укажите токен загрузки (совпадает с KB_UPLOAD_TOKEN на Vercel).");
      return;
    }
    try {
      const res = await fetch("/api/upload-kb", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tok}`,
        },
        body: JSON.stringify(kb),
      });
      const text = await res.text();
      if (!res.ok) {
        setUploadMsg(`Ошибка ${res.status}: ${text || res.statusText}`);
        return;
      }
      let msg = "Файл загружен в Vercel Blob.";
      try {
        const j = JSON.parse(text) as { url?: string };
        if (j.url) msg = `Файл загружен в Vercel Blob: ${j.url}`;
      } catch {
        /* не JSON */
      }
      setUploadMsg(msg);
    } catch (e: unknown) {
      setUploadMsg(e instanceof Error ? e.message : "Сеть");
    }
  }

  if (loadErr && !kb) {
    return (
      <div className="app">
        <h1>База знаний</h1>
        <p className="error">Не удалось загрузить /knowledge_base.json: {loadErr}</p>
        <p className="muted">Импортируйте JSON с диска (корень репозитория или выгрузка).</p>
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
          <button type="button" className="btn primary" onClick={() => downloadJson("knowledge_base.json", kb)}>
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
        <h4>Vercel Blob</h4>
        <p className="hint">
          Работает на деплое Vercel или <code>vercel dev</code>. В проекте нужен Blob Store (Storage) — появится{" "}
          <code>BLOB_READ_WRITE_TOKEN</code>. Свой секрет для кнопки ниже: <code>KB_UPLOAD_TOKEN</code> в переменных
          окружения.
        </p>
        <div className="field">
          <span className="label">Токен загрузки</span>
          <input
            type="password"
            autoComplete="off"
            value={uploadToken}
            onChange={(e) => setUploadToken(e.target.value)}
            placeholder="Bearer-секрет"
          />
        </div>
        <button type="button" className="btn primary" onClick={uploadCloud}>
          Отправить в Blob
        </button>
        {uploadMsg ? (
          <p className={uploadMsg.startsWith("Файл") ? "success" : "error"}>
            {(() => {
              const blobUrl = uploadMsg.match(/https?:\/\/[^\s]+/)?.[0];
              if (uploadMsg.startsWith("Файл загружен") && blobUrl) {
                return (
                  <>
                    Файл загружен в Vercel Blob:{" "}
                    <a href={blobUrl} target="_blank" rel="noreferrer">
                      открыть JSON
                    </a>
                  </>
                );
              }
              return uploadMsg;
            })()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
