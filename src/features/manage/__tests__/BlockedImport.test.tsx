// Manage → Health, a blocked download: an import that got no answer may still be running in
// Sonarr or Radarr, so Import stays off for as long as the app would have waited, even after
// leaving and coming back; a plain refusal leaves it on, and looks inside again from scratch.
// Another show's episodes load before they can be picked (a slower answer for an earlier pick
// is dropped, a failure says so), two files can't be one film, and a look inside, the list or
// a search that fails says so with Try again.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ApiError } from "../../../api/client";
import type { Ack, AppArrEpisode, AppArrItem } from "../../../api/schemas";
import type { BlockedChoice } from "../../../api/types";
import { BlockedImport, BlockedList } from "../BlockedImport";

const mockPreview = jest.fn<(app: string, downloadId: string) => Promise<unknown>>();
const mockImport = jest.fn<(app: string, downloadId: string, files?: BlockedChoice[]) => Promise<Ack>>();
const mockLibrary = jest.fn<(app: string, q: string) => Promise<{ rows: AppArrItem[] }>>();
const mockEpisodes = jest.fn<(seriesId: number) => Promise<{ rows: AppArrEpisode[] }>>();
const mockBlocked = jest.fn<() => Promise<unknown>>();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ blockedPreview: mockPreview, blockedImport: mockImport, arrLibrary: mockLibrary, arrEpisodes: mockEpisodes,
    adminBlocked: mockBlocked }),
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
// Each option is a button ("Which episode → S01E02 · …"); picking one sets just that one.
jest.mock("../../../ui/PickerSheet", () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PickerPill: ({ title, label, options, multiple, onChange }: { title: string; label: string; options: { value: string; label: string }[];
      multiple?: boolean; onChange: (next: string | string[]) => void }) => (
      <View>
        <Text>{title}: {label}</Text>
        {options.map((o) => (
          <Pressable key={o.value} accessibilityRole="button" accessibilityLabel={`${title} → ${o.label}`}
            onPress={() => onChange(multiple ? [o.value] : o.value)}><Text>{o.label}</Text></Pressable>
        ))}
      </View>
    ),
  };
});
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

const ep = (id: number, label: string): AppArrEpisode => ({ id, label, season: 1, episode: id % 100, title: `Episode ${id}`, hasFile: false });
const showPreview = (downloadId: string) => ({
  app: "sonarr", downloadId, title: "Open Show", folder: "/downloads/show", messages: [], warnings: [],
  files: [{ name: "show.s01e01.mkv", size: 2 ** 30, as: [], qualityId: 1, languages: [], releaseGroup: "", rejections: [], notes: [],
    episodes: [ep(1, "S01E01")], movie: null, ready: true }],
  others: [], ok: true, series: { id: 10, title: "Open Show", year: 2020 },
  options: { qualities: [{ id: 1, name: "1080p" }], languages: [], episodes: [ep(1, "S01E01")] },
});
const showTv = async (downloadId: string) => {
  mockPreview.mockImplementation((_app, id) => Promise.resolve(showPreview(id)));
  const view = await render(<QueryClientProvider client={qc}><BlockedImport target={{ app: "sonarr", downloadId }} /></QueryClientProvider>);
  await settle();
  return view;
};
/** "Wrong show?", a search, and the show it really is. */
const pickShow = async (title: string) => {
  if (!screen.queryByLabelText("Find the show in Sonarr")) await fireEvent.press(screen.getByRole("button", { name: "Wrong show?" }));
  await fireEvent.changeText(screen.getByLabelText("Find the show in Sonarr"), title);
  await settle();
  await fireEvent.press(screen.getByRole("button", { name: title }));
};
const later = <T,>() => {
  let done!: (v: T) => void;
  let fail!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { done = res; fail = rej; });
  return { promise, done, fail };
};

test("another show's episodes load before they can be picked, and a slower answer for an earlier pick is dropped", async () => {
  mockLibrary.mockImplementation(async (_app, q) => ({ rows: [{ id: q === "Second Show" ? 30 : 20, title: q, year: null }] }));
  const first = later<{ rows: AppArrEpisode[] }>();
  const second = later<{ rows: AppArrEpisode[] }>();
  mockEpisodes.mockImplementation((id) => (id === 20 ? first.promise : second.promise));
  await showTv("t1");

  await pickShow("First Show");
  await settle();
  expect(screen.getByText("Loading episodes…")).toBeTruthy();
  // The old show's episodes aren't offered meanwhile, and Import waits.
  expect(screen.queryByRole("button", { name: /^Which episode → S01E01/ })).toBeNull();
  expect(importOff()).toBe(true);

  await pickShow("Second Show");
  await act(async () => { second.done({ rows: [ep(301, "S03E01")] }); });
  await settle();
  await act(async () => { first.done({ rows: [ep(201, "S02E01")] }); });
  await settle();
  expect(screen.queryByText("Loading episodes…")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Which episode → S02E01/ })).toBeNull();

  await fireEvent.press(screen.getByRole("button", { name: /^Which episode → S03E01/ }));
  expect(importOff()).toBe(false);
});

