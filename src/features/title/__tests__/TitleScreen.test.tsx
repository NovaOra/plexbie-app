// The title page: a first load that fails shows the error with a way to try again, a
// background refetch that fails later keeps the loaded page, with the seasons ticked so far,
// and the same screen showing another title starts that title's request form afresh.
// Offline before the title has loaded, it says so.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { pepper } from "../../../api/__fixtures__/bot";
import type { AppTitle } from "../../../api/schemas";
import { TitleScreen } from "../TitleScreen";

let mockParams = { kind: "tv", id: "900102" };          // Pepper & Carrot
const mockTitle = jest.fn<(kind: string, id: string, signal?: AbortSignal) => Promise<AppTitle>>();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ title: mockTitle }),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
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
