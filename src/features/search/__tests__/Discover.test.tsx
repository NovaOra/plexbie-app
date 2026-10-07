// The Request tab's Language dropdown: the pick is kept with their account. When the save
// fails, it says so (the dropdown goes back to what was saved), and when it failed because
// the sign-in has ended, the app signs out as it does for any other answer like that.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text as MockText } from "react-native";
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
  discover: jest.fn<() => Promise<never>>(),
  saveLanguages: jest.fn<(l: string[]) => Promise<{ languages: string[] }>>(),
};
jest.mock("../../../auth/session", () => ({
  useApi: () => mockClient,
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
let qc: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
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
