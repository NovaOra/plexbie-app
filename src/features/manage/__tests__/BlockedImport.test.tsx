// Manage → Health, a blocked download: an import that got no answer may still be running in
// Sonarr or Radarr, so Import stays off for as long as the app would have waited, even after
// leaving and coming back; a plain refusal leaves it on.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ApiError } from "../../../api/client";
import type { Ack } from "../../../api/schemas";
import type { BlockedChoice } from "../../../api/types";
import { BlockedImport } from "../BlockedImport";

const mockPreview = jest.fn<(app: string, downloadId: string) => Promise<unknown>>();
const mockImport = jest.fn<(app: string, downloadId: string, files?: BlockedChoice[]) => Promise<Ack>>();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ blockedPreview: mockPreview, blockedImport: mockImport, arrLibrary: jest.fn(), arrEpisodes: jest.fn() }),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));
// The hold itself is HoldButton's business; here a press is a finished hold.
jest.mock("../../../ui/HoldButton", () => {
  const { Pressable, Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    HoldButton: ({ label, disabled, onConfirm }: { label: string; disabled?: boolean; onConfirm: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
        onPress={() => { if (!disabled) onConfirm(); }}><Text>{label}</Text></Pressable>
    ),
  };
});
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("../../../ui/Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));
jest.mock("../../../ui/PickerSheet", () => ({ PickerPill: () => null }));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../../../ui/Toast", () => ({ useToast: () => () => undefined }));

const preview = (downloadId: string) => ({
  app: "radarr", downloadId, title: "Big Buck Bunny", folder: "/downloads/bbb", messages: ["Not a match"], warnings: [],
  files: [{ name: "bbb.mkv", size: 2 ** 30, as: [], qualityId: 1, languages: [], releaseGroup: "", rejections: [], notes: [],
    episodes: [], movie: { id: 7, title: "Big Buck Bunny", year: 2008 }, ready: true }],
  others: [], ok: true, options: { qualities: [{ id: 1, name: "1080p" }], languages: [] },
});
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let qc: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockPreview.mockImplementation((_app, id) => Promise.resolve(preview(id)));
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => { await new Promise((r) => setTimeout(r, 1600)); });
  qc.clear();
});

const show = async (downloadId: string) => {
  const view = await render(<QueryClientProvider client={qc}><BlockedImport target={{ app: "radarr", downloadId }} /></QueryClientProvider>);
  await settle();
  return view;
};
const importOff = () => screen.getByRole("button", { name: "Import it" }).props.accessibilityState.disabled;

test("an import that got no answer keeps Import off, even after coming back, until it could have finished", async () => {
  mockImport.mockRejectedValue(new ApiError(504, "The server said no (504).", "http"));
  let view = await show("d1");
  await fireEvent.press(screen.getByRole("button", { name: "Import it" }));
  await settle();
  expect(mockPreview).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/May still be importing/)).toBeTruthy();
  expect(importOff()).toBe(true);

  await view.unmount();
  qc.clear();
  view = await show("d1");
  expect(importOff()).toBe(true);

  await view.unmount();
  qc.clear();
  const later = Date.now() + 151_000;
  jest.spyOn(Date, "now").mockReturnValue(later);
  await show("d1");
  await settle();
  expect(screen.queryByText(/May still be importing/)).toBeNull();
  expect(importOff()).toBe(false);
  expect(mockImport).toHaveBeenCalledTimes(1);
});

test("a refusal leaves Import on, to sort out and try again", async () => {
  mockImport.mockRejectedValue(new ApiError(409, "Radarr said no.", "http"));
  await show("d2");
  await fireEvent.press(screen.getByRole("button", { name: "Import it" }));
  await settle();
  expect(screen.queryByText(/May still be importing/)).toBeNull();
  expect(importOff()).toBe(false);
});
