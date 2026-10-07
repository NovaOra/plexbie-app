// Turning alerts off: the bot has to hear it, or the phone keeps getting them while the
// switch says off. When it can't be told, that's what the person sees, and the token stays
// so trying again can still remove it. Live progress on the screen goes with the alerts.
import { beforeEach, expect, jest, test } from "@jest/globals";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { endAllLive } from "../../../../modules/plexbie-live";
import type { Api } from "../../../api/client";
import { ApiError } from "../../../api/client";
import { setLiveForThisPhone } from "../live";
import { disablePush, forgetPush } from "../push";

// The Keychain / Keystore, in memory.
jest.mock("expo-secure-store", () => {
  const items = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    getItemAsync: async (k: string) => items.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => { items.set(k, v); },
    deleteItemAsync: async (k: string) => { items.delete(k); },
    __items: items,
  };
});
jest.mock("expo-notifications", () => ({ setNotificationHandler: () => undefined }));
// A build with an Expo project, on a real Android phone: one that can get alerts.
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: "made-up-project" } } } } }));
jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("../live", () => ({ liveIn: () => null, liveOn: () => false, setLiveForThisPhone: jest.fn() }));
jest.mock("../../../../modules/plexbie-live", () => ({ endAllLive: jest.fn(async () => undefined) }));

const PUSH = "ExponentPushToken[made-up-for-tests]";
const items = (SecureStore as unknown as { __items: Map<string, string> }).__items;
const ended = jest.mocked(endAllLive);
const unregister = jest.fn<(token: string) => Promise<null>>();
const client = { unregisterPush: unregister } as unknown as Api;

beforeEach(() => {
  items.clear();
  items.set("plexbie.pushToken", PUSH);
  unregister.mockReset();
  ended.mockClear();
  jest.mocked(setLiveForThisPhone).mockClear();
  jest.replaceProperty(Platform, "OS", "android");
});

test("alerts off: the bot is told, the token is forgotten and live progress ends", async () => {
  unregister.mockResolvedValue(null);
  await expect(disablePush(client)).resolves.toBe("off");
  expect(unregister).toHaveBeenCalledWith(PUSH);
  expect(items.has("plexbie.pushToken")).toBe(false);
  expect(ended).toHaveBeenCalled();
  expect(setLiveForThisPhone).toHaveBeenLastCalledWith(false);
});

test("alerts off when the bot can't be told: the problem shows, the token stays, and trying again removes it", async () => {
  unregister.mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server.", "network"));
  await expect(disablePush(client)).rejects.toThrow("Couldn't reach the server.");
  expect(items.get("plexbie.pushToken")).toBe(PUSH);
  expect(setLiveForThisPhone).not.toHaveBeenCalled();

  unregister.mockResolvedValueOnce(null);
  await expect(disablePush(client)).resolves.toBe("off");
  expect(unregister).toHaveBeenLastCalledWith(PUSH);
  expect(items.has("plexbie.pushToken")).toBe(false);
});

test("signing out forgets the token on the phone, hands it over to be removed, and ends live progress", async () => {
  await expect(forgetPush()).resolves.toBe(PUSH);
  expect(items.has("plexbie.pushToken")).toBe(false);
  expect(ended).toHaveBeenCalled();
  expect(setLiveForThisPhone).toHaveBeenCalledWith(false);
  expect(unregister).not.toHaveBeenCalled();
  await expect(forgetPush()).resolves.toBeNull();
});
