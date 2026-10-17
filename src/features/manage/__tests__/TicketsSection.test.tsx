// Manage → Tickets: each row says what its ticket is about, as the website does: its
// request's number, "Title" (headed by the film, with its year) or "General" (headed
// "General ticket"); an older bot's tickets are all on a request.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { titleTicket } from "../../../api/__fixtures__/bot";
import { AdminTicketsSchema } from "../../../api/schemas";
import { TicketsSection } from "../TicketsSection";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  initialWindowMetrics: { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } },
}));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));
jest.mock("../../me/useMe", () => ({ useMe: () => ({ data: { user: { name: "Alex" } } }) }));
const mockTickets = jest.fn<() => Promise<unknown>>();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ adminTickets: mockTickets }),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
  useServer: () => "https://plexbie.example",
}));

// Each poster as what it was given: an address, or none (a drawn cover). Poster.test covers the drawing.
jest.mock("../../../ui/Poster", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return { Poster: ({ title, poster }: { title: string; poster?: string | null }) => <Text testID="poster">{`${title}: ${poster ?? "drawn"}`}</Text> };
});

const now = new Date().toISOString();
// As an older bot sends it: no subject, so it's on a request.
const older = { id: "abc123abc123", requestKey: "7", slot: 7, title: "Pepper & Carrot", kind: "tv", seasons: [2], who: "Sam Rivers",
  reason: "Stuck downloading", status: "open", waiting: false, createdAt: now, updatedAt: now, count: 1 };
const general = { ...older, id: "123456abcdef", subject: "general", requestKey: null, slot: 0, title: "", kind: "", seasons: null,
  reason: "Can't get in, or nothing plays", who: "Jordan Lee" };

let qc: QueryClient;
beforeEach(() => {
  // Through the schema, as the client hands it over.
  mockTickets.mockImplementation(async () => AdminTicketsSchema.parse({
    rows: [older, { ...titleTicket, updatedAt: now }, general], counts: { action: 3, waiting: 0, solved: 0 },
  }));
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { qc.clear(); });

test("each row says what it's about: a request's number, Title or General", async () => {
  await render(<QueryClientProvider client={qc}><TicketsSection /></QueryClientProvider>);
  expect(await screen.findByText("General ticket")).toBeTruthy();
  expect(screen.getByText("No. 0007 · asked by Sam Rivers · just now")).toBeTruthy();
  expect(screen.getByText("Pepper & Carrot · S2")).toBeTruthy();
  expect(screen.getByText("Title · asked by pat · just now")).toBeTruthy();
  expect(screen.getByText("Sintel (2010)")).toBeTruthy();
  expect(screen.getByText("General · asked by Jordan Lee · just now")).toBeTruthy();
  expect(screen.getByLabelText(/^General ticket\. Can't get in, or nothing plays\. Needs an admin\./)).toBeTruthy();
});

test("a row about a request or a title carries the bot's poster, else a drawn cover; a general one none", async () => {
  mockTickets.mockImplementation(async () => AdminTicketsSchema.parse({
    rows: [{ ...older, poster: "/img/tmdb/w185/pepper.jpg" }, { ...titleTicket, updatedAt: now, poster: null }, general], counts: { action: 3, waiting: 0, solved: 0 },
  }));
  await render(<QueryClientProvider client={qc}><TicketsSection /></QueryClientProvider>);
  await screen.findByText("General ticket");
  expect(screen.getAllByTestId("poster").map((n) => n.props.children)).toEqual(["Pepper & Carrot: /img/tmdb/w185/pepper.jpg", "Sintel: drawn"]);
});

test("while the tickets load, rows of the same shape stand in", async () => {
  mockTickets.mockImplementation(() => new Promise(() => undefined));
  await render(<QueryClientProvider client={qc}><TicketsSection /></QueryClientProvider>);
  expect(screen.getByLabelText("Loading")).toBeTruthy();
  expect(screen.queryAllByTestId("placeholder", { includeHiddenElements: true })).toHaveLength(12);
});
