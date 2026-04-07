export function linesToStrings(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function stringsToLines(arr: string[]): string {
  return arr.join("\n");
}

export function downloadJson(filename: string, data: unknown): void {
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
