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
// Notifications refused for Plexbie, and the phone won't ask again.
jest.mock("expo-notifications", () => ({
  registerTaskAsync: async () => undefined,
  BackgroundNotificationTaskResult: {},
  getPermissionsAsync: async () => ({ granted: false, canAskAgain: false }),
  requestPermissionsAsync: async () => ({ granted: false, canAskAgain: false }),
}));
jest.mock("expo-task-manager", () => ({ defineTask: () => undefined }));
jest.mock("../../../../modules/plexbie-live", () => ({
  liveSupported: true,
  showLive: jest.fn(async () => undefined),
  endLive: jest.fn(async () => undefined),
  endAllLive: jest.fn(async () => undefined),
}));

// An Android phone with the native module: one that draws live progress.
jest.replaceProperty(Platform, "OS", "android");
const { handleLive, previewLive, setLiveForThisPhone } = require("../live") as typeof import("../live");

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

test("a preview with notifications refused says so, and draws nothing", async () => {
  await expect(previewLive()).resolves.toBe("denied");
  expect(showLive).not.toHaveBeenCalled();
});

// A phone that was offline can get the bot's updates late and out of order: one older than
// the last it drew for that request is left alone, so a late "show" can't bring back one that
// has ended. Updates from a bot that doesn't date them are drawn as they come.
test("an update older than the last one for its request is left alone", async () => {
  setLiveForThisPhone(true);
  await handleLive({ plexbie: "live", op: "end", id: "req-2", ts: 2_000 });
  expect(endLive).toHaveBeenCalledWith("req-2");

  await handleLive({ ...update, id: "req-2", ts: 1_000 });
  expect(showLive).not.toHaveBeenCalled();

  await handleLive({ ...update, id: "req-3", ts: 1_000 });
  expect(showLive).toHaveBeenCalledTimes(1);

  await handleLive({ ...update, id: "req-2", ts: 3_000 });
  expect(showLive).toHaveBeenCalledTimes(2);

  jest.mocked(endLive).mockClear();
  await handleLive({ plexbie: "live", op: "end", id: "req-2", ts: 2_500 });
  expect(endLive).not.toHaveBeenCalled();

  await handleLive({ ...update, id: "req-2" });
  expect(showLive).toHaveBeenCalledTimes(3);
});
