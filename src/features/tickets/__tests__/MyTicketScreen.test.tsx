// One of the member's own tickets: its heading says what it's about, then its reason and where
// it is, and the conversation. While it's open there's a box to add to it ("Your answer" when
// an admin asked something); a sent answer shows at once and the ticket stops waiting; a
// refusal says the bot's own words. Solved, it says how to go on. Not on the member's list:
// not theirs, or gone.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../../api/client";
import { myTickets } from "../../../api/__fixtures__/bot";
import type { Ack, AppMyTicket } from "../../../api/schemas";
import { MyTicketScreen } from "../MyTicketScreen";

let mockId = "";
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: mockId }),
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
const mockMyTickets = jest.fn<() => Promise<AppMyTicket[]>>();
const mockReply = jest.fn<(id: string, text: string) => Promise<Ack>>();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ myTickets: mockMyTickets, replyTicket: mockReply, myRequests: async () => [] }),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
  useServer: () => "https://plexbie.example",
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
const mockHaptic = jest.fn();
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, success: () => mockHaptic("success"), error: () => mockHaptic("error") }));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null, GlassFill: () => null, glass: { surface: {} } }));
jest.mock("../../../ui/StatusBarScrim", () => ({ StatusBarScrim: () => null }));
const mockToast = jest.fn();
jest.mock("../../../ui/Toast", () => ({ useToast: () => mockToast }));
const mockDraftGuard = jest.fn((_dirty: boolean) => () => undefined);
jest.mock("../../../ui/useDraftGuard", () => ({ useDraftGuard: (dirty: boolean) => mockDraftGuard(dirty) }));

const [film, request, general] = myTickets as AppMyTicket[];
let qc: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockId = film.id;
  mockMyTickets.mockResolvedValue(myTickets as AppMyTicket[]);
  // No clean-up timer for a mutation that's done: clearing the client leaves one running past the test.
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { gcTime: Infinity } } });
});
afterEach(() => { qc.clear(); });

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
/** The screen, once the member's list is in (`heading`, else whatever stands in for the ticket). */
const show = async (heading?: string) => {
  await render(<QueryClientProvider client={qc}><MyTicketScreen /></QueryClientProvider>);
  if (heading) await screen.findByRole("header", { name: heading });
  else await waitFor(() => expect(mockMyTickets).toHaveBeenCalled());
  await settle();
};

test("a ticket on a film an admin asked about: its heading, its reason, and an answer that shows at once", async () => {
  mockReply.mockResolvedValue({ ok: true, message: "Sent. The admins have it." });
  // Read back after it's sent, the bot has it too, and an admin is waiting no more.
  const answered = { ...film, waiting: false, thread: [...film.thread, { id: "e9", at: new Date().toISOString(), by: "You", kind: "member", text: "It does, it's only the TV." }] };
  mockMyTickets.mockResolvedValueOnce(myTickets as AppMyTicket[]).mockResolvedValue([answered, request, general]);
  await show("Your ticket on Sintel");
  expect(screen.getByText("Picture looks wrong")).toBeTruthy();
  expect(screen.getByText("An admin asked you something")).toBeTruthy();
  expect(screen.getByText("Does it look right on your phone?")).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText("Your answer"), "  It does, it's only the TV.  ");
  expect(mockDraftGuard).toHaveBeenLastCalledWith(true);
  await fireEvent.press(screen.getByRole("button", { name: "Send to the admins" }));
  await settle();
  expect(mockReply).toHaveBeenCalledWith(film.id, "It does, it's only the TV.");
  expect(mockHaptic).toHaveBeenCalledWith("success");
  expect(mockToast).toHaveBeenCalledWith({ text: "Sent to the admins", detail: "Sent. The admins have it." });
  // In the conversation straight away, and nobody's waiting on the member any more; read back, it stays.
  expect(screen.getByText("It does, it's only the TV.")).toBeTruthy();
  expect(screen.getByText("Open")).toBeTruthy();
  expect(screen.getByLabelText("Add to your ticket").props.value).toBe("");
  await waitFor(() => expect(mockMyTickets).toHaveBeenCalledTimes(2));
  await settle();
  expect(screen.getAllByText("It does, it's only the TV.")).toHaveLength(1);
});

