// Manage → Cleanup: a day or warning change still saves when you leave the section before
// the tapping pause is over, a failed save puts back only what it changed, a failed Keep
// forever puts back only its title, turning cleanup on while it's set to live asks first, and
// a scan that got no answer keeps Scan now busy until the section has reloaded, and any film
// or show found by searching Plex can be kept forever, not only the ones on the clock.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ApiError } from "../../../api/client";
import type { Ack, AppAdminCleanup, AppCleanupMatch, AppCleanupSettings } from "../../../api/schemas";
import { ConfirmProvider } from "../../../ui/Confirm";
import { CleanupSection } from "../CleanupSection";

const mockCleanup = jest.fn<(signal?: AbortSignal) => Promise<AppAdminCleanup>>();
const mockSettings = jest.fn<(change: Partial<AppCleanupSettings>) => Promise<Ack>>();
const mockExempt = jest.fn<(ratingKey: string, keep: boolean) => Promise<Ack>>();
const mockScan = jest.fn<() => Promise<Ack>>();
const mockSearch = jest.fn<(q: string, signal?: AbortSignal) => Promise<AppCleanupMatch[]>>();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ adminCleanup: mockCleanup, cleanupSettings: mockSettings, exempt: mockExempt, cleanupScan: mockScan, cleanupSearch: mockSearch }),
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

const KEY = ["admin", "https://plexbie.example", "cleanup"];
const data = (settings: Partial<AppCleanupSettings> = {}, rows: Partial<AppAdminCleanup> = {}): AppAdminCleanup => ({
  settings: { enabled: true, practice: true, inactivityDays: 90, warnDaysBefore: 7, excludedLibraries: [], channelId: null, ...settings },
  libraries: ["Films", "Shows"],
  channels: [{ id: "c1", name: "media-cleanup" }],
  warning: [], upcoming: [], exempt: [],
  ...rows,
});
const pause = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const ok: Ack = { ok: true, message: "" };
const deferred = () => {
  let resolve!: (a: Ack) => void, reject!: (e: Error) => void;
  const promise = new Promise<Ack>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let qc: QueryClient;
beforeEach(() => {
  mockCleanup.mockReset();
  mockSettings.mockReset();
  mockExempt.mockReset();
  mockScan.mockReset();
  mockSearch.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
// Each save reads the settings back a moment later; let that finish before the next test.
afterEach(async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
  qc.clear();
});

const show = async () => {
  const view = await render(<QueryClientProvider client={qc}><ConfirmProvider><CleanupSection /></ConfirmProvider></QueryClientProvider>);
  await settle();
  return view;
};

test("a day change saves even when the section closes before the tapping pause ends", async () => {
  mockCleanup.mockResolvedValue(data());
  mockSettings.mockResolvedValue(ok);
  const view = await show();
  await fireEvent.press(await screen.findByRole("button", { name: "Remove after: more" }));
  expect(mockSettings).not.toHaveBeenCalled();
  await view.unmount();
  await act(async () => { await new Promise((r) => setTimeout(r, 1000)); });
  expect(mockSettings).toHaveBeenCalledTimes(1);
  expect(mockSettings).toHaveBeenCalledWith({ inactivityDays: 95, warnDaysBefore: 7 });
});

test("a failed save puts back only what it changed, not a later save that went through", async () => {
  mockCleanup.mockResolvedValue(data());
  const first = deferred();
  mockSettings.mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok);
  await show();
  await fireEvent.press(await screen.findByRole("checkbox", { name: "Skip Films" }));
  await fireEvent.press(screen.getByRole("radio", { name: "#media-cleanup" }));
  await settle();
  expect(mockSettings).toHaveBeenNthCalledWith(1, { excludedLibraries: ["Films"] });
  expect(mockSettings).toHaveBeenNthCalledWith(2, { channelId: "c1" });
  // What the server holds once the second save is in and the first has failed.
  mockCleanup.mockResolvedValue(data({ channelId: "c1" }));

  await act(async () => { first.reject(new Error("The server didn’t answer.")); await first.promise.catch(() => undefined); });
  await settle();
  const settings = qc.getQueryData<AppAdminCleanup>(KEY)?.settings;
  expect(settings?.channelId).toBe("c1");
  expect(settings?.excludedLibraries).toEqual([]);
  expect(screen.getByRole("radio", { name: "#media-cleanup" }).props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByRole("checkbox", { name: "Skip Films" }).props.accessibilityState).toMatchObject({ checked: false });
});

test("turning cleanup on while it's set to live asks first, and can turn it on in practice", async () => {
  mockCleanup.mockResolvedValue(data({ enabled: false, practice: false }));
  mockSettings.mockResolvedValue(ok);
  await show();
  await fireEvent.press(await screen.findByRole("switch", { name: /^Cleanup,/ }));
  expect(screen.getByRole("header", { name: "Go live?" })).toBeTruthy();
  expect(mockSettings).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Turn on in practice" }));
  expect(mockSettings).toHaveBeenCalledWith({ enabled: true, practice: true });
});

test("turning cleanup on live goes ahead only from the dialog", async () => {
  mockCleanup.mockResolvedValue(data({ enabled: false, practice: false }));
  mockSettings.mockResolvedValue(ok);
  await show();
  await fireEvent.press(await screen.findByRole("switch", { name: /^Cleanup,/ }));
  await fireEvent.press(screen.getByRole("button", { name: "Turn on, live" }));
  expect(mockSettings).toHaveBeenCalledWith({ enabled: true });
});

test("turning cleanup on in practice is one tap", async () => {
  mockCleanup.mockResolvedValue(data({ enabled: false, practice: true }));
  mockSettings.mockResolvedValue(ok);
  await show();
  await fireEvent.press(await screen.findByRole("switch", { name: /^Cleanup,/ }));
  expect(screen.queryByRole("header", { name: "Go live?" })).toBeNull();
  expect(mockSettings).toHaveBeenCalledWith({ enabled: true, practice: true });
});

test("turning live cleanup off is one tap", async () => {
  mockCleanup.mockResolvedValue(data({ enabled: true, practice: false }));
  mockSettings.mockResolvedValue(ok);
  await show();
  await fireEvent.press(await screen.findByRole("switch", { name: /^Cleanup,/ }));
  expect(screen.queryByRole("header", { name: "Go live?" })).toBeNull();
  expect(mockSettings).toHaveBeenCalledWith({ enabled: false });
});

test("a failed save leaves a setting alone when a later save sent the same value and went through", async () => {
  mockCleanup.mockResolvedValue(data());
  const first = deferred();
  mockSettings.mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok);
  await show();
  await fireEvent.press(await screen.findByRole("button", { name: "Warn: fewer" }));
  await pause(1000);
  await fireEvent.press(screen.getByRole("button", { name: "Remove after: more" }));
  await pause(1000);
  expect(mockSettings).toHaveBeenNthCalledWith(1, { inactivityDays: 90, warnDaysBefore: 6 });
  expect(mockSettings).toHaveBeenNthCalledWith(2, { inactivityDays: 95, warnDaysBefore: 6 });
  mockCleanup.mockResolvedValue(data({ inactivityDays: 95, warnDaysBefore: 6 }));

  await act(async () => { first.reject(new Error("The server didn’t answer.")); await first.promise.catch(() => undefined); });
  await settle();
  expect(qc.getQueryData<AppAdminCleanup>(KEY)?.settings).toMatchObject({ inactivityDays: 95, warnDaysBefore: 6 });
});

