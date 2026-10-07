// Library: after a pick in Shelf, Sort or Genre, a screen reader hears how many titles
// are on show (the count above the grid). Opening the screen says nothing extra. Offline
// before a shelf has loaded, it says so instead of empty tiles.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text as MockText } from "react-native";
import { LibraryScreen } from "../LibraryScreen";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: () => undefined }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null, TAB_BAR_CLEARANCE: 0 }));
jest.mock("../../../ui/StatusBarScrim", () => ({ StatusBarScrim: () => null }));
jest.mock("../../home/useHome", () => ({ useStatus: () => ({ data: undefined }) }));
// Each dropdown as a button that makes one pick.
const mockPick: Record<string, string> = { Shelf: "tv", Sort: "az", Genre: "Comedy" };
jest.mock("../../../ui/PickerSheet", () => ({
  PickerPill: ({ title, onChange }: { title: string; onChange: (v: string) => void }) =>
    <MockText accessibilityRole="button" onPress={() => onChange(mockPick[title])}>{title}</MockText>,
}));

const item = (id: string, kind: string, title: string, genres: string[]) =>
  ({ id, kind, title, year: "2008", poster: null, availability: "available", genres, addedAt: "2026-10-01T00:00:00Z" });
const SHELF: Record<string, unknown[]> = {
  movie: [item("10378", "movie", "Big Buck Bunny", ["Comedy"]), item("45745", "movie", "Sintel", ["Drama"]), item("133701", "movie", "Tears of Steel", ["Drama"])],
  tv: [item("900102", "tv", "Pepper & Carrot", ["Comedy"]), item("900103", "tv", "Sprite Fright", ["Comedy"])],
};
const mockClient = { library: jest.fn(async (kind: string) => SHELF[kind]) };
jest.mock("../../../auth/session", () => ({
  useApi: () => mockClient,
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
let qc: QueryClient;
let said: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibility>;
beforeEach(() => {
  said = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { qc.clear(); said.mockRestore(); onlineManager.setOnline(true); });

test("each pick says how many titles are on show", async () => {
  await render(<QueryClientProvider client={qc}><LibraryScreen /></QueryClientProvider>);
  expect(await screen.findByText("3 titles")).toBeTruthy();
  expect(said).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole("button", { name: "Genre" }));
  expect(screen.getByText("1 title")).toBeTruthy();
  expect(said).toHaveBeenLastCalledWith("1 title");

  await fireEvent.press(screen.getByRole("button", { name: "Sort" }));
  expect(said).toHaveBeenCalledTimes(2);
  expect(said).toHaveBeenLastCalledWith("1 title");

  await fireEvent.press(screen.getByRole("button", { name: "Shelf" }));
  await settle();
  expect(screen.getByText("2 titles")).toBeTruthy();
  expect(said).toHaveBeenLastCalledWith("2 titles");
});

test("offline before a shelf has loaded, it says so instead of empty tiles", async () => {
  onlineManager.setOnline(false);
  await render(<QueryClientProvider client={qc}><LibraryScreen /></QueryClientProvider>);
  await settle();
  expect(screen.getByText("You’re offline.")).toBeTruthy();
  expect(screen.getByText("This loads when you’re back online.")).toBeTruthy();
});
