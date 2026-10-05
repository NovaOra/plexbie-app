// The offline cache: the last answers for a few lists, kept in one file in the app's own
// documents folder (private to the app, and excluded from backups with the rest of it),
// so a cold start with no signal still shows something. Signing out deletes it.
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Query } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";

/**
 * Small lists worth having offline. Not the library (large), titles, anything admin, or
 * the session (it holds email and account ids; it's asked for again on every start).
 */
const KEEP = new Set(["requests", "status", "arrivals", "community", "popular"]);

const cacheFile = () => new File(Paths.document, "plexbie-cache.json");

const storage = {
  getItem: async (_key: string) => {
    try { const f = cacheFile(); return f.exists ? await f.text() : null; } catch { return null; }
  },
  setItem: async (_key: string, value: string) => {
    try { const f = cacheFile(); if (!f.exists) f.create(); f.write(value); } catch { /* a cache that can't be written is just no cache */ }
  },
  removeItem: async (_key: string) => {
    try { const f = cacheFile(); if (f.exists) f.delete(); } catch { /* already gone */ }
  },
};

export const persister = createAsyncStoragePersister({ storage, key: "plexbie", throttleTime: 2000 });

export const persistOptions = {
  persister,
  maxAge: 24 * 3600_000,
  /** Bump when a cached shape changes, so an old file is ignored rather than misread. */
  buster: "1",
  dehydrateOptions: {
    shouldDehydrateQuery: (q: Query) => q.state.status === "success" && KEEP.has(String(q.queryKey[0])),
  },
};

/** Deletes the cache file (sign-out, switching servers). */
export async function forgetCache() {
  await storage.removeItem("plexbie");
}
