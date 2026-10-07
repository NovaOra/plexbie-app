// Phone alerts on You (and the offer after a request): every row reads one answer to "are
// alerts on here?", checked again when the app or the screen comes back, so turning alerts
// on (here or in the phone's settings) shows everywhere at once. A check that fails says so.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { Linking } from "react-native";
import { notificationsAllowed, previewLive } from "../live";
import { disablePush, enablePush, pushState, type PushState } from "../push";
import { LiveRow, PushOffer, PushRow } from "../PushRow";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
}));
// Buttons without their press animation; cards without the glass.
jest.mock("../../../ui/Pressable", () => ({ PressableScale: jest.requireActual<typeof import("react-native")>("react-native").Pressable }));
jest.mock("../../../ui/Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));
const mockToast = jest.fn();
jest.mock("../../../ui/Toast", () => ({ useToast: () => mockToast }));

// Coming back to a screen: each one that asked to hear it, once per return.
const mockFocus = new Set<() => void>();
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    useFocusEffect: (effect: () => void) => {
      useEffect(() => { effect(); mockFocus.add(effect); return () => { mockFocus.delete(effect); }; }, [effect]);
    },
  };
});

const mockClient = { pushTest: jest.fn<() => Promise<{ ok: boolean; message: string }>>() };
jest.mock("../../../auth/session", () => ({
  useApi: () => mockClient,
  useSession: () => ({ state: { phase: "signedIn", sample: false, server: "https://plexbie.example" } }),
}));
// This Plexbie sends app alerts, unless a test says otherwise.
let mockSends = ["expo", "web"];
jest.mock("../../../api/client", () => ({
  ...jest.requireActual<typeof import("../../../api/client")>("../../../api/client"),
  pub: { mobileInfo: async () => ({ push: mockSends }) },
}));
jest.mock("../push", () => ({
  pushState: jest.fn(),
  enablePush: jest.fn(),
  disablePush: jest.fn(),
  refreshPush: jest.fn(async () => undefined),
}));
jest.mock("../live", () => ({
  liveAvailable: true,
  liveOn: () => true,
  livePinned: () => true,
  previewLive: jest.fn(),
  notificationsAllowed: jest.fn(),
  setLiveOn: jest.fn(async () => undefined),
  setLivePinned: jest.fn(),
}));
jest.mock("../../../../modules/plexbie-live", () => ({ canPromote: () => true }));

const state = jest.mocked(pushState);
let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000 } } });
  state.mockReset();
  jest.mocked(enablePush).mockReset();
  jest.mocked(disablePush).mockReset();
  jest.mocked(previewLive).mockReset();
  jest.mocked(notificationsAllowed).mockReset().mockResolvedValue(false);
  mockSends = ["expo", "web"];
  mockClient.pushTest.mockReset();
  mockToast.mockReset();
  mockFocus.clear();
});
afterEach(() => { client.clear(); });

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
/** Lets the phone's answers (and the bot's) come in. */
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function show(node: ReactElement) {
  await render(node, { wrapper: wrap });
  await settle();
}

test("turning alerts on lets live progress be turned on, without leaving the screen", async () => {
  state.mockResolvedValue("off");
  jest.mocked(enablePush).mockResolvedValue("on");
  await show(<><PushRow /><LiveRow /></>);
  expect(screen.getByRole("switch", { name: "Live progress" })).toBeDisabled();

  await fireEvent.press(screen.getByRole("switch", { name: "Phone alerts" }));
  await settle();
  expect(screen.getByRole("switch", { name: "Phone alerts" })).toBeChecked();
  expect(screen.getByRole("switch", { name: "Live progress" })).toBeEnabled();
  expect(screen.queryByText(/Turn on phone alerts first/)).toBeNull();
});

test("turning alerts off here turns live progress off with it, and brings back the offer to turn them on", async () => {
  state.mockResolvedValue("on");
  jest.mocked(disablePush).mockResolvedValue("off" as PushState);
  await show(<><PushRow /><LiveRow /><PushOffer /></>);
  expect(screen.getByRole("switch", { name: "Live progress" })).toBeEnabled();
  expect(screen.queryByText("Turn on alerts")).toBeNull();

  await fireEvent.press(screen.getByRole("switch", { name: "Phone alerts" }));
  await settle();
  expect(screen.getByRole("switch", { name: "Live progress" })).toBeDisabled();
  expect(screen.getByText("Turn on alerts")).toBeTruthy();
});

test("allowing alerts in the phone's settings shows when the app comes back", async () => {
  state.mockResolvedValue("denied");
  await show(<PushRow />);
  expect(screen.getByText("Open settings")).toBeTruthy();

  state.mockResolvedValue("on");
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
  await settle();
  expect(screen.queryByText("Open settings")).toBeNull();
  expect(screen.getByRole("switch", { name: "Phone alerts" })).toBeChecked();
  focusManager.setFocused(undefined);
});

test("coming back to the screen checks again", async () => {
  state.mockResolvedValue("off");
  await show(<PushOffer />);
  expect(screen.getByText("Turn on alerts")).toBeTruthy();

  state.mockResolvedValue("on");
  await act(async () => { mockFocus.forEach((f) => f()); });
  await settle();
  expect(screen.queryByText("Turn on alerts")).toBeNull();
});

