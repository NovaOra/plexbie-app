// What a detail screen shows until it has its request or ticket: a placeholder while it
// loads, the error with a way to try again, or, once loaded, that the thing isn't there.
// Offline before it has loaded, it says it loads once back online, even after a failed load.
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { processColor, StyleSheet, Text } from "react-native";
import { DetailFallback, DetailPage } from "../DetailPage";
import { color } from "../theme";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("../haptics", () => ({ tap: () => undefined, select: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../Glass", () => ({ Ambient: () => null, GlassFill: () => null, FrostedTop: () => null, glass: { surface: {} } }));
jest.mock("../StatusBarScrim", () => ({ StatusBarScrim: () => null }));

test("while it loads, a placeholder and a way back", async () => {
  await render(<DetailFallback error={null} errorTitle="Couldn’t load this ticket." onRetry={() => undefined} />);
  expect(screen.getByLabelText("Loading").props.accessibilityState).toEqual({ busy: true });
  expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a load that fails says so, and Try again loads it again", async () => {
  const onRetry = jest.fn();
  await render(<DetailFallback error={new Error("The server didn’t answer.")} errorTitle="Couldn’t load this ticket." onRetry={onRetry} />);
  expect(screen.getByRole("alert").props.children).toBe("Couldn’t load this ticket.");
  expect(screen.queryByLabelText("Loading")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("loaded but not there: it says so, with nothing to try again", async () => {
  await render(<DetailFallback error={null} errorTitle="Couldn’t load this request." onRetry={() => undefined}
    notFound="That request isn’t yours, or it’s gone." />);
  expect(screen.getByRole("alert").props.children).toBe("That request isn’t yours, or it’s gone.");
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  expect(screen.queryByLabelText("Loading")).toBeNull();
});

test("a failed load wins over not found", async () => {
  await render(<DetailFallback error={new Error("offline")} errorTitle="Couldn’t load this request." onRetry={() => undefined}
    notFound="That request isn’t yours, or it’s gone." />);
  expect(screen.getByRole("alert").props.children).toBe("Couldn’t load this request.");
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
});

test("offline before it has loaded, it says it loads once back online", async () => {
  await render(<DetailFallback error={null} errorTitle="Couldn’t load this ticket." onRetry={() => undefined} offline />);
  expect(screen.getByRole("alert").props.children).toBe("You’re offline.");
  expect(screen.getByText("This loads when you’re back online.")).toBeTruthy();
  expect(screen.queryByLabelText("Loading")).toBeNull();
  expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
});

test("a failed load tried again offline says it's offline, not the old error", async () => {
  await render(<DetailFallback error={new Error("The server didn’t answer.")} errorTitle="Couldn’t load this ticket." onRetry={() => undefined} offline />);
  expect(screen.getByRole("alert").props.children).toBe("You’re offline.");
  expect(screen.queryByText("Couldn’t load this ticket.")).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});

test("the page scrolls under a floating Back that has a band of the page's colour behind it, fading out under the pill", async () => {
  await render(<DetailPage scroll={{ current: null }}><Text>A ticket</Text></DetailPage>);
  const fade = screen.getByTestId("back-fade");
  expect(fade.props.pointerEvents).toBe("none");
  // 72 under the status bar at the phone's own text size; Jest's text is 2x, so the pill is 64 tall and the band 92.
  expect(StyleSheet.flatten(fade.props.style)).toMatchObject({ position: "absolute", top: 0, height: 92 });
  // The page's colour at the top, nothing at the foot.
  expect(fade.props.colors[0]).toBe(processColor(color.field));
  expect(fade.props.colors.at(-1)).toBe(processColor("rgba(16, 23, 43, 0)"));
  expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
});
