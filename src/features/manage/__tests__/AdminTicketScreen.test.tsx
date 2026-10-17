// One ticket on Manage → Tickets: "Take it" and "Let it go" are the same button, and the
// bot flips whatever the ticket is, so the button waits until it knows whether the ticket
// is yours. While solving it, a search that's on its way holds "Solve it" back. A ticket
// about a film says "Title", links to its page and to Plex, and shows what Plexbie saw a line
// at a time; a general one says "General", and has nothing to search for.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { titleTicket } from "../../../api/__fixtures__/bot";
import type { Ack, AppAdminTicketDetail } from "../../../api/schemas";
import { AdminTicketScreen } from "../AdminTicketScreen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "abc123abc123" }),
  useFocusEffect: () => undefined,
  router: { push: (...to: unknown[]) => mockPush(...to), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, reward: () => undefined, error: () => undefined, success: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null, GlassFill: () => null, FrostedTop: () => null, glass: { surface: {} } }));
jest.mock("../../../ui/StatusBarScrim", () => ({ StatusBarScrim: () => null }));
jest.mock("../../request/StageBox", () => ({ StageBox: () => null }));
jest.mock("../BlockedImport", () => ({ BlockedImport: () => null }));
jest.mock("../../../ui/useDraftGuard", () => ({ useDraftGuard: () => () => undefined }));
const mockToast = jest.fn();
jest.mock("../../../ui/Toast", () => ({ useToast: () => mockToast }));

type Me = { data?: { user: { name: string } }; error: Error | null; isFetching: boolean; refetch: () => void };
const mockRefetchMe = jest.fn();
let mockMe: Me;
jest.mock("../../me/useMe", () => ({ useMe: () => mockMe }));

const mockClient = {
  adminTicket: jest.fn<() => Promise<AppAdminTicketDetail>>(),
  ticketTake: jest.fn<() => Promise<Ack>>(),
  ticketStatus: jest.fn<() => Promise<Ack>>(),
  helpSearch: jest.fn<() => Promise<Ack>>(),
};
jest.mock("../../../auth/session", () => ({
  useApi: () => mockClient,
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
  useServer: () => "https://plexbie.example",
}));

const now = new Date().toISOString();
const ticket = {
  id: "abc123abc123", subject: "request", requestKey: "3", slot: 3, title: "Big Buck Bunny", kind: "movie", seasons: null, who: "Sam Rivers",
  reason: "Won’t play", status: "open", waiting: false, owner: "Alex", openedBy: null, offer: null,
  createdAt: now, updatedAt: now, last: null, count: 1, note: null, statusThen: null, thread: [], request: null, blocked: null,
} as AppAdminTicketDetail;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let qc: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockMe = { data: { user: { name: "Alex" } }, error: null, isFetching: false, refetch: mockRefetchMe };
  mockClient.adminTicket.mockResolvedValue(ticket);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 1600)); });
  qc.clear();
});

const show = async (title = "Big Buck Bunny") => {
  await render(<QueryClientProvider client={qc}><AdminTicketScreen /></QueryClientProvider>);
  await screen.findByRole("header", { name: title });
};
const disabled = (name: string) => !!screen.getByRole("button", { name }).props.accessibilityState?.disabled;

test("yours: Let it go, and it says so, so a second press can't take it back", async () => {
  mockClient.ticketTake.mockResolvedValue({ ok: true, message: "Let go. Anyone can take it." });
  await show();
  expect(disabled("Let it go")).toBe(false);
  await fireEvent.press(screen.getByRole("button", { name: "Let it go" }));
  expect(mockClient.ticketTake).toHaveBeenCalledWith(expect.any(String), "release");
});

test("a take the bot says changed nothing is a quiet note, not a success", async () => {
  mockClient.ticketTake.mockResolvedValue({ ok: true, changed: false, message: "It isn’t yours, so there’s nothing to let go." });
  await show();
  await fireEvent.press(screen.getByRole("button", { name: "Let it go" }));
  await settle();
  expect(mockToast).toHaveBeenCalledWith({ tone: "quiet", text: "It isn’t yours, so there’s nothing to let go." });
});

