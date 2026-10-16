// Copies the API shapes, and Manage's desk logic, from the Plexbie repo: the bot's web is
// the single source of truth for /api and for what the desk shows.
//
//   node scripts/sync-types.mjs            write the copies
//   node scripts/sync-types.mjs --check    exit 1 if a copy has drifted (for CI)
//
// PLEXBIE_REPO points at the bot's checkout; it defaults to ../plexbie beside this repo.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(process.env.PLEXBIE_REPO ?? new URL("../../plexbie", import.meta.url).pathname);
if (!existsSync(resolve(repo, "web/src/api/types.ts"))) {
  console.error(`No Plexbie checkout at ${repo} (set PLEXBIE_REPO).`);
  process.exit(2);
}

/** [the bot's file, this repo's copy, how its imports change]. */
const COPIES = [
  ["web/src/api/types.ts", "src/api/types.ts", (s) => s],
  // Pure TypeScript with no browser code: the queue, the monitors and the menu, as they are.
  ["web/src/pages/manageQueue.ts", "src/features/manage/desk/manageQueue.ts", (s) => s.replaceAll('"../api/types"', '"../../../api/types"')],
  ["web/src/pages/manageMenu.ts", "src/features/manage/desk/manageMenu.ts", (s) => s],
];

let drifted = false;
for (const [from, to, adapt] of COPIES) {
  const source = resolve(repo, from);
  const target = new URL(`../${to}`, import.meta.url);
  const header =
    `// Copied from plexbie/${from} by scripts/sync-types.mjs. Don't edit here:\n` +
    "// change it in the bot's repo (the source of truth) and re-run the script.\n\n";
  const next = header + adapt(readFileSync(source, "utf8"));
  if (process.argv.includes("--check")) {
    const current = existsSync(target) ? readFileSync(target, "utf8") : "";
    if (current !== next) { console.error(`${to} has drifted from the bot's. Run: node scripts/sync-types.mjs`); drifted = true; }
  } else {
    writeFileSync(target, next);
    console.log(`${to} <- ${source}`);
  }
}
if (process.argv.includes("--check")) {
  if (drifted) process.exit(1);
  console.log("copies in sync");
}
