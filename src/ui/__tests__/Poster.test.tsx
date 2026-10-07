// A poster that won't load (offline, or gone from the server) shows the drawn cover instead
// of an empty box, and a new poster for the same spot gets its own try.
import { expect, jest, test } from "@jest/globals";
import { act, render, screen } from "@testing-library/react-native";
import type { ImageSource } from "expo-image";
import { Poster } from "../Poster";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
}));
jest.mock("expo-image", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return { Image: (props: object) => createElement(View, { ...props, testID: "poster-image" }) };
});
jest.mock("expo-linear-gradient", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return { LinearGradient: () => createElement(View, { testID: "drawn-cover" }) };
});
// Every address loads as itself; the proxy's member-only ones carry the token.
jest.mock("../../features/art", () => ({
  useArt: () => (poster: string | null | undefined): ImageSource | null => !poster ? null
    : poster.startsWith("/img/") ? { uri: `https://plexbie.example${poster}`, headers: { Authorization: "Bearer t" } } : { uri: poster },
}));

// The cover is hidden from screen readers (the title beside it is read), so look past that.
const HIDDEN = { includeHiddenElements: true };
const image = () => screen.getByTestId("poster-image", HIDDEN);
const failToLoad = () => act(() => { (image().props as { onError: () => void }).onError(); });

test("a poster shows the picture", async () => {
  await render(<Poster poster="https://image.example/a.jpg" title="Big Buck Bunny" id="1" />);
  expect(image().props.source).toEqual({ uri: "https://image.example/a.jpg" });
  expect(screen.queryByTestId("drawn-cover", HIDDEN)).toBeNull();
});

test("a poster that won't load shows the drawn cover", async () => {
  await render(<Poster poster="/img/plex/1" title="Big Buck Bunny" id="1" />);
  await failToLoad();
  expect(screen.queryByTestId("poster-image", HIDDEN)).toBeNull();
  expect(screen.getByTestId("drawn-cover", HIDDEN)).toBeTruthy();
});

test("a new poster after a broken one is tried again", async () => {
  const { rerender } = await render(<Poster poster="https://image.example/a.jpg" title="Big Buck Bunny" id="1" />);
  await failToLoad();
  await rerender(<Poster poster="https://image.example/b.jpg" title="Sintel" id="2" />);
  expect(image().props.source).toEqual({ uri: "https://image.example/b.jpg" });
});

test("member-only posters stay in memory; public ones may go to disk", async () => {
  const { rerender } = await render(<Poster poster="/img/plex/1" title="Big Buck Bunny" id="1" />);
  expect(image().props.cachePolicy).toBe("memory");
  await rerender(<Poster poster="https://image.example/a.jpg" title="Big Buck Bunny" id="1" />);
  expect(image().props.cachePolicy).toBe("memory-disk");
});