test("two overlapping saves that both fail put back what the server had", async () => {
  mockCleanup.mockResolvedValue(data());
  const first = deferred(), second = deferred();
  mockSettings.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await show();
  await fireEvent.press(await screen.findByRole("button", { name: "Warn: fewer" }));
  await pause(1000);
  await fireEvent.press(screen.getByRole("button", { name: "Warn: fewer" }));
  await pause(1000);
  expect(mockSettings).toHaveBeenNthCalledWith(2, { inactivityDays: 90, warnDaysBefore: 5 });

  await act(async () => { first.reject(new Error("The server didn’t answer.")); await first.promise.catch(() => undefined); });
  await act(async () => { second.reject(new Error("The server didn’t answer.")); await second.promise.catch(() => undefined); });
  await settle();
  expect(qc.getQueryData<AppAdminCleanup>(KEY)?.settings.warnDaysBefore).toBe(7);
});

test("a failed Keep forever puts back only its title, not a settings save that went through", async () => {
  const row = { ratingKey: "r1", title: "Big Buck Bunny", type: "movie", daysLeft: 3, reason: "added" };
  mockCleanup.mockResolvedValue(data({}, { warning: [row] }));
  const keep = deferred();
  mockExempt.mockReturnValueOnce(keep.promise);
  mockSettings.mockResolvedValue(ok);
  await show();
  await fireEvent.press(await screen.findByRole("switch", { name: /^Keep forever, Big Buck Bunny/ }));
  await fireEvent.press(screen.getByRole("radio", { name: "#media-cleanup" }));
  await settle();
  expect(mockExempt).toHaveBeenCalledWith("r1", true);
  mockCleanup.mockResolvedValue(data({ channelId: "c1" }, { warning: [row] }));

  await act(async () => { keep.reject(new Error("The server didn’t answer.")); await keep.promise.catch(() => undefined); });
  await settle();
  const d = qc.getQueryData<AppAdminCleanup>(KEY);
  expect(d?.settings.channelId).toBe("c1");
  expect(d?.warning.map((r) => r.ratingKey)).toEqual(["r1"]);
  expect(d?.exempt).toEqual([]);
});

