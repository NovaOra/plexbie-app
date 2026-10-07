// Writes with no connection, and the offline cache: a write fails at once instead of waiting
// to go out later, nothing unsent is kept in the cache, and the cache file lives where the
// phone never backs it up.
import { afterEach, expect, jest, test } from "@jest/globals";
import { MutationObserver, QueryClient, dehydrate, onlineManager } from "@tanstack/react-query";
import { ApiError } from "../client";
import { queryClient } from "../query";

// The app's folders, in memory.
const mockFiles = new Map<string, string>();
jest.mock("expo-file-system", () => {
  class File {
    path: string;
    constructor(dir: string, name: string) { this.path = `${dir}/${name}`; }
    get exists() { return mockFiles.has(this.path); }
    async text() { return mockFiles.get(this.path) ?? ""; }
    create() { mockFiles.set(this.path, ""); }
    write(text: string) { mockFiles.set(this.path, text); }
    delete() { mockFiles.delete(this.path); }
  }
  return { File, Paths: { document: "documents", cache: "caches" } };
});
const { forgetCache, persistOptions, persister } = require("../persist") as typeof import("../persist");

const unreachable = () => Promise.reject(new ApiError(0, "Couldn't reach the server.", "network"));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  onlineManager.setOnline(true);
  queryClient.clear();
  mockFiles.clear();
});

test("with no connection, a write fails at once and its change is undone", async () => {
  onlineManager.setOnline(false);
  const undo = jest.fn();
  const write = new MutationObserver(queryClient, { mutationFn: unreachable, onError: undo });
  const sent = write.mutate(undefined).catch((e: unknown) => e);
  await settle();
  const [mutation] = queryClient.getMutationCache().getAll();
  expect(mutation.state.isPaused).toBe(false);
  expect(mutation.state.status).toBe("error");
  expect(await sent).toMatchObject({ message: "Couldn't reach the server." });
  expect(undo).toHaveBeenCalled();
});

test("a write waiting for a connection is never kept in the offline cache", async () => {
  onlineManager.setOnline(false);
  const waiting = new QueryClient();
  void new MutationObserver(waiting, { mutationFn: unreachable }).mutate(undefined).catch(() => undefined);
  await settle();
  expect(waiting.getMutationCache().getAll()[0].state.isPaused).toBe(true);
  expect(dehydrate(waiting, persistOptions.dehydrateOptions).mutations).toEqual([]);
});

test("the cache is read from the caches folder, not documents", async () => {
  mockFiles.set("documents/plexbie-cache.json", JSON.stringify({ buster: "1", timestamp: 1 }));
  expect(await persister.restoreClient()).toBeUndefined();
  mockFiles.set("caches/plexbie-cache.json", JSON.stringify({ buster: "1", timestamp: 2 }));
  expect(await persister.restoreClient()).toMatchObject({ timestamp: 2 });
});

test("an older copy in documents is deleted on start and on sign-out", async () => {
  mockFiles.set("documents/plexbie-cache.json", "{}");
  await persister.restoreClient();
  expect(mockFiles.has("documents/plexbie-cache.json")).toBe(false);

  mockFiles.set("documents/plexbie-cache.json", "{}");
  mockFiles.set("caches/plexbie-cache.json", "{}");
  await forgetCache();
  expect(mockFiles.size).toBe(0);
});
