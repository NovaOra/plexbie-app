// Joining by email: an address that doesn't look right is said out loud, not only shown,
// both when the field is left and when "Ask to join" is pressed, and nothing is sent.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import type { AppSession } from "../../../api/schemas";
import { JoinScreen } from "../JoinScreen";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: () => undefined }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null }));
jest.mock("../../../ui/StatusBarScrim", () => ({ StatusBarScrim: () => null }));
const mockClient = { join: jest.fn(async () => ({})) };
jest.mock("../../../auth/session", () => ({ useApi: () => mockClient, useSession: () => ({ signOut: jest.fn() }) }));

const BAD = "That doesn’t look like an email address.";
const ME = { user: { name: "Sam Example", via: "discord" }, inGuild: true, joinPending: false, accessUnknown: false } as unknown as AppSession;

let qc: QueryClient;
let said: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibility>;
beforeEach(() => {
  said = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  mockClient.join.mockClear();
});
afterEach(() => { qc.clear(); said.mockRestore(); });

const show = () => render(<QueryClientProvider client={qc}><JoinScreen me={ME} /></QueryClientProvider>);
const field = () => screen.getByLabelText("Email for Plex");

test("pressing Ask to join with a bad address says why, every time", async () => {
  await show();
  await fireEvent.changeText(field(), "sam@example");
  await fireEvent.press(screen.getByRole("button", { name: "Ask to join" }));
  expect(screen.getByText(BAD)).toBeTruthy();
  expect(said).toHaveBeenLastCalledWith(BAD);
  await fireEvent.press(screen.getByRole("button", { name: "Ask to join" }));
  expect(said).toHaveBeenCalledTimes(2);
  expect(mockClient.join).not.toHaveBeenCalled();
});

test("leaving the field with a bad address says why", async () => {
  await show();
  await fireEvent.changeText(field(), "sam");
  await fireEvent(field(), "blur");
  expect(said).toHaveBeenLastCalledWith(BAD);
});

test("the error is said once, not again by a live region on Android", async () => {
  await show();
  await fireEvent.changeText(field(), "sam");
  await fireEvent(field(), "blur");
  expect(said).toHaveBeenCalledTimes(1);
  expect(screen.getByText(BAD).props.accessibilityLiveRegion).toBeUndefined();
});

test("a good address says nothing and asks", async () => {
  await show();
  await fireEvent.changeText(field(), "sam@example.com");
  await fireEvent(field(), "blur");
  await fireEvent.press(screen.getByRole("button", { name: "Ask to join" }));
  expect(said).not.toHaveBeenCalledWith(BAD);
  expect(mockClient.join).toHaveBeenCalledWith("sam@example.com");
});