test("a check that fails says so, instead of the row disappearing", async () => {
  state.mockRejectedValue(new Error("User interaction is not allowed."));
  await show(<PushRow />);
  expect(screen.getByText("Phone alerts")).toBeTruthy();
  expect(screen.getByText(/Couldn’t check this phone’s alerts/)).toBeTruthy();
});

test("with alerts on, a test alert can be sent, and the answer shows", async () => {
  state.mockResolvedValue("on");
  mockClient.pushTest.mockResolvedValue({ ok: true, message: "Sent. It should pop up in a moment." });
  await show(<PushRow />);
  await fireEvent.press(screen.getByText("Send a test"));
  await settle();
  expect(mockClient.pushTest).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenLastCalledWith(expect.objectContaining({ text: "Sent. It should pop up in a moment." }));
});

test("no test alert is offered while alerts are off", async () => {
  state.mockResolvedValue("off");
  await show(<PushRow />);
  expect(screen.queryByText("Send a test")).toBeNull();
});

test("a preview the phone won't show says why, with a way to its settings", async () => {
  state.mockResolvedValue("on");
  jest.mocked(previewLive).mockResolvedValue("denied");
  const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  await show(<LiveRow />);
  await fireEvent.press(screen.getByText("Show me"));
  await settle();
  expect(screen.getByText(/Notifications are off for Plexbie/)).toBeTruthy();
  await fireEvent.press(screen.getByText("Open settings"));
  expect(open).toHaveBeenCalled();
});

test("with no connection, the phone's own answer still shows", async () => {
  onlineManager.setOnline(false);
  try {
    state.mockResolvedValue("off");
    await show(<><PushRow /><LiveRow /><PushOffer /></>);
    expect(screen.getByRole("switch", { name: "Phone alerts" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Live progress" })).toBeDisabled();
    expect(screen.getByText("Turn on alerts")).toBeTruthy();
  } finally { onlineManager.setOnline(true); }
});

test("a test that reached nothing doesn't blame this phone", async () => {
  state.mockResolvedValue("on");
  mockClient.pushTest.mockResolvedValue({ ok: false, message: "Nothing to send to." });
  await show(<PushRow />);
  await fireEvent.press(screen.getByText("Send a test"));
  await settle();
  expect(mockToast).toHaveBeenLastCalledWith(expect.objectContaining({
    text: "The test didn’t reach any of your devices", tone: "error" }));
});

test("no test alert is offered when the Plexbie doesn't send app alerts", async () => {
  mockSends = ["web"];
  state.mockResolvedValue("on");
  await show(<PushRow />);
  expect(screen.getByRole("switch", { name: "Phone alerts" })).toBeChecked();
  expect(screen.queryByText("Send a test")).toBeNull();
});

test("the preview's message goes once notifications are allowed and the app comes back", async () => {
  state.mockResolvedValue("off");
  jest.mocked(previewLive).mockResolvedValue("denied");
  jest.mocked(notificationsAllowed).mockResolvedValue(false);
  await show(<LiveRow />);
  await fireEvent.press(screen.getByText("Show me"));
  await settle();
  expect(screen.getByText(/Notifications are off for Plexbie/)).toBeTruthy();

  // Back without allowing them: it stays.
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
  await settle();
  expect(screen.getByText(/Notifications are off for Plexbie/)).toBeTruthy();

  jest.mocked(notificationsAllowed).mockResolvedValue(true);
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
  await settle();
  expect(screen.queryByText(/Notifications are off for Plexbie/)).toBeNull();
  expect(screen.queryByText("Open settings")).toBeNull();
  focusManager.setFocused(undefined);
});

test("the preview's message goes when the screen comes back with notifications allowed", async () => {
  state.mockResolvedValue("off");
  jest.mocked(previewLive).mockResolvedValue("denied");
  jest.mocked(notificationsAllowed).mockResolvedValue(false);
  await show(<LiveRow />);
  await fireEvent.press(screen.getByText("Show me"));
  await settle();
  expect(screen.getByText(/Notifications are off for Plexbie/)).toBeTruthy();

  jest.mocked(notificationsAllowed).mockResolvedValue(true);
  await act(async () => { mockFocus.forEach((f) => f()); });
  await settle();
  expect(screen.queryByText(/Notifications are off for Plexbie/)).toBeNull();
});

test("each switch reads its explanation to a screen reader, including why it's dimmed", async () => {
  state.mockResolvedValue("off");
  await show(<><PushRow /><LiveRow /></>);
  expect(screen.getByRole("switch", { name: "Phone alerts" })).toHaveProp("accessibilityHint", expect.stringContaining("given this phone’s push address"));
  expect(screen.getByRole("switch", { name: "Live progress" })).toHaveProp("accessibilityHint", expect.stringContaining("Turn on phone alerts first"));
});

test("the status bar switch reads what it does, as the screen shows it", async () => {
  state.mockResolvedValue("on");
  await show(<LiveRow />);
  expect(screen.getByRole("switch", { name: "In the status bar" })).toHaveProp("accessibilityHint", expect.stringContaining("Its % stays in the status bar"));
});
