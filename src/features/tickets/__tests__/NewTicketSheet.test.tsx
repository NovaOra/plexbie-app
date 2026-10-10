// A new ticket: about a film or show (its own reasons, missing episodes for a show only) or
// general (its two). Something else needs a note. Once it's in, the member's list has it
// and the ticket opens in the sheet's place; a refusal says the bot's own words, and an
// older Plexbie says it can't take tickets yet.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ApiError, type NewTicket } from "../../../api/client";
import { myTickets } from "../../../api/__fixtures__/bot";
import type { AppMyTicket } from "../../../api/schemas";
import { NewTicketSheet } from "../NewTicketSheet";

let mockParams: Record<string, string> = {};
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  router: { replace: (...to: unknown[]) => mockReplace(...to), back: () => mockBack() },
}));
const mockOpen = jest.fn<(body: NewTicket) => Promise<unknown>>();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ openTicket: mockOpen }),
  useServer: () => "https://plexbie.example",
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
const mockHaptic = jest.fn();
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, reward: () => mockHaptic("reward"), error: () => mockHaptic("error") }));
const mockToast = jest.fn();
jest.mock("../../../ui/Toast", () => ({ useToast: () => mockToast }));
// No navigator here; asking before a typed note is lost has tests of its own.
const mockDraftGuard = jest.fn((_dirty: boolean) => () => undefined);
jest.mock("../../../ui/useDraftGuard", () => ({ useDraftGuard: (dirty: boolean) => mockDraftGuard(dirty) }));

const answer = (ticket: AppMyTicket) => ({ ok: true, message: "Sent. An admin will take a look and get back to you.", help: { id: ticket.id, reason: ticket.reason }, ticket });

let qc: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { kind: "movie", id: "900104", title: "Sintel" };
  // No clean-up timer for a mutation that's done: clearing the client leaves one running past the test.
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { gcTime: Infinity } } });
});
afterEach(() => { qc.clear(); });

const show = () => render(<QueryClientProvider client={qc}><NewTicketSheet /></QueryClientProvider>);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const reasons = () => screen.getAllByRole("radio").map((r) => r.props.accessibilityLabel as string);

test("a film: its reasons with a line under each, and once it's in, the member's list has it and it opens", async () => {
  const sent = myTickets[0] as AppMyTicket;
  mockOpen.mockResolvedValue(answer(sent));
  await show();
  expect(screen.getByRole("header", { name: "What’s wrong with Sintel?" })).toBeTruthy();
  expect(reasons()).toEqual(["Won’t play on Plex", "Picture looks wrong", "Sound or subtitles", "Wrong film or episode", "Something else"]);
  expect(screen.getByRole("radio", { name: "Picture looks wrong" }).props.accessibilityHint).toBe("Washed out, wrong colours, or blurry");
  expect(screen.getByRole("button", { name: "Pick what’s wrong" }).props.accessibilityState?.disabled).toBe(true);

  await fireEvent.press(screen.getByRole("radio", { name: "Picture looks wrong" }));
  expect(screen.getByText("(optional)")).toBeTruthy();
  await fireEvent.changeText(screen.getByPlaceholderText("It looks grey and washed out on my TV"), "  Grey on the TV  ");
  expect(mockDraftGuard).toHaveBeenLastCalledWith(true);
  await fireEvent.press(screen.getByRole("button", { name: "Send to the admins" }));
  await settle();

  expect(mockOpen).toHaveBeenCalledWith({ kind: "movie", id: "900104", reason: "picture", note: "Grey on the TV" });
  expect(mockHaptic).toHaveBeenCalledWith("reward");
  expect(qc.getQueryData<AppMyTicket[]>(["myTickets", "https://plexbie.example"])?.map((t) => t.id)).toEqual([sent.id]);
  expect(mockToast).toHaveBeenCalledWith({ text: "Sent to the admins", detail: "Sent. An admin will take a look and get back to you." });
  expect(mockReplace).toHaveBeenCalledWith({ pathname: "/ticket/[id]", params: { id: sent.id } });
});

