// Manage → All requests: a search that fails or waits for a connection says so (never
// "Nothing found"), the header keeps its 30-day wording until every request has loaded
// (with a way to try again when that fails), and a long list arrives 50 rows at a time. A
// first load that fails or waits for a connection says so, instead of a list of zeros.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AppAdminAllRequests, AppAdminRequestRow } from "../../../api/schemas";
import { AllRequestsSection } from "../AllRequestsSection";

const mockAdminAll = jest.fn<(q: string, signal?: AbortSignal, everything?: boolean) => Promise<AppAdminAllRequests>>();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ adminAll: mockAdminAll }),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null, GlassFill: () => null, glass: { surface: {} } }));

const row = (slot: number, stage = "available"): AppAdminRequestRow => ({
  id: String(9000 + slot), slot, stage, requestedAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-02T12:00:00Z",
  title: { id: String(100 + slot), kind: "movie", title: `Open Movie ${slot}`, year: "2008", poster: null, availability: "available" },
  requester: "Jordan Lee", status: "approved", stuck: [],
} as AppAdminRequestRow);
const answer = (rows: AppAdminRequestRow[], everything = false): AppAdminAllRequests => ({
  rows, query: null, everything, total: 400,
  counts: { active: 0, stuck: 0, waiting: 0, finished: rows.length, declined: 0 },
});
const recent = answer([row(300), row(299)]);
const cards = () => screen.queryAllByRole("button", { name: /^Open Movie \d+, request/ });

let qc: QueryClient;
beforeEach(() => {
  mockAdminAll.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { qc.clear(); onlineManager.setOnline(true); });

const show = () => render(<QueryClientProvider client={qc}><AllRequestsSection /></QueryClientProvider>);
const search = async (words: string) => {
  await fireEvent.changeText(screen.getByLabelText("Search every request, by title, who asked, or number"), words);
};

test("a search that fails says so and can be tried again, instead of “Nothing found”", async () => {
  mockAdminAll.mockImplementation(async (q) => { if (q) throw new Error("The server didn’t answer."); return recent; });
  await show();
  expect(await screen.findByText(/Showing the last 30 days/)).toBeTruthy();
  await search("plan 9");
  expect(await screen.findByText("Couldn’t search.")).toBeTruthy();
  expect(screen.queryByText("Nothing found")).toBeNull();

  mockAdminAll.mockImplementation(async (q) => (q ? { ...answer([row(1, "declined")]), counts: null, query: q } : recent));
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("1 request found")).toBeTruthy();
  expect(screen.queryByText("Couldn’t search.")).toBeNull();
});

test("a search while offline says it’s offline, instead of “Nothing found”", async () => {
  mockAdminAll.mockResolvedValue(recent);
  await show();
  expect(await screen.findByText(/Showing the last 30 days/)).toBeTruthy();
  await act(async () => { onlineManager.setOnline(false); });
  await search("plan 9");
  expect(await screen.findByText(/^Offline\./)).toBeTruthy();
  expect(screen.queryByText("Nothing found")).toBeNull();
  expect(mockAdminAll).not.toHaveBeenCalledWith("plan 9", expect.anything());

  await act(async () => { onlineManager.setOnline(true); });
  expect(await screen.findByText("2 requests found")).toBeTruthy();
});

test("trying again while offline shows only the offline note", async () => {
  mockAdminAll.mockImplementation(async (q, _signal, everything) => { if (q || everything) throw new Error("The server didn’t answer."); return recent; });
  await show();
  await fireEvent.press(await screen.findByRole("button", { name: "Every request since No. 0001 · 400" }));
  expect(await screen.findByText("Couldn’t load every request.")).toBeTruthy();
  await act(async () => { onlineManager.setOnline(false); });
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(/^Offline\. Every request loads/)).toBeTruthy();
  expect(screen.queryByText("Couldn’t load every request.")).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

  await act(async () => { onlineManager.setOnline(true); });
  await search("plan 9");
  expect(await screen.findByText("Couldn’t search.")).toBeTruthy();
  await act(async () => { onlineManager.setOnline(false); });
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(/^Offline\. Plexbie searches/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

  mockAdminAll.mockImplementation(async (q, _signal, everything) => (q ? { ...answer([row(1, "declined")]), counts: null, query: q } : everything ? answer([row(1)], true) : recent));
  await act(async () => { onlineManager.setOnline(true); });
  expect(await screen.findByText("1 request found")).toBeTruthy();
});

test("when every request fails to load, the header stays on the last 30 days, with a way to try again", async () => {
  mockAdminAll.mockImplementation(async (_q, _signal, everything) => { if (everything) throw new Error("The server didn’t answer."); return recent; });
  await show();
  await fireEvent.press(await screen.findByRole("button", { name: "Every request since No. 0001 · 400" }));
  expect(await screen.findByText("Couldn’t load every request.")).toBeTruthy();
  expect(screen.getByText(/Showing the last 30 days/)).toBeTruthy();
  expect(screen.queryByText(/Showing every request since No\. 0001/)).toBeNull();

  mockAdminAll.mockImplementation(async (_q, _signal, everything) => (everything ? answer([row(300), row(299), row(1)], true) : recent));
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(/Showing every request since No\. 0001/)).toBeTruthy();
  expect(screen.queryByText("Couldn’t load every request.")).toBeNull();
  expect(cards()).toHaveLength(3);
});

test("a long history shows 50 rows at a time", async () => {
  const many = Array.from({ length: 120 }, (_, i) => row(120 - i));
  mockAdminAll.mockImplementation(async (_q, _signal, everything) => (everything ? answer(many, true) : recent));
  await show();
  await fireEvent.press(await screen.findByRole("button", { name: "Every request since No. 0001 · 400" }));
  expect(await screen.findByText(/Showing every request since No\. 0001/)).toBeTruthy();
  expect(cards()).toHaveLength(50);

  await fireEvent.press(screen.getByRole("button", { name: "Show 50 more" }));
  expect(cards()).toHaveLength(100);
  await fireEvent.press(screen.getByRole("button", { name: "Show 20 more" }));
  expect(cards()).toHaveLength(120);
  expect(screen.queryByRole("button", { name: /^Show \d+ more$/ })).toBeNull();

  // Going back to the last 30 days, and out again, starts at 50 once more.
  await fireEvent.press(screen.getByRole("button", { name: "Back to the last 30 days" }));
  expect(cards()).toHaveLength(2);
  await fireEvent.press(screen.getByRole("button", { name: "Every request since No. 0001 · 400" }));
  expect(cards()).toHaveLength(50);
  // Coming back refreshes the full history in the background; let that land inside the test.
  await waitFor(() => expect(qc.isFetching()).toBe(0));
  expect(cards()).toHaveLength(50);
});

test("a first load that fails says so with Try again, instead of an empty list of zeros", async () => {
  mockAdminAll.mockRejectedValueOnce(new Error("The server didn’t answer.")).mockResolvedValue(recent);
  await show();
  expect(await screen.findByText("Couldn’t load requests.")).toBeTruthy();
  expect(screen.getByText("The server didn’t answer.")).toBeTruthy();
  expect(screen.queryByText(/ · 0$/)).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(cards()).toHaveLength(2));
  expect(screen.queryByText("Couldn’t load requests.")).toBeNull();
});

test("offline before anything has loaded, it says so instead of a list of zeros", async () => {
  onlineManager.setOnline(false);
  mockAdminAll.mockResolvedValue(recent);
  await show();
  expect(await screen.findByText("You’re offline.")).toBeTruthy();
  expect(screen.queryByText(/ · 0$/)).toBeNull();
});
