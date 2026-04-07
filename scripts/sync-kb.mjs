import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "..", "knowledge_base.json");
const destDir = join(root, "public");
const dest = join(destDir, "knowledge_base.json");

if (!existsSync(src)) {
  console.warn("sync-kb: ../knowledge_base.json not found — skip (import file in UI or add repo root KB).");
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("sync-kb: copied to public/knowledge_base.json");
