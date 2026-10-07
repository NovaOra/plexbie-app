// The title page: a first load that fails shows the error with a way to try again, and a
// background refetch that fails later keeps the loaded page, with the seasons ticked so far.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { pepper } from "../../../api/__fixtures__/bot";
import type { AppTitle } from "../../../api/schemas";
import { TitleScreen } from "../TitleScreen";

const mockTitle = jest.fn<(kind: string, id: string, signal?: AbortSignal) => Promise<AppTitle>>();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ title: mockTitle }),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ kind: "tv", id: "900102" }),          // Pepper & Carrot
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
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => qc.clear());

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
