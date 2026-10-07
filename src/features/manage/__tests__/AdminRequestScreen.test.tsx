// One request on Manage → All requests: a ticket opened while a search is on its way
// leaves that search's button showing it's still searching.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AdminRequestDetailSchema, type Ack, type AppAdminRequestDetail } from "../../../api/schemas";
import { AdminRequestScreen } from "../AdminRequestScreen";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ key: "5001" }),
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
jest.mock("../../request/StageBox", () => ({ StageBox: () => null, SeasonsBox: () => null }));
jest.mock("../../../ui/useDraftGuard", () => ({ useDraftGuard: () => () => undefined }));
const mockToast = jest.fn();
jest.mock("../../../ui/Toast", () => ({ useToast: () => mockToast }));

const mockClient = {
  adminRequest: jest.fn<() => Promise<AppAdminRequestDetail>>(),
  requestSearch: jest.fn<() => Promise<Ack>>(),
  requestTicket: jest.fn<() => Promise<Ack>>(),
};
jest.mock("../../../auth/session", () => ({
  useApi: () => mockClient,
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));

const now = new Date().toISOString();
const request = AdminRequestDetailSchema.parse({
  id: "5001", slot: 12, title: { id: "10378", kind: "movie", title: "Big Buck Bunny", poster: null }, stage: "searching",
  requestedAt: now, updatedAt: now, requester: "Sam Rivers", via: "Discord", tickets: [], activity: [],
});
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let qc: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.adminRequest.mockResolvedValue(request);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 1600)); });
  qc.clear();
});

test("a ticket opened during a search leaves the spinner on that search", async () => {
  const searching = deferred<Ack>();
  const opening = deferred<Ack>();
  mockClient.requestSearch.mockReturnValue(searching.promise);
  mockClient.requestTicket.mockReturnValue(opening.promise);
  await render(<QueryClientProvider client={qc}><AdminRequestScreen /></QueryClientProvider>);
  await screen.findByText("Big Buck Bunny");

  await fireEvent.press(screen.getByRole("button", { name: "Search again" }));
  await settle();
  await fireEvent.press(screen.getByRole("button", { name: "Open a ticket" }));
  await fireEvent.changeText(screen.getByLabelText("What’s wrong, or what you’ve found"), "Nothing on the indexer");
  await fireEvent.press(screen.getByRole("button", { name: "Open the ticket" }));
  await settle();
  expect(screen.getByRole("button", { name: "Opening…" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Searching…" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Search by name" }).props.accessibilityState?.disabled).toBe(true);

  await act(async () => { opening.resolve({ ok: true, message: "Opened" } as Ack); });
  await settle();
  expect(screen.getByRole("button", { name: "Searching…" })).toBeTruthy();
  await act(async () => { searching.resolve({ ok: true, message: "Searching" } as Ack); });
  await settle();
  expect(screen.getByRole("button", { name: "Search again" }).props.accessibilityState?.disabled).toBe(false);
});
