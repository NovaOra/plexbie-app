// The on/off settings kept as small files in the app's documents folder (Vibration, live
// progress, its place in the status bar and this phone's alerts): read once at start, written
// when they change.
import { beforeEach, expect, jest, test } from "@jest/globals";

// The app's documents folder, in memory.
const mockFiles = new Map<string, string>();
let mockBroken = false;
jest.mock("expo-file-system", () => {
  class File {
    name: string;
    constructor(_dir: string, name: string) { this.name = name; }
    get exists() { if (mockBroken) throw new Error("no documents folder"); return mockFiles.has(this.name); }
    textSync() { return mockFiles.get(this.name) ?? ""; }
    write(text: string) { if (mockBroken) throw new Error("no documents folder"); mockFiles.set(this.name, text); }
  }
  return { File, Paths: { document: "documents" } };
});

const { flagSetting } = require("../flagSetting") as typeof import("../flagSetting");

beforeEach(() => { mockFiles.clear(); mockBroken = false; });

test("with no file yet, it's the default", () => {
  expect(flagSetting("a.txt", true).get()).toBe(true);
  expect(flagSetting("b.txt", false).get()).toBe(false);
});

test("it reads what was saved, and saves what it's set to", () => {
  mockFiles.set("a.txt", "off\n");
  const a = flagSetting("a.txt", true);
  expect(a.get()).toBe(false);
  a.set(true);
  expect(a.get()).toBe(true);
  expect(mockFiles.get("a.txt")).toBe("on");
  expect(flagSetting("a.txt", false).get()).toBe(true);
});

test("a file it can't make sense of reads as the default", () => {
  mockFiles.set("a.txt", "maybe");
  expect(flagSetting("a.txt", true).get()).toBe(true);
  expect(flagSetting("a.txt", false).get()).toBe(false);
});

test("when the folder can't be used, the default holds and a change lasts for this run", () => {
  mockBroken = true;
  const a = flagSetting("a.txt", true);
  expect(a.get()).toBe(true);
  a.set(false);
  expect(a.get()).toBe(false);
});