test("a scan that got no answer keeps Scan now busy until the section has reloaded", async () => {
  mockCleanup.mockResolvedValue(data());
  const scan = deferred();
  mockScan.mockReturnValueOnce(scan.promise);
  await show();
  await fireEvent.press(await screen.findByRole("button", { name: "Scan now" }));
  expect(mockScan).toHaveBeenCalledTimes(1);
  let reloaded!: (d: AppAdminCleanup) => void;
  mockCleanup.mockReturnValueOnce(new Promise((res) => { reloaded = res; }));

  await act(async () => { scan.reject(new ApiError(0, "The server took too long to answer.", "timeout")); await scan.promise.catch(() => undefined); });
  await settle();
  expect(screen.getByRole("button", { name: "Scanning…" }).props.accessibilityState).toMatchObject({ busy: true });
  await act(async () => { reloaded(data()); });
  await settle();
  expect(screen.getByRole("button", { name: "Scan now" }).props.accessibilityState).toMatchObject({ busy: false });
});

test("a film nowhere near the clock can be found on Plex and kept forever", async () => {
  mockCleanup.mockResolvedValue(data());
  mockSearch.mockResolvedValue([{ ratingKey: "r9", title: "Elephants Dream", type: "movie", year: 2006, kept: false }]);
  mockExempt.mockResolvedValue(ok);
  await show();
  await fireEvent.changeText(await screen.findByLabelText("Search Plex by title"), "E");
  await pause(400);
  // One letter isn't a search.
  expect(mockSearch).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText("Search Plex by title"), "Elephants");
  await pause(400);
  await settle();
  expect(mockSearch).toHaveBeenCalledTimes(1);
  expect(mockSearch.mock.calls[0][0]).toBe("Elephants");
  expect(screen.getByText("1 title found")).toBeTruthy();

  await fireEvent.press(screen.getByRole("switch", { name: "Keep Elephants Dream forever" }));
  await settle();
  expect(mockExempt).toHaveBeenCalledWith("r9", true);
  expect(qc.getQueryData<AppAdminCleanup>(KEY)?.exempt).toEqual([{ ratingKey: "r9", title: "Elephants Dream", type: "movie", year: 2006 }]);
  expect(screen.getByRole("switch", { name: "Keep Elephants Dream forever" }).props.accessibilityState).toMatchObject({ checked: true });
  // Keeping it doesn't search Plex again.
  await pause(1000);
  expect(mockSearch).toHaveBeenCalledTimes(1);
});

test("a title search that fails says why and can be tried again", async () => {
  mockCleanup.mockResolvedValue(data());
  mockSearch.mockRejectedValueOnce(new ApiError(503, "Plex isn’t connected.", "http"))
    .mockResolvedValueOnce([{ ratingKey: "r9", title: "Elephants Dream", type: "movie", year: 2006, kept: true }]);
  await show();
  await fireEvent.changeText(await screen.findByLabelText("Search Plex by title"), "Elephants");
  await pause(400);
  await settle();
  expect(screen.getByText("Couldn’t search Plex. Plex isn’t connected.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await settle();
  expect(mockSearch).toHaveBeenCalledTimes(2);
  expect(screen.getByText("1 title found")).toBeTruthy();
});

test("a Plexbie from before the title search is told to update", async () => {
  mockCleanup.mockResolvedValue(data());
  mockSearch.mockRejectedValue(new ApiError(404, "The server said no (404).", "http"));
  await show();
  await fireEvent.changeText(await screen.findByLabelText("Search Plex by title"), "Elephants");
  await pause(400);
  await settle();
  expect(screen.getByText("This Plexbie can’t search Plex from the app yet. Update it, then try again.")).toBeTruthy();
});

test("a Plexbie that has the search but can't answer it says why, not to update", async () => {
  mockCleanup.mockResolvedValue(data());
  mockSearch.mockRejectedValue(new ApiError(404, "Not found.", "http"));
  await show();
  await fireEvent.changeText(await screen.findByLabelText("Search Plex by title"), "Elephants");
  await pause(400);
  await settle();
  expect(screen.getByText("Couldn’t search Plex. Not found.")).toBeTruthy();
});

test("coming back to the app or back online doesn't search Plex again", async () => {
  mockCleanup.mockResolvedValue(data());
  mockSearch.mockResolvedValue([{ ratingKey: "r9", title: "Elephants Dream", type: "movie", year: 2006, kept: false }]);
  await show();
  await fireEvent.changeText(await screen.findByLabelText("Search Plex by title"), "Elephants");
  await pause(400);
  await settle();
  expect(mockSearch).toHaveBeenCalledTimes(1);
  await act(async () => { focusManager.setFocused(false); onlineManager.setOnline(false); });
  await act(async () => { focusManager.setFocused(true); onlineManager.setOnline(true); });
  await settle();
  expect(mockSearch).toHaveBeenCalledTimes(1);
  expect(screen.getByText("1 title found")).toBeTruthy();
  await act(async () => { focusManager.setFocused(undefined); });
});