test("one Plexbie opened on their request: its first message is Plexbie's, not theirs", async () => {
  mockId = request.id;
  const plexbies = { ...request, byPlexbie: true, thread: [
    { id: "p1", at: "2026-10-04T20:00:00Z", by: "Plexbie", kind: "member", plexbie: true, text: "Season 2 finished downloading, but Sonarr won’t import it by itself. An admin will check it." },
    { id: "p2", at: "2026-10-04T21:00:00Z", by: "You", kind: "member", text: "Thanks!" },
  ] };
  mockMyTickets.mockResolvedValue([film, plexbies, general]);
  await show("Your ticket on Pepper & Carrot");
  expect(screen.getByText("Plexbie")).toBeTruthy();
  expect(screen.getByText("Season 2 finished downloading, but Sonarr won’t import it by itself. An admin will check it.")).toBeTruthy();
  expect(screen.getAllByText("You")).toHaveLength(1);
  expect(screen.getByLabelText(/^Plexbie, .*: Season 2 finished downloading/)).toBeTruthy();
});

test("open and not waiting: the member can still add to it", async () => {
  mockId = request.id;
  await show("Your ticket on Pepper & Carrot");
  // A request's ticket has its number in the eyebrow, as its card does, and its title in the heading.
  expect(screen.getByText("No. 0007 · Ticket")).toBeTruthy();
  expect(screen.getByText("Wrong or missing episodes")).toBeTruthy();
  expect(screen.getByText("The admins have it. You’ll hear back here, and by Discord or an alert.")).toBeTruthy();
  expect(screen.getByLabelText("Add to your ticket")).toBeTruthy();
  expect(screen.queryByLabelText("Your answer")).toBeNull();
});

test("a general ticket, solved: no box, and how to go on", async () => {
  mockId = general.id;
  await show("Your ticket");
  expect(screen.getByText("Solved")).toBeTruthy();
  expect(screen.getByText("Solved. If it’s still wrong, open a new ticket.")).toBeTruthy();
  expect(screen.queryByLabelText("Add to your ticket")).toBeNull();
  expect(mockDraftGuard).toHaveBeenLastCalledWith(false);
});

test("a refusal shows the bot's own words, with the error buzz, and the answer stays to send again", async () => {
  mockReply.mockRejectedValue(new ApiError(409, "This ticket is closed. Open a new one if it’s still wrong."));
  await show("Your ticket on Sintel");
  await fireEvent.changeText(screen.getByLabelText("Your answer"), "Still grey.");
  await fireEvent.press(screen.getByRole("button", { name: "Send to the admins" }));
  await settle();
  expect(screen.getByRole("alert").props.children).toBe("This ticket is closed. Open a new one if it’s still wrong.");
  expect(mockHaptic).toHaveBeenCalledWith("error");
  expect(screen.getByLabelText("Your answer").props.value).toBe("Still grey.");
  // Closed meanwhile: the list is asked again.
  await waitFor(() => expect(mockMyTickets).toHaveBeenCalledTimes(2));
});

test("a ticket that isn't on the member's list: not theirs, or gone, with nothing to try again", async () => {
  mockId = "ffffffffffff";
  await show();
  expect((await screen.findByRole("alert")).props.children).toBe("That ticket isn’t yours, or it’s gone.");
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});

test("a list from before the ticket was opened is asked again before it says the ticket isn't theirs", async () => {
  qc.setQueryData(["myTickets", "https://plexbie.example"], [request]);
  await qc.invalidateQueries({ queryKey: ["myTickets"] });
  await render(<QueryClientProvider client={qc}><MyTicketScreen /></QueryClientProvider>);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(await screen.findByRole("header", { name: "Your ticket on Sintel" })).toBeTruthy();
});
