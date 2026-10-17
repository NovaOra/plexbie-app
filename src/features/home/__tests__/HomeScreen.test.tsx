// Home's channel: what just arrived loads on its own and is given up on after 8 seconds, so it
// never loads forever; then it's off air (tab "Channel", what happened, a quiet Try again
// pill), and the rest of Home is there and usable all along, while it loads and after it fails.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../../api/client";
import { resetSample, sampleApi } from "../../../api/sample";
import { HomeScreen } from "../HomeScreen";
import { ARRIVALS_DEADLINE_MS, withDeadline } from "../useHome";

// The sample household, with what just arrived as each test needs it.
const mockArrivals = jest.fn<(signal?: AbortSignal) => Promise<unknown>>();
const mockApi = new Proxy({} as typeof sampleApi, {
  get: (_t, k: string) => (k === "arrivals" ? mockArrivals : (sampleApi as unknown as Record<string, unknown>)[k]),
});
jest.mock("../../../auth/session", () => ({
  useApi: () => mockApi,
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: null, sample: true } }),
  useServer: () => "https://plexbie.example",
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() }, useFocusEffect: () => undefined }));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, error: () => undefined }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null, GlassFill: () => null, glass: { surface: {} }, TAB_BAR_CLEARANCE: 0 }));
jest.mock("../../../ui/StatusBarScrim", () => ({ StatusBarScrim: () => null }));
jest.mock("../../update/UpdateCard", () => ({ UpdateCard: () => null }));

const LONG = { timeout: 4000 };
const OFF_AIR = "Couldn’t get what’s new on Plex just now. Nothing is lost.";
let qc: QueryClient;
beforeEach(() => {
  resetSample();
  mockArrivals.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await qc.cancelQueries(); qc.clear(); });
const home = () => render(<QueryClientProvider client={qc}><HomeScreen /></QueryClientProvider>);

test("a load that runs past its deadline ends as a timeout, and its own signal is aborted", async () => {
  jest.useFakeTimers();
  try {
    let seen: AbortSignal | undefined;
    const late = withDeadline((s) => { seen = s; return new Promise(() => undefined); }, ARRIVALS_DEADLINE_MS);
    const caught = late.catch((e: unknown) => e);
    jest.advanceTimersByTime(ARRIVALS_DEADLINE_MS - 1);
    expect(seen?.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    const e = await caught;
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).kind).toBe("timeout");
    expect(seen?.aborted).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

test("a load in time is its answer; one cancelled from outside is that, not a timeout", async () => {
  expect(await withDeadline(async () => "here", ARRIVALS_DEADLINE_MS)).toBe("here");
  const outer = new AbortController();
  const cancelled = withDeadline((s) => new Promise((_ok, no) => s.addEventListener("abort", () => no(new Error("Cancelled.")))), ARRIVALS_DEADLINE_MS, outer.signal);
  outer.abort();
  await expect(cancelled).rejects.toThrow("Cancelled.");
});

test("the rest of Home is there while the channel is still loading", async () => {
  // Still on its way (until Home goes, which cancels it).
  mockArrivals.mockImplementation((s) => new Promise((_ok, no) => s?.addEventListener("abort", () => no(new Error("Cancelled.")))));
  await home();
  expect(screen.getByText("Just arrived")).toBeTruthy();
  expect(screen.getAllByLabelText("Loading").length).toBeGreaterThan(0);
  // Your requests and who's watching arrive without waiting for it.
  expect(await screen.findByRole("button", { name: "All requests" }, LONG)).toBeTruthy();
  expect((await screen.findAllByLabelText(/ is watching /, undefined, LONG)).length).toBeGreaterThan(0);
  expect(screen.queryByText(OFF_AIR)).toBeNull();
});

test("a channel that didn't answer is off air, with a quiet Try again that loads it afresh", async () => {
  mockArrivals.mockRejectedValueOnce(new ApiError(0, "The server took too long to answer.", "timeout"));
  await home();
  expect(await screen.findByText(OFF_AIR, undefined, LONG)).toBeTruthy();
  expect(screen.getByLabelText(`Channel. ${OFF_AIR}`).props.accessibilityRole).toBe("alert");
  // The rest of Home still works.
  expect((await screen.findAllByLabelText(/ is watching /, undefined, LONG)).length).toBeGreaterThan(0);
  mockArrivals.mockImplementation((s) => (sampleApi.arrivals as (signal?: AbortSignal) => Promise<unknown>)(s));
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(mockArrivals).toHaveBeenCalledTimes(2);
  // Afresh: the channel's placeholders, then what arrived.
  await waitFor(() => expect(screen.queryByText(OFF_AIR)).toBeNull(), LONG);
  expect((await screen.findAllByLabelText(/, added /, undefined, LONG)).length).toBeGreaterThan(0);
});
