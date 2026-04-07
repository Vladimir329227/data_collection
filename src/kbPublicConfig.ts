/** localStorage: публичный URL JSON на Vercel Blob (приоритетнее переменной окружения). */
export const KB_PUBLIC_URL_LS = "kb_public_url";

export function readSavedPublicKbUrl(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(KB_PUBLIC_URL_LS)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function writeSavedPublicKbUrl(url: string): void {
  if (typeof localStorage === "undefined") return;
  const t = url.trim();
  if (t) localStorage.setItem(KB_PUBLIC_URL_LS, t);
  else localStorage.removeItem(KB_PUBLIC_URL_LS);
}

export function envPublicKbUrl(): string {
  return (import.meta.env.VITE_PUBLIC_KB_URL as string | undefined)?.trim() ?? "";
}

/** URL для первичной загрузки: сохранённый в браузере или из сборки. */
export function resolvePublicKbUrl(): string {
  return readSavedPublicKbUrl() || envPublicKbUrl();
}