test("until it's known who you are, the button can't flip the ticket", async () => {
  mockMe = { data: undefined, error: null, isFetching: true, refetch: mockRefetchMe };
  await show();
  expect(screen.queryByRole("button", { name: "Take it over" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Let it go" })).toBeNull();
  await fireEvent.press(screen.getByLabelText("Checking whether it’s yours"));
  expect(mockClient.ticketTake).not.toHaveBeenCalled();
});

test("when that couldn't be checked, Try again asks again instead of guessing", async () => {
  mockMe = { data: undefined, error: new Error("The server didn’t answer."), isFetching: false, refetch: mockRefetchMe };
  await show();
  expect(screen.queryByRole("button", { name: "Take it over" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Couldn’t check whether it’s yours. Try again" }));
  expect(mockRefetchMe).toHaveBeenCalledTimes(1);
  expect(mockClient.ticketTake).not.toHaveBeenCalled();
});

test("while a search is on its way, Solve it waits", async () => {
  const searching = deferred<Ack>();
  mockClient.helpSearch.mockReturnValue(searching.promise);
  await show();
  await fireEvent.press(screen.getByRole("button", { name: "Solve…" }));
  await fireEvent.press(screen.getByRole("button", { name: "Search again" }));
  await settle();
  expect(disabled("Solve it")).toBe(true);
  await act(async () => { searching.resolve({ ok: true, message: "Searching" } as Ack); });
  await settle();
  expect(disabled("Solve it")).toBe(false);
});

test("a request's ticket says its number", async () => {
  await show();
  expect(screen.getByText("No. 0003 · Won’t play")).toBeTruthy();
});

test("a ticket about a film: Title, its page, Open in Plex, what Plexbie saw a line at a time, and the searches", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  mockClient.adminTicket.mockResolvedValue(titleTicket as AppAdminTicketDetail);
  await show("Sintel (2010)");
  expect(screen.getByText("Title · Picture looks wrong")).toBeTruthy();
  expect(screen.getByText("When it was opened, Plexbie saw")).toBeTruthy();
  expect(screen.getByText("File: 4K WEB-DL, Dolby Vision + HDR10, 3.1 GB")).toBeTruthy();
  expect(screen.getByText("Last played Oct 8 on SHIELD (Plex for Android (TV)), direct play, 4K HDR")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Search again" })).toBeTruthy();

  await fireEvent.press(screen.getByRole("button", { name: "Open its page" }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/title/[kind]/[id]", params: { kind: "movie", id: "900104" } });
  await fireEvent.press(screen.getByRole("button", { name: "Open in Plex" }));
  expect(open).toHaveBeenCalledWith(titleTicket.plexUrl);
  open.mockRestore();
});

test("when Plexbie offers a search by name, it's the raised key, in one row with Search again", async () => {
  mockClient.adminTicket.mockResolvedValue({ ...titleTicket, offer: "name" } as AppAdminTicketDetail);
  await show("Sintel (2010)");
  const byName = screen.getByRole("button", { name: "Search by name" });
  const again = screen.getByRole("button", { name: "Search again" });
  // Siblings in one KeyRow: side by side in equal halves, or both full width, never a key over a pill.
  expect(byName.parent?.parent).toBeTruthy();
  expect(byName.parent?.parent).toBe(again.parent?.parent);
});

test("a ticket about a film Plex has no TMDB id for: nothing to search with, and no page to open", async () => {
  mockClient.adminTicket.mockResolvedValue({ ...titleTicket, tmdb: null, plexUrl: null } as AppAdminTicketDetail);
  await show("Sintel (2010)");
  expect(screen.queryByRole("button", { name: "Search again" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Open its page" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Open in Plex" })).toBeNull();
});

test("a general ticket: General, and nothing to search for or open", async () => {
  mockClient.adminTicket.mockResolvedValue({
    ...titleTicket, subject: "general", title: "", tmdb: null, year: null, kind: "", plexUrl: null, reason: "Can't get in, or nothing plays",
    statusThen: "Last played Sintel Oct 6 on iPhone (Plex for iOS), direct play, 1080p SDR",
  } as AppAdminTicketDetail);
  await show("General ticket");
  expect(screen.getByText("General · Can't get in, or nothing plays")).toBeTruthy();
  expect(screen.getByText("Last played Sintel Oct 6 on iPhone (Plex for iOS), direct play, 1080p SDR")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Search again" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Open its page" })).toBeNull();
});

test("one Plexbie opened: its first message is Plexbie's, for the member, and nothing says the reason twice", async () => {
  mockClient.adminTicket.mockResolvedValue({
    ...ticket, reason: "Can’t be found", offer: "name", statusThen: "Nothing found",
    request: { slot: 3, title: { id: "1", kind: "movie", title: "Big Buck Bunny" }, stage: "searching", requestedAt: now, updatedAt: now,
      stuck: ["Help asked: Can’t be found", "Nothing found for over a day"] },
    thread: [{ id: "e1", kind: "member", by: "Sam Rivers", text: "Can’t be found. 212 releases came back, but none matched by ID. Search by name instead?", at: now }],
  } as AppAdminTicketDetail);
  await show();
  expect(screen.getByText("Opened by Plexbie for Sam Rivers just now")).toBeTruthy();
  expect(screen.getByText("Plexbie, for Sam Rivers")).toBeTruthy();
  expect(screen.getByText("212 releases came back, but none matched by ID. Search by name instead?")).toBeTruthy();
  expect(screen.queryByText("When it was opened, Plexbie saw")).toBeNull();
  expect(screen.getByText("⚠︎ Nothing found for over a day")).toBeTruthy();
  expect(screen.queryByText("⚠︎ Help asked: Can’t be found")).toBeNull();
});

test("a member's own: their name on their message, and what Plexbie saw when it adds something", async () => {
  mockClient.adminTicket.mockResolvedValue({
    ...ticket, reason: "Stuck downloading", statusThen: "Downloading, 62%",
    thread: [{ id: "e1", kind: "member", by: "Sam Rivers", text: "Stuck downloading. Since this morning.", at: now }],
  } as AppAdminTicketDetail);
  await show();
  expect(screen.getByText("Asked by Sam Rivers just now")).toBeTruthy();
  expect(screen.getByText("Sam Rivers")).toBeTruthy();
  expect(screen.getByText("Downloading, 62%")).toBeTruthy();
});
