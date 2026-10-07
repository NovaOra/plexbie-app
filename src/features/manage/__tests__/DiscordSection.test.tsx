// Manage → Discord: "Answer DMs automatically" moves as soon as it's tapped and stays with
// the latest tap while saves are out (whatever a reload finds in between), a failed save puts
// it back to what the server has, and each switch reads its explanation to a screen reader.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ApiError } from "../../../api/client";
import type { Ack, AppDiscordOverview } from "../../../api/schemas";
import { ConfirmProvider } from "../../../ui/Confirm";
import { DiscordSection } from "../DiscordSection";

const mockDiscord = jest.fn<(signal?: AbortSignal) => Promise<AppDiscordOverview>>();
const mockInbox = jest.fn<(on: boolean) => Promise<Ack>>();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ adminDiscord: mockDiscord, inboxSettings: mockInbox, say: jest.fn() }),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));
jest.mock("../../../ui/Toast", () => ({ useToast: () => () => undefined }));

const data = (autoreply = true): AppDiscordOverview => ({
  inbox: { autoreply, threadsMissing: null },
  channels: [{ id: "c1", name: "general" }],
  joins: [],
  party: null,
});
const ok: Ack = { ok: true, message: "" };
const deferred = () => {
  let resolve!: (a: Ack) => void, reject!: (e: Error) => void;
  const promise = new Promise<Ack>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
/** A tap, and the screen catching up with it. */
const tap = async () => { await fireEvent.press(toggle()); await settle(); };
const toggle = () => screen.getByRole("switch", { name: "Answer DMs automatically" });

let qc: QueryClient;
beforeEach(() => {
  mockDiscord.mockReset();
  mockInbox.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
// Each save reads the section back a moment later; let that finish before the next test.
afterEach(async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 1600)); });
  qc.clear();
});

const show = async () => {
  await render(<QueryClientProvider client={qc}><ConfirmProvider><DiscordSection /></ConfirmProvider></QueryClientProvider>);
  await settle();
};

test("the switch moves as soon as it's tapped, while the save is on its way", async () => {
  mockDiscord.mockResolvedValue(data(true));
  const save = deferred();
  mockInbox.mockReturnValue(save.promise);
  await show();
  expect(toggle()).toBeChecked();
  await tap();
  expect(mockInbox).toHaveBeenCalledWith(false);
  expect(toggle()).not.toBeChecked();
  mockDiscord.mockResolvedValue(data(false));
  await act(async () => { save.resolve(ok); });
  expect(toggle()).not.toBeChecked();
});

test("a failed save puts the switch back straight away", async () => {
  mockDiscord.mockResolvedValue(data(true));
  const save = deferred();
  mockInbox.mockReturnValue(save.promise);
  await show();
  await tap();
  expect(toggle()).not.toBeChecked();
  await act(async () => { save.reject(new Error("Discord is down")); });
  await settle();
  expect(toggle()).toBeChecked();
});

test("a failed save doesn't undo a later tap", async () => {
  mockDiscord.mockResolvedValue(data(true));
  const first = deferred(), second = deferred(), third = deferred();
  mockInbox.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
  await show();
  await tap();
  await tap();
  await tap();
  expect(mockInbox.mock.calls.map(([on]) => on)).toEqual([false, true, false]);
  expect(toggle()).not.toBeChecked();
  await act(async () => { first.reject(new Error("Discord is down")); });
  await settle();
  expect(toggle()).not.toBeChecked();
  mockDiscord.mockResolvedValue(data(false));
  await act(async () => { second.resolve(ok); third.resolve(ok); });
  await settle();
  expect(toggle()).not.toBeChecked();
});

test("a save that got no answer shows what the reload found, even when it went through", async () => {
  mockDiscord.mockResolvedValue(data(true));
  const save = deferred();
  mockInbox.mockReturnValue(save.promise);
  await show();
  await tap();
  mockDiscord.mockResolvedValue(data(false));
  await act(async () => { save.reject(new ApiError(0, "The server took too long to answer.", "timeout")); });
  await settle();
  expect(mockDiscord).toHaveBeenCalledTimes(2);
  expect(toggle()).not.toBeChecked();
});

test("a reload that lands while a save is out doesn't move the switch back", async () => {
  mockDiscord.mockResolvedValue(data(true));
  const save = deferred();
  mockInbox.mockReturnValue(save.promise);
  await show();
  await tap();
  await act(async () => { await qc.invalidateQueries(); });
  expect(mockDiscord).toHaveBeenCalledTimes(2);
  expect(toggle()).not.toBeChecked();
  await act(async () => { save.resolve(ok); });
  await settle();
  expect(toggle()).not.toBeChecked();
});

test("an earlier save's reload doesn't undo a later tap that's still saving", async () => {
  mockDiscord.mockResolvedValue(data(true));
  const second = deferred();
  mockInbox.mockResolvedValueOnce(ok).mockReturnValueOnce(second.promise);
  await show();
  await tap();
  expect(toggle()).not.toBeChecked();
  // The server took the first tap, not yet the second.
  mockDiscord.mockResolvedValue(data(false));
  await tap();
  expect(toggle()).toBeChecked();
  await act(async () => { await new Promise((r) => setTimeout(r, 1600)); });
  expect(mockDiscord).toHaveBeenCalledTimes(2);
  expect(toggle()).toBeChecked();
  mockDiscord.mockResolvedValue(data(true));
  await act(async () => { second.resolve(ok); });
  await settle();
  expect(toggle()).toBeChecked();
});

test("a reload already on its way when a save goes through doesn't put the old value back", async () => {
  mockDiscord.mockResolvedValue(data(true));
  const save = deferred();
  mockInbox.mockReturnValue(save.promise);
  await show();
  await tap();
  let stale!: (d: AppDiscordOverview) => void;
  mockDiscord.mockReturnValueOnce(new Promise((res) => { stale = res; }));
  void qc.invalidateQueries();
  await settle();
  await act(async () => { save.resolve(ok); });
  await settle();
  expect(toggle()).not.toBeChecked();
  await act(async () => { stale(data(true)); });
  await settle();
  expect(toggle()).not.toBeChecked();
});

test.each(["first", "second"])("when two saves both fail (%s one back first), the switch goes back to what the server has", async (order) => {
  mockDiscord.mockResolvedValue(data(true));
  const first = deferred(), second = deferred();
  mockInbox.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await show();
  await tap();
  await tap();
  expect(mockInbox.mock.calls.map(([on]) => on)).toEqual([false, true]);
  const [a, b] = order === "first" ? [first, second] : [second, first];
  await act(async () => { a.reject(new Error("Discord is down")); });
  await settle();
  await act(async () => { b.reject(new Error("Discord is down")); });
  await settle();
  expect(mockDiscord).toHaveBeenCalledTimes(1);
  expect(toggle()).toBeChecked();
});

test("each switch reads its explanation to a screen reader", async () => {
  mockDiscord.mockResolvedValue(data(true));
  await show();
  expect(toggle()).toHaveProp("accessibilityHint", expect.stringContaining("first DM in 12 hours"));
  expect(screen.getByRole("switch", { name: "Allow @everyone and role pings" }))
    .toHaveProp("accessibilityHint", "Off: those show as plain text and notify nobody.");
});
