// Replace the bundled fixture with a Cricsheet file you downloaded yourself.
// Usage: npm run data:import -- path/to/1298150.json
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const source = process.argv[2];
if (!source) {
  console.error("Usage: npm run data:import -- path/to/1298150.json");
  process.exit(1);
}

const bytes = readFileSync(source);
const match = JSON.parse(bytes.toString("utf8"));
if (!match?.meta?.data_version || !Array.isArray(match?.innings)) {
  console.error("That file does not look like a Cricsheet JSON match file.");
  process.exit(1);
}

const dataDir = path.resolve(import.meta.dirname, "../data/cricsheet");
const manifestPath = path.join(dataDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const sha256 = createHash("sha256").update(bytes).digest("hex");

copyFileSync(source, path.join(dataDir, manifest.file));
manifest.sha256 = sha256;
manifest.cricsheetMeta = match.meta;
manifest.obtainedVia = "Downloaded from cricsheet.org and imported with scripts/import-cricsheet.mjs.";
manifest.retrieved = new Date().toISOString().slice(0, 10);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`Imported ${manifest.file} (revision ${match.meta.revision}), sha256 ${sha256}`);
console.log("Update data/cricsheet/NOTICE.md with the new revision and checksum, then run `npm test`.");
