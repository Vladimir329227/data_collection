import { useCallback, useEffect, useState } from "react";
import { AliasesTab } from "./components/AliasesTab";
import { KbInfoModal } from "./components/KbInfoModal";
import { QaTab } from "./components/QaTab";
import type { ZodError } from "zod";
import {
  envPublicKbUrl,
  readSavedPublicKbUrl,
  resolvePublicKbUrl,
  writeSavedPublicKbUrl,
} from "./kbPublicConfig";
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
  const [publicKbUrlDraft, setPublicKbUrlDraft] = useState(() =>
    typeof localStorage !== "undefined" ? readSavedPublicKbUrl() || envPublicKbUrl() : envPublicKbUrl(),
  );
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
      try {
        const r = await fetch(url, { mode: "cors" });
        if (!r.ok) return "fail";
        const data: unknown = await r.json();
        const p = safeParseKnowledgeBase(data);
        if (!p.success) {
          if (!cancelled) setLoadErr(`${url}: ${formatZodError(p.error)}`);
          return "invalid";
        }
        if (!cancelled) {
          bootstrapKb(p.data);
          setKbSourceHint(url.startsWith("http") ? "Публичный Blob" : "Локальный public/knowledge_base.json");
        }
        return "success";
      } catch {
        return "fail";
      }
    }

    async function run() {
      setLoadErr(null);
      const primary = resolvePublicKbUrl().trim();
      const urls = primary ? [primary, "/knowledge_base.json"] : ["/knowledge_base.json"];
      for (const url of urls) {
        if (cancelled) return;
        const res = await loadOnce(url);
        if (res === "success" || res === "invalid") return;
      }
      if (!cancelled) {
        setLoadErr(
          primary
            ? `Не удалось загрузить базу с ${primary} и с /knowledge_base.json`
            : "Не удалось загрузить /knowledge_base.json",
        );
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
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

  async function reloadKbFromPublicUrl(url: string): Promise<boolean> {
    const u = url.trim();
    if (!u) return false;
    try {
      const r = await fetch(u, { mode: "cors" });
      if (!r.ok) return false;
      const data: unknown = await r.json();
      const p = safeParseKnowledgeBase(data);
      if (!p.success) return false;
      bootstrapKb(p.data);
      setKbSourceHint("Публичный Blob");
      return true;
    } catch {
      return false;
    }
  }

  async function applyPublicKbUrl() {
    setUploadMsg(null);
    const url = publicKbUrlDraft.trim();
    writeSavedPublicKbUrl(url);
    if (!url) {
      setUploadMsg("URL очищен. Перезагрузите страницу — подтянется только /knowledge_base.json.");
      return;
    }
    const ok = await reloadKbFromPublicUrl(url);
    setUploadMsg(
      ok ? "База загружена с публичного URL (как при put(..., { access: \"public\" }))." : "Не удалось загрузить JSON по этому URL.",
    );
  }

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
      let msg = "Файл загружен в Vercel Blob (public).";
      try {
        const j = JSON.parse(text) as { url?: string };
        if (j.url) {
          msg = `Файл загружен в Vercel Blob: ${j.url}`;
          writeSavedPublicKbUrl(j.url);
          setPublicKbUrlDraft(j.url);
          await reloadKbFromPublicUrl(j.url);
        }
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
        <p className="error">Не удалось загрузить базу: {loadErr}</p>
        <p className="muted">
          Проверьте публичный URL в блоке Vercel Blob, переменную <code>VITE_PUBLIC_KB_URL</code> или импортируйте JSON с диска.
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
        <h4>Vercel Blob (публичный доступ)</h4>
        <p className="hint">
          Загрузка через <code>{`put(path, body, { access: 'public' })`}</code> — JSON доступен по постоянному URL. На
          сервере: <code>BLOB_READ_WRITE_TOKEN</code>, опционально <code>BLOB_OBJECT_KEY</code> (по умолчанию{" "}
          <code>articles/knowledge_base.json</code>).
        </p>
        <div className="field">
          <span className="label">Публичный URL JSON</span>
          <input
            type="url"
            autoComplete="off"
            value={publicKbUrlDraft}
            onChange={(e) => setPublicKbUrlDraft(e.target.value)}
            placeholder="https://….public.blob.vercel-storage.com/articles/knowledge_base.json"
          />
        </div>
        <div className="btnRow">
          <button type="button" className="btn secondary" onClick={() => void applyPublicKbUrl()}>
            Сохранить URL и загрузить базу
          </button>
        </div>
        <p className="hint">
          При открытии приложения порядок такой: сохранённый URL → <code>VITE_PUBLIC_KB_URL</code> при сборке → файл{" "}
          <code>/knowledge_base.json</code> из <code>public/</code>.
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
