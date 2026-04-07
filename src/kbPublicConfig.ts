/** Путь к объекту по умолчанию (совпадает с BLOB_OBJECT_KEY в API). */
export const DEFAULT_BLOB_JSON_PATH = "/articles/knowledge_base.json";

/** Публичный JSON базы знаний на Vercel Blob (единственный источник для загрузки из сети). */
export const HARDCODED_REMOTE_KB_URL =
  "https://vfalbmvkw2zjknly.public.blob.vercel-storage.com/articles/knowledge_base.json";

/**
 * Если передан только корень хранилища (…blob.vercel-storage.com без пути),
 * подставляем путь к JSON. Локальные пути (/knowledge_base.json) не трогаем.
 */
export function normalizePublicKbFetchUrl(raw: string): string {
  const t = raw.trim();
  if (!t || !/^https?:\/\//i.test(t)) return t;
  try {
    const u = new URL(t);
    const p = u.pathname.replace(/\/$/, "");
    if (p === "" || p === "/") {
      u.pathname = DEFAULT_BLOB_JSON_PATH;
    }
    return u.href;
  } catch {
    return t;
  }
}

/** URL для первичной загрузки из удалённого хранилища. */
export function resolvePublicKbUrl(): string {
  return HARDCODED_REMOTE_KB_URL;
}