test("episodes that couldn't be had say so, with Try again", async () => {
  mockLibrary.mockResolvedValue({ rows: [{ id: 20, title: "First Show", year: null }] });
  mockEpisodes.mockRejectedValueOnce(new Error("Sonarr didn’t answer."));
  await showTv("t2");
  await pickShow("First Show");
  await settle();
  expect(screen.getByText("Couldn’t get First Show’s episodes from Sonarr.")).toBeTruthy();
  expect(screen.getByText("Try again for First Show’s episodes, or pick another show.")).toBeTruthy();
  expect(screen.queryByText(/have loaded/)).toBeNull();
  expect(importOff()).toBe(true);

  mockEpisodes.mockResolvedValueOnce({ rows: [ep(201, "S02E01")] });
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await settle();
  expect(screen.queryByText(/Couldn’t get First Show’s episodes/)).toBeNull();
  expect(screen.getByRole("button", { name: /^Which episode → S02E01/ })).toBeTruthy();
});

test("an import that didn't go in looks inside again and drops the picks", async () => {
  mockImport.mockRejectedValue(new ApiError(409, "The download changed. Look again.", "http"));
  mockLibrary.mockResolvedValue({ rows: [{ id: 8, title: "Sintel", year: 2010 }] });
  await show("d3");
  await fireEvent.press(screen.getByRole("button", { name: "Wrong film?" }));
  await fireEvent.changeText(screen.getByLabelText("Find the film in Radarr"), "Sintel");
  await settle();
  await fireEvent.press(screen.getByRole("button", { name: "Sintel (2010)" }));
  expect(screen.getByText("Film: Sintel (2010)")).toBeTruthy();

  await fireEvent.press(screen.getByRole("button", { name: "Import it" }));
  await settle();
  expect(mockPreview).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Film: Big Buck Bunny (2008)")).toBeTruthy();
});

test("two files set as the same film are refused", async () => {
  mockPreview.mockImplementation((_app, id) => {
    const p = preview(id);
    return Promise.resolve({ ...p, files: [p.files[0], { ...p.files[0], name: "bbb.sample.mkv" }] });
  });
  await show("d4");
  expect(screen.getByText("Two files are set as Big Buck Bunny.")).toBeTruthy();
  expect(importOff()).toBe(true);
  await fireEvent.press(screen.getAllByRole("radio", { name: "Don’t import this file" })[1]);
  expect(screen.queryByText(/Two files are set as/)).toBeNull();
  expect(importOff()).toBe(false);
});

test("a look inside that fails can be tried again", async () => {
  mockPreview.mockRejectedValueOnce(new ApiError(502, "Radarr didn’t answer.", "http"));
  await show("d5");
  expect(screen.getByText("Radarr didn’t answer.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await settle();
  expect(screen.queryByText("Radarr didn’t answer.")).toBeNull();
  expect(screen.getByText("Film: Big Buck Bunny (2008)")).toBeTruthy();
});

test("a search for the film says it's searching, and when it fails, says so with Try again", async () => {
  const slow = later<{ rows: AppArrItem[] }>();
  mockLibrary.mockReturnValueOnce(slow.promise).mockRejectedValueOnce(new Error("Radarr didn’t answer."))
    .mockResolvedValueOnce({ rows: [{ id: 8, title: "Sintel", year: 2010 }] });
  await show("d6");
  await fireEvent.press(screen.getByRole("button", { name: "Wrong film?" }));
  await fireEvent.changeText(screen.getByLabelText("Find the film in Radarr"), "Sint");
  await settle();
  expect(screen.getByText("Searching…")).toBeTruthy();
  await act(async () => { slow.done({ rows: [] }); });
  await settle();
  expect(screen.getByText("Nothing in Radarr by that name.")).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText("Find the film in Radarr"), "Sintel");
  await settle();
  expect(screen.getByText("Couldn’t search Radarr.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await settle();
  expect(screen.getByRole("button", { name: "Sintel (2010)" })).toBeTruthy();
});

test("a list of blocked downloads that fails to load says so, with Try again", async () => {
  mockBlocked.mockRejectedValueOnce(new Error("The server didn’t answer."))
    .mockResolvedValueOnce({ rows: [{ app: "radarr", downloadId: "d7", title: "Big Buck Bunny", year: 2008, messages: [], episodes: [] }] });
  await render(<QueryClientProvider client={qc}><BlockedList /></QueryClientProvider>);
  await settle();
  expect(screen.getByText("Couldn’t check for blocked downloads.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await settle();
  expect(screen.queryByText(/Couldn’t check/)).toBeNull();
  expect(screen.getByText("Big Buck Bunny (2008)")).toBeTruthy();
});
