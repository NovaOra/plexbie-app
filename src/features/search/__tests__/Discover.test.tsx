// The Request tab's Language dropdown: the pick is kept with their account. When the save
// fails, it says so (the dropdown goes back to what was saved), and when it failed because
// the sign-in has ended, the app signs out as it does for any other answer like that.
// A shelf's More: a page that fails leaves the button for another go, and a screen reader
// hears how many titles a page added, and how many a search found (of the Type picked). A page
// still loading when a search replaces the shelves says nothing at all.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text as MockText } from "react-native";
import { ApiError } from "../../../api/client";
import { whenSignedOut } from "../../../api/query";
import { RequestBody } from "../Discover";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
const mockToast = jest.fn();
jest.mock("../../../ui/Toast", () => ({ useToast: () => mockToast }));
// Each dropdown as a button that picks French.
jest.mock("../../../ui/PickerSheet", () => ({
  PickerPill: ({ title, onChange }: { title: string; onChange: (v: string[]) => void }) =>
    <MockText accessibilityRole="button" onPress={() => onChange(["fr"])}>{title}</MockText>,
}));

const mockClient = {
  prefs: jest.fn<() => Promise<{ languages: string[]; languageOptions: { code: string; name: string }[] }>>(),
  discover: jest.fn<(kind: string) => Promise<unknown>>(),
  shelf: jest.fn<(kind: string, key: string, page: number, signal?: AbortSignal) => Promise<unknown>>(),
  searchAll: jest.fn<(q: string) => Promise<unknown>>(),
  saveLanguages: jest.fn<(l: string[]) => Promise<{ languages: string[] }>>(),
};
jest.mock("../../../auth/session", () => ({
  useApi: () => mockClient,
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
let qc: QueryClient;
let said: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibility>;
beforeEach(() => {
  jest.clearAllMocks();
  said = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  mockClient.prefs.mockResolvedValue({ languages: [], languageOptions: [{ code: "fr", name: "French" }] });
  mockClient.discover.mockReturnValue(new Promise<never>(() => undefined));
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { qc.clear(); whenSignedOut(() => undefined); });

const pickFrench = async () => {
  await render(<QueryClientProvider client={qc}><RequestBody q="" type="movie" setType={() => undefined} /></QueryClientProvider>);
  await fireEvent.press(await screen.findByRole("button", { name: "Language" }));
  await settle();
};

test("a language save that fails says so", async () => {
  mockClient.saveLanguages.mockRejectedValue(new ApiError(0, "Couldn’t reach the server.", "network"));
  await pickFrench();
  expect(mockClient.saveLanguages).toHaveBeenCalledWith(["fr"]);
  expect(mockToast).toHaveBeenCalledWith({ tone: "error", text: "Couldn’t save languages", detail: "Couldn’t reach the server." });
});

test("a language save refused because the sign-in has ended signs out", async () => {
  const ended = jest.fn();
  whenSignedOut(ended);
  mockClient.saveLanguages.mockRejectedValue(new ApiError(401, "Sign in again.", "http"));
  await pickFrench();
  expect(ended).toHaveBeenCalledTimes(1);
});

test("a language save that goes through says nothing", async () => {
  mockClient.saveLanguages.mockResolvedValue({ languages: ["fr"] });
  await pickFrench();
  expect(mockToast).not.toHaveBeenCalled();
});

const film = (id: string, title: string) => ({ id, kind: "movie", title, year: "2008", poster: null, availability: "none" });

const browseTrending = async () => {
  mockClient.discover.mockResolvedValue({ genres: [], shelves: [{ key: "trending", titles: [film("10378", "Big Buck Bunny")], more: true }] });
  await render(<QueryClientProvider client={qc}><RequestBody q="" type="movie" setType={() => undefined} /></QueryClientProvider>);
  return screen.findByRole("button", { name: "More trending films" });
};

test("a More that fails keeps the button for another go, and says so", async () => {
  mockClient.shelf.mockRejectedValue(new ApiError(0, "Couldn’t reach the server.", "network"));
  await fireEvent.press(await browseTrending());
  await settle();
  expect(mockClient.shelf).toHaveBeenCalledWith("movie", "trending", 2, expect.any(AbortSignal));
  expect(mockToast).toHaveBeenCalledWith({ tone: "error", text: "Couldn’t load more just now", detail: "Couldn’t reach the server." });
  expect(screen.getByRole("button", { name: "More trending films" })).toBeTruthy();
});

test("a More that loads says how many titles it added, and is busy meanwhile", async () => {
  let answer: (v: unknown) => void = () => undefined;
  mockClient.shelf.mockReturnValue(new Promise((r) => { answer = r; }));
  await fireEvent.press(await browseTrending());
  expect(screen.getByRole("button", { name: "More trending films" }).props.accessibilityState).toMatchObject({ busy: true });
  await act(async () => {
    answer({ titles: [film("10378", "Big Buck Bunny"), film("45745", "Sintel"), film("133701", "Tears of Steel")], page: 2, more: true });
  });
  expect(screen.getByText("Sintel")).toBeTruthy();
  expect(said).toHaveBeenCalledWith("2 more trending films");
  expect(screen.getByRole("button", { name: "More trending films" }).props.accessibilityState).toMatchObject({ busy: false });
});

test("a search says how many titles it found, or that nothing matched", async () => {
  mockClient.searchAll.mockImplementation(async (q) => q === "sintel"
    ? { movie: [film("45745", "Sintel")], tv: [], book: [] }
    : { movie: [], tv: [], book: [] });
  const page = (q: string) => <QueryClientProvider client={qc}><RequestBody q={q} type="all" setType={() => undefined} /></QueryClientProvider>;
  const view = await render(page("sintel"));
  await settle();
  expect(said).toHaveBeenCalledWith("1 result for “sintel”");
  await view.rerender(page("zzzz"));
  await settle();
  expect(said).toHaveBeenCalledWith("Nothing matched “zzzz”");
});

test("a More still loading when a search replaces the shelves says nothing", async () => {
  let signal: AbortSignal | undefined;
  mockClient.shelf.mockImplementation((_k, _key, _p, sig) => new Promise((_ok, fail) => {
    signal = sig;
    sig?.addEventListener("abort", () => fail(new ApiError(0, "Cancelled.", "network")));
  }));
  mockClient.searchAll.mockReturnValue(new Promise<never>(() => undefined));
  await fireEvent.press(await browseTrending());
  await screen.rerender(<QueryClientProvider client={qc}><RequestBody q="sintel" type="movie" setType={() => undefined} /></QueryClientProvider>);
  await settle();
  expect(signal?.aborted).toBe(true);
  expect(mockToast).not.toHaveBeenCalled();
  expect(said).not.toHaveBeenCalled();
});

test("a search under a Type says how many of that type, and a new Type is read out", async () => {
  mockClient.searchAll.mockResolvedValue({ movie: [film("45745", "Sintel"), film("10378", "Big Buck Bunny")],
    tv: [{ ...film("1", "Elephants Dream"), kind: "tv" }, { ...film("2", "Spring"), kind: "tv" }], book: [] });
  const page = (type: "movie" | "tv" | "book") => <QueryClientProvider client={qc}><RequestBody q="b" type={type} setType={() => undefined} /></QueryClientProvider>;
  const view = await render(page("movie"));
  await settle();
  expect(said).toHaveBeenLastCalledWith("2 films for “b”");
  await view.rerender(page("tv"));
  await settle();
  expect(said).toHaveBeenLastCalledWith("2 shows for “b”");
  await view.rerender(page("book"));
  await settle();
  expect(said).toHaveBeenLastCalledWith("Nothing matched “b” in books");
});
