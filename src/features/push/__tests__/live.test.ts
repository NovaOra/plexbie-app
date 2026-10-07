// Live progress after alerts are off or the person signed out: updates the bot sends before
// it hears that aren't drawn, so the last request's title doesn't come back on the phone.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { Platform } from "react-native";
import { endLive, showLive } from "../../../../modules/plexbie-live";

// The app's documents folder, in memory.
jest.mock("expo-file-system", () => {
  const files = new Map<string, string>();
  class File {
    name: string;
    constructor(_dir: string, name: string) { this.name = name; }
    get exists() { return files.has(this.name); }
    textSync() { return files.get(this.name) ?? ""; }
    write(text: string) { files.set(this.name, text); }
  }
  return { File, Paths: { document: "documents" } };
});
jest.mock("expo-notifications", () => ({ registerTaskAsync: async () => undefined, BackgroundNotificationTaskResult: {} }));
jest.mock("expo-task-manager", () => ({ defineTask: () => undefined }));
jest.mock("../../../../modules/plexbie-live", () => ({
  liveSupported: true,
  showLive: jest.fn(async () => undefined),
  endLive: jest.fn(async () => undefined),
  endAllLive: jest.fn(async () => undefined),
}));

// An Android phone with the native module: one that draws live progress.
jest.replaceProperty(Platform, "OS", "android");
const { handleLive, setLiveForThisPhone } = require("../live") as typeof import("../live");

const update = { plexbie: "live", op: "show", id: "req-1", title: "Sintel", text: "Downloading, 40%", percent: 40 } as const;

beforeEach(() => {
  jest.mocked(showLive).mockClear();
  jest.mocked(endLive).mockClear();
});

test("with alerts on, an update is drawn", async () => {
  setLiveForThisPhone(true);
  await handleLive(update);
  expect(showLive).toHaveBeenCalled();
});

test("once alerts are off here, an update still on its way is taken down instead", async () => {
  setLiveForThisPhone(false);
  await handleLive(update);
  expect(showLive).not.toHaveBeenCalled();
  expect(endLive).toHaveBeenCalledWith("req-1");

  setLiveForThisPhone(true);
  await handleLive(update);
  expect(showLive).toHaveBeenCalled();
});
