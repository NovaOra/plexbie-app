// Need help? on Home: the member's own tickets, each saying what it's about, its reason and
// where it is, opening it when tapped, and a general ticket to open; none of it on a Plexbie
// from before members had tickets of their own (404), and a list that couldn't load says so.
// A ticket about a film, show or request carries its poster (its request's, when the bot
// sends none with the ticket), or a drawn cover; a general one has no picture.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../../api/client";
import { myTickets } from "../../../api/__fixtures__/bot";
import type { AppMyTicket } from "../../../api/schemas";
import { NeedHelp } from "../NeedHelp";

const mockMyTickets = jest.fn<() => Promise<AppMyTicket[]>>();
const mockPush = jest.fn();
const mockMyRequests = jest.fn<() => Promise<unknown[]>>(async () => []);
// Each poster as what it was given: an address, or none (a drawn cover). Poster.test covers the drawing.
jest.mock("../../../ui/Poster", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return { Poster: ({ title, poster }: { title: string; poster?: string | null }) => <Text testID="poster">{`${title}: ${poster ?? "drawn"}`}</Text> };
});
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ myTickets: mockMyTickets, myRequests: mockMyRequests }),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
  useServer: () => "https://plexbie.example",
}));
jest.mock("expo-router", () => ({ router: { push: (...to: unknown[]) => mockPush(...to) } }));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));

let qc: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockMyRequests.mockImplementation(async () => []);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { qc.clear(); });

const show = () => render(<QueryClientProvider client={qc}><NeedHelp /></QueryClientProvider>);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

test("the member's tickets: what each is about, its reason and where it is, and each opens itself", async () => {
  mockMyTickets.mockResolvedValue(myTickets as AppMyTicket[]);
  await show();
  expect(await screen.findByRole("header", { name: "Need help?" })).toBeTruthy();
  expect(screen.getByText("Something wrong with Plex, or with something you didn’t request? Tell the admins.")).toBeTruthy();
  expect(screen.getByRole("header", { name: "Your tickets" })).toBeTruthy();
  const rows = screen.getAllByHintText("Opens your ticket").map((r) => r.props.accessibilityLabel as string);
  expect(rows.map((label) => label.replace(/, updated .*$/, ""))).toEqual([
    "Sintel (2010). Picture looks wrong. An admin asked you something",
    "No. 0007 · Pepper & Carrot. Wrong or missing episodes. Open",
    "General. Can't get in, or nothing plays. Solved",
  ]);
  await fireEvent.press(screen.getByLabelText(rows[2]));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/ticket/[id]", params: { id: "123456abcdef" } });
  await fireEvent.press(screen.getByRole("button", { name: "Open a ticket" }));
  expect(mockPush).toHaveBeenLastCalledWith("/ticket/new");
});

test("no tickets yet: the card and its button, and no list", async () => {
  mockMyTickets.mockResolvedValue([]);
  await show();
  expect(await screen.findByRole("button", { name: "Open a ticket" })).toBeTruthy();
  expect(screen.queryByRole("header", { name: "Your tickets" })).toBeNull();
});

test("a Plexbie from before members' own tickets (404) shows no card at all, and no error", async () => {
  mockMyTickets.mockRejectedValue(new ApiError(404, "The server said no (404)."));
  await show();
  await waitFor(() => expect(qc.getQueryState(["myTickets", "https://plexbie.example"])?.status).toBe("error"));
  await settle();
  expect(screen.queryByText("Need help?")).toBeNull();
  expect(screen.queryByRole("button", { name: "Open a ticket" })).toBeNull();
  expect(screen.queryByText(/Couldn’t load/)).toBeNull();
});

test("until the first answer there's no card; a list that couldn't load says so, with Try again", async () => {
  let fail!: (e: Error) => void;
  mockMyTickets.mockReturnValueOnce(new Promise((_ok, no) => { fail = no; }));
  await show();
  await settle();
  expect(screen.queryByText("Need help?")).toBeNull();

  await act(async () => { fail(new ApiError(0, "Couldn't reach the server.", "network")); });
  expect(await screen.findByText("Couldn’t load your tickets. They’re still there.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Open a ticket" })).toBeTruthy();
  mockMyTickets.mockResolvedValue([]);
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByText("Couldn’t load your tickets. They’re still there.")).toBeNull());
  expect(mockMyTickets).toHaveBeenCalledTimes(2);
});

test("a ticket shows the poster the bot sends with it; a general one none", async () => {
  mockMyTickets.mockResolvedValue(myTickets as AppMyTicket[]);
  mockMyRequests.mockResolvedValue([{ slot: 7, title: { id: "1", kind: "tv", title: "Pepper & Carrot", poster: "https://media.plexbie.com/posters/pepper.jpg" } }]);
  await show();
  await screen.findByRole("header", { name: "Your tickets" });
  await waitFor(() => expect(mockMyRequests).toHaveBeenCalled());
  await settle();
  // The bot's own poster wins over the request's.
  expect(screen.getAllByTestId("poster").map((n) => n.props.children)).toEqual([
    "Sintel: /img/tmdb/w185/sintel.jpg?v=2", "Pepper & Carrot: /img/tmdb/w185/pepper.jpg?v=2",
  ]);
});

test("from a bot that sends no posters, a request ticket carries its request's; a title one a drawn cover; a general one none", async () => {
  mockMyTickets.mockResolvedValue(myTickets.map(({ poster: _, ...t }) => t) as AppMyTicket[]);
  mockMyRequests.mockResolvedValue([{ slot: 7, title: { id: "1", kind: "tv", title: "Pepper & Carrot", poster: "https://media.plexbie.com/posters/pepper.jpg" } }]);
  await show();
  await screen.findByRole("header", { name: "Your tickets" });
  await waitFor(() => expect(mockMyRequests).toHaveBeenCalled());
  await settle();
  // Sintel has no poster from the bot: its cover is drawn. General has no picture at all.
  expect(screen.getAllByTestId("poster").map((n) => n.props.children)).toEqual([
    "Sintel: drawn", "Pepper & Carrot: https://media.plexbie.com/posters/pepper.jpg",
  ]);
});
