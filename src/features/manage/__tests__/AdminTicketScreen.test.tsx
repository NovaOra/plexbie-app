// One ticket on Manage → Tickets: "Take it" and "Let it go" are the same button, and the
// bot flips whatever the ticket is, so the button waits until it knows whether the ticket
// is yours. While solving it, a search that's on its way holds "Solve it" back.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { Ack, AppAdminTicketDetail } from "../../../api/schemas";
import { AdminTicketScreen } from "../AdminTicketScreen";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "abc123abc123" }),
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
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
  id: "abc123abc123", requestKey: null, slot: 3, title: "Big Buck Bunny", kind: "movie", seasons: null, who: "Sam Rivers",
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

const show = async () => {
  await render(<QueryClientProvider client={qc}><AdminTicketScreen /></QueryClientProvider>);
  await screen.findByText("Big Buck Bunny");
};
const disabled = (name: string) => !!screen.getByRole("button", { name }).props.accessibilityState?.disabled;

test("yours: Let it go", async () => {
  await show();
  expect(disabled("Let it go")).toBe(false);
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
