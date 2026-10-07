// When the native side fails, the app carries on: the call still resolves, and a development
// build says what went wrong instead of hiding it.
import { afterEach, expect, jest, test } from "@jest/globals";

const mockFailure = new Error("notification channel missing");
jest.mock("expo", () => ({
  requireOptionalNativeModule: () => ({
    canPromote: () => { throw mockFailure; },
    show: async () => { throw mockFailure; },
    end: async () => { throw mockFailure; },
    endAll: async () => { throw mockFailure; },
  }),
}));

const { canPromote, endAllLive, endLive, showLive } = require("..") as typeof import("..");
const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

afterEach(() => { warn.mockClear(); });

test("a failed update resolves, and says why in a development build", async () => {
  await expect(showLive("req-1", null, "Sintel", "Downloading, 40%", "downloading", 40, 60_000)).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("show"), mockFailure);
});

test("failing to take one down, or all of them, resolves and says why", async () => {
  await expect(endLive("req-1")).resolves.toBeUndefined();
  await expect(endAllLive()).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledTimes(2);
});

test("when the phone can't say whether it can pin one, it's taken as no, and said", () => {
  expect(canPromote()).toBe(false);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("canPromote"), mockFailure);
});