test("a sheet swiped away while it's sending opens nothing in its place, and the ticket is still on the list", async () => {
  const sent = myTickets[0] as AppMyTicket;
  let answerNow!: (out: unknown) => void;
  mockOpen.mockReturnValue(new Promise((ok) => { answerNow = ok; }));
  const view = await show();
  await fireEvent.press(screen.getByRole("radio", { name: "Picture looks wrong" }));
  await fireEvent.press(screen.getByRole("button", { name: "Send to the admins" }));
  await view.unmount();
  await act(async () => { answerNow(answer(sent)); await new Promise((r) => setTimeout(r, 0)); });
  expect(mockReplace).not.toHaveBeenCalled();
  expect(qc.getQueryData<AppMyTicket[]>(["myTickets", "https://plexbie.example"])?.map((t) => t.id)).toEqual([sent.id]);
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ text: "Sent to the admins" }));
});

test("a show can be missing episodes", async () => {
  mockParams = { kind: "tv", id: "900102", title: "Pepper & Carrot" };
  await show();
  expect(reasons()).toContain("Missing episodes");
});

test("a general ticket has its own two reasons, and names no title", async () => {
  mockParams = {};
  const sent = myTickets[2] as AppMyTicket;
  mockOpen.mockResolvedValue(answer(sent));
  await show();
  expect(screen.getByRole("header", { name: "What do you need help with?" })).toBeTruthy();
  expect(reasons()).toEqual(["Can’t get in, or nothing plays", "Something else"]);
  await fireEvent.press(screen.getByRole("radio", { name: "Can’t get in, or nothing plays" }));
  await fireEvent.press(screen.getByRole("button", { name: "Send to the admins" }));
  await settle();
  expect(mockOpen).toHaveBeenCalledWith({ reason: "access", note: "" });
  expect(mockReplace).toHaveBeenCalledWith({ pathname: "/ticket/[id]", params: { id: sent.id } });
});

test("Something else needs a note, and nothing is sent without one", async () => {
  await show();
  await fireEvent.press(screen.getByRole("radio", { name: "Something else" }));
  expect(screen.getByText("(needed)")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Send to the admins" }));
  expect(screen.getByRole("alert").props.children).toBe("Say a little about what’s wrong.");
  expect(mockOpen).not.toHaveBeenCalled();
});

test("a refusal shows the bot's own words, with the error buzz, and the sheet stays", async () => {
  mockOpen.mockRejectedValue(new ApiError(409, "You already have a ticket open on this. Add to it there."));
  await show();
  await fireEvent.press(screen.getByRole("radio", { name: "Won’t play on Plex" }));
  await fireEvent.press(screen.getByRole("button", { name: "Send to the admins" }));
  await settle();
  expect(screen.getByRole("alert").props.children).toBe("You already have a ticket open on this. Add to it there.");
  expect(mockHaptic).toHaveBeenCalledWith("error");
  expect(mockReplace).not.toHaveBeenCalled();
});

test("an older Plexbie (404, or 405 from its catch-all) says it can't take tickets yet", async () => {
  for (const status of [404, 405]) {
    mockOpen.mockRejectedValueOnce(new ApiError(status, `The server said no (${status}).`));
    const view = await show();
    await fireEvent.press(screen.getByRole("radio", { name: "Won’t play on Plex" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send to the admins" }));
    await settle();
    expect(screen.getByRole("alert").props.children).toBe("This Plexbie is older and can’t take tickets here yet. Ask an admin to update it.");
    await view.unmount();
  }
});

test("a link that names something else can't take a ticket", async () => {
  mockParams = { kind: "song", id: "1" };
  await show();
  expect(screen.getByText("This can’t take a ticket.")).toBeTruthy();
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(mockBack).toHaveBeenCalled();
});
