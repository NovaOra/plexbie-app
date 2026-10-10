// The title page: a first load that fails shows the error with a way to try again, a
// background refetch that fails later keeps the loaded page, with the seasons ticked so far,
// and the same screen showing another title starts that title's request form afresh.
// Offline before the title has loaded, it says so. Something wrong with a film or show on
// Plex is a ticket (the member's open one, when there is one), but not on an older bot, and
// not while the member's live request is shown.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../../api/client";
import { bunny, pepper, prideAndPrejudice } from "../../../api/__fixtures__/bot";
import type { AppMyTicket, AppTitle } from "../../../api/schemas";
import { TitleScreen } from "../TitleScreen";

let mockParams = { kind: "tv", id: "900102" };          // Pepper & Carrot
const mockTitle = jest.fn<(kind: string, id: string, signal?: AbortSignal) => Promise<AppTitle>>();
const mockMyTickets = jest.fn<() => Promise<AppMyTicket[]>>();
const mockPush = jest.fn();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ title: mockTitle, myTickets: mockMyTickets }),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
  useServer: () => "https://plexbie.example",
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
  router: { push: (...to: unknown[]) => mockPush(...to), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock("../../me/useMe", () => ({ useMe: () => ({ data: { member: true } }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
// Reanimated's own stand-ins, plus what its mock leaves out.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null, GlassFill: () => null, glass: { surface: {} } }));
jest.mock("../../search/Discover", () => ({ MoreLikeThis: () => null }));
jest.mock("../../push/PushRow", () => ({ PushOffer: () => null }));

let qc: QueryClient;
beforeEach(() => {
  mockTitle.mockReset();
  mockMyTickets.mockReset();
  mockPush.mockReset();
  mockParams = { kind: "tv", id: pepper.id };
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { qc.clear(); onlineManager.setOnline(true); });

const show = () => render(<QueryClientProvider client={qc}><TitleScreen /></QueryClientProvider>);
const seasonTwo = () => screen.getByRole("checkbox", { name: /^Season 2,/ });

test("a first load that fails shows the error and a way to try again", async () => {
  mockTitle.mockRejectedValue(new Error("The server didn’t answer."));
  await show();
  expect(await screen.findByText("Couldn’t load this title.")).toBeTruthy();
  expect(screen.getByText("The server didn’t answer.")).toBeTruthy();
  mockTitle.mockResolvedValue(pepper as AppTitle);
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("header", { name: pepper.title })).toBeTruthy();
});

test("a background refetch that fails keeps the page and the seasons picked", async () => {
  mockTitle.mockResolvedValue(pepper as AppTitle);
  await show();
  expect(await screen.findByRole("header", { name: pepper.title })).toBeTruthy();
  await fireEvent.press(seasonTwo());
  expect(seasonTwo().props.accessibilityState).toMatchObject({ checked: true });

  mockTitle.mockRejectedValue(new Error("The server didn’t answer."));
  await act(async () => { await qc.refetchQueries({ queryKey: ["title"] }); });
  await waitFor(() => expect(qc.getQueryState(["title", "https://plexbie.example", "tv", pepper.id])?.status).toBe("error"));
  // The query tells the screen on its next tick.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  expect(screen.queryByText("Couldn’t load this title.")).toBeNull();
  expect(screen.getByRole("header", { name: pepper.title })).toBeTruthy();
  expect(seasonTwo().props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByText(/You’re asking for season 2\./)).toBeTruthy();
});

test("the same screen showing another title doesn't keep the seasons picked for the last one", async () => {
  const other = { ...pepper, id: "900103", title: "Pepper & Carrot: Shorts" } as AppTitle;
  mockTitle.mockImplementation(async (_kind, id) => (id === other.id ? other : pepper) as AppTitle);
  // Already cached, so the screen goes straight from one loaded title to the next.
  qc.setQueryData(["title", "https://plexbie.example", "tv", other.id], other);
  const view = await show();
  expect(await screen.findByRole("header", { name: pepper.title })).toBeTruthy();
  await fireEvent.press(seasonTwo());
  expect(seasonTwo().props.accessibilityState).toMatchObject({ checked: true });

  mockParams = { kind: "tv", id: other.id };
  await view.rerender(<QueryClientProvider client={qc}><TitleScreen /></QueryClientProvider>);

  expect(await screen.findByRole("header", { name: other.title })).toBeTruthy();
  expect(seasonTwo().props.accessibilityState).toMatchObject({ checked: false });
  expect(screen.queryByText(/You’re asking for season 2\./)).toBeNull();
  // Its own background refetch settles on the same title.
  await waitFor(() => expect(mockTitle).toHaveBeenCalledWith("tv", other.id, expect.anything()));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(screen.getByRole("header", { name: other.title })).toBeTruthy();
});

test("offline before the title has loaded, it says so instead of a placeholder", async () => {
  onlineManager.setOnline(false);
  mockTitle.mockResolvedValue(pepper as AppTitle);
  await show();
  expect(await screen.findByText("You’re offline.")).toBeTruthy();
  expect(screen.queryByLabelText("Loading")).toBeNull();
  expect(mockTitle).not.toHaveBeenCalled();
});

const onPlex = { ...bunny, onPlex: true } as AppTitle;      // a film on Plex nobody asked for
const openTicket = () => screen.queryByRole("button", { name: "Something wrong? Open a ticket" });

test("a film on Plex: something wrong with it is a ticket, opened on that film", async () => {
  mockParams = { kind: "movie", id: bunny.id };
  mockTitle.mockResolvedValue(onPlex);
  await show();
  expect(await screen.findByRole("header", { name: bunny.title })).toBeTruthy();
  // The ticket says it now, not Discord.
  expect(screen.getByText("Watch on Plex opens it.")).toBeTruthy();
  expect(screen.queryByText("If something’s missing, say so in Discord.")).toBeNull();
  await fireEvent.press(openTicket()!);
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/ticket/new", params: { kind: "movie", id: bunny.id, title: bunny.title } });
});

test("with a ticket open on it, the page opens that ticket, saying when an admin asked something", async () => {
  mockParams = { kind: "movie", id: bunny.id };
  const ticket = { id: "0a1b2c3d4e5f", reason: "Won't play on Plex", subject: "title" as const, status: "open", waiting: false, thread: [] };
  mockTitle.mockResolvedValue({ ...onPlex, yourTicket: ticket });
  await show();
  await fireEvent.press(await screen.findByRole("button", { name: "Your ticket: won't play on Plex" }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/ticket/[id]", params: { id: "0a1b2c3d4e5f" } });
  expect(openTicket()).toBeNull();

  // The next load: an admin asked something.
  await act(async () => {
    qc.setQueryData(["title", "https://plexbie.example", "movie", bunny.id], { ...onPlex, yourTicket: { ...ticket, waiting: true } });
    await new Promise((r) => setTimeout(r, 0));       // the query tells the screen on its next tick
  });
  await fireEvent.press(screen.getByRole("button", { name: "An admin asked you something" }));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/ticket/[id]", params: { id: "0a1b2c3d4e5f" } });
});

test("an older bot (no onPlex) shows the page as before: no ticket, and Discord for what's missing", async () => {
  mockParams = { kind: "movie", id: bunny.id };
  mockTitle.mockResolvedValue(bunny as AppTitle);
  await show();
  expect(await screen.findByText("If something’s missing, say so in Discord.")).toBeTruthy();
  expect(openTicket()).toBeNull();
  expect(screen.queryByText("Watch on Plex opens it.")).toBeNull();
});

test("while the member's own request for it is on its way, its box is the way to help, not a ticket", async () => {
  mockTitle.mockResolvedValue({ ...pepper, onPlex: true } as AppTitle);
  await show();
  expect(await screen.findByRole("button", { name: "Open your request" })).toBeTruthy();
  expect(openTicket()).toBeNull();
});

test("a show with seasons on Plex has a ticket too, beside the seasons left to ask for", async () => {
  mockTitle.mockResolvedValue({ ...pepper, onPlex: true, yourRequest: { slot: 7, stage: "available" } } as AppTitle);
  await show();
  expect(await screen.findByRole("checkbox", { name: /^Season 2,/ })).toBeTruthy();
  await fireEvent.press(openTicket()!);
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/ticket/new", params: { kind: "tv", id: pepper.id, title: pepper.title } });
});

test("a book on the shelf points to a general ticket, where this Plexbie takes them", async () => {
  mockParams = { kind: "ebook", id: prideAndPrejudice.id };
  mockTitle.mockResolvedValue({ ...prideAndPrejudice, availability: "available" } as AppTitle);
  mockMyTickets.mockResolvedValue([]);
  await show();
  expect(await screen.findByText("Open Audiobookshelf and search for it. If something’s wrong with it, open a ticket under Need help? on Home.")).toBeTruthy();
  expect(openTicket()).toBeNull();
});

test("a book on an older bot's shelf still says Discord", async () => {
  mockParams = { kind: "ebook", id: prideAndPrejudice.id };
  mockTitle.mockResolvedValue({ ...prideAndPrejudice, availability: "available" } as AppTitle);
  mockMyTickets.mockRejectedValue(new ApiError(404, "The server said no (404)."));
  await show();
  expect(await screen.findByText("If something’s missing, say so in Discord.")).toBeTruthy();
  await waitFor(() => expect(mockMyTickets).toHaveBeenCalled());
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(screen.getByText("If something’s missing, say so in Discord.")).toBeTruthy();
});
