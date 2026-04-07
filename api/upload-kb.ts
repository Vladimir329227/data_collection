import { put } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.KB_UPLOAD_TOKEN;
  const auth = req.headers.authorization;
  if (!token || auth !== `Bearer ${token}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res.status(500).json({
      error:
        "Missing BLOB_READ_WRITE_TOKEN. In Vercel: Storage → Create Blob Store, link to project, or run `vercel env pull`.",
    });
    return;
  }

  /** Путь в Blob как в примере put('articles/...') — публичный URL будет вести сюда же. */
  const objectKey = process.env.BLOB_OBJECT_KEY || "articles/knowledge_base.json";

  let json: string;
  try {
    const payload: unknown = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    json = JSON.stringify(payload, null, 2);
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  try {
    const blob = await put(objectKey, json, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
    });
    res.status(200).json({ ok: true, url: blob.url, pathname: blob.pathname });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Blob upload error";
    res.status(502).json({ error: msg });
  }
}
