// Copies the API shapes from the Plexbie repo, the single source of truth for /api.
//
//   node scripts/sync-types.mjs            write src/api/types.ts
//   node scripts/sync-types.mjs --check    exit 1 if the copy has drifted (for CI)
//
// PLEXBIE_REPO points at the bot's checkout; it defaults to ../plexbie beside this repo.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(process.env.PLEXBIE_REPO ?? new URL("../../plexbie", import.meta.url).pathname);
const source = resolve(repo, "web/src/api/types.ts");
const target = new URL("../src/api/types.ts", import.meta.url);

if (!existsSync(source)) {
  console.error(`No Plexbie checkout at ${repo} (set PLEXBIE_REPO).`);
  process.exit(2);
}
const header =
  "// Copied from plexbie/web/src/api/types.ts by scripts/sync-types.mjs. Don't edit here:\n" +
  "// change it in the bot's repo (the source of truth for /api) and re-run the script.\n\n";
const next = header + readFileSync(source, "utf8");

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (current !== next) {
    console.error("src/api/types.ts has drifted from the bot's types. Run: node scripts/sync-types.mjs");
    process.exit(1);
  }
  console.log("types in sync");
} else {
  writeFileSync(target, next);
  console.log(`src/api/types.ts <- ${source}`);
}
