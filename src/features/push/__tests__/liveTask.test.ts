// When Android won't take the background task, live progress can't be drawn with the app
// closed: that's said in every build, not only a development one, so it shows in the logs.
import { expect, jest, test } from "@jest/globals";
import { Platform } from "react-native";

const mockFailure = new Error("task manager unavailable");
jest.mock("expo-file-system", () => {
  class File {
    get exists() { return false; }
    textSync() { return ""; }
    write() { /* nothing kept */ }
  }
  return { File, Paths: { document: "documents" } };
});
jest.mock("expo-notifications", () => ({
  registerTaskAsync: async () => { throw mockFailure; },
  BackgroundNotificationTaskResult: {},
}));
jest.mock("expo-task-manager", () => ({ defineTask: () => undefined }));
jest.mock("../../../../modules/plexbie-live", () => ({
  liveSupported: true,
  showLive: jest.fn(async () => undefined),
  endLive: jest.fn(async () => undefined),
  endAllLive: jest.fn(async () => undefined),
}));

test("a background task Android won't take is said, even in a release build", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  try {
    jest.replaceProperty(Platform, "OS", "android");
    require("../live");
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("background task"), mockFailure);
  } finally {
    (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
    warn.mockRestore();
  }
});
