// Sign-in, like every other page, has the frosted band under the status bar, so the logo
// and title never scroll up under the clock (small phones, the keyboard up, large text).
// A first launch doesn't open the keyboard over the other ways in; switching back to the
// domain field does focus it. The Plexbie project's own site is never taken as a household's
// server, however it's typed.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type * as Session from "../../../auth/session";
import { StyleSheet, Text as MockText } from "react-native";
import { SCREEN_MIN, SignInScreen } from "../SignInScreen";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => mockReduced,
}));
let mockReduced = false;
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: () => undefined }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null }));
jest.mock("../../../ui/StatusBarScrim", () => ({ StatusBarScrim: () => <MockText>status bar scrim</MockText> }));
jest.mock("../InviteScreen", () => ({ InviteLinkField: () => null }));
// The Plexbie used before, or "" on a fresh install.
let mockServer = "https://plexbie.example.com";
const mockSignIn = jest.fn(async (_server: string, _via: string): Promise<object> => ({}));
const mockLookAround = jest.fn();
jest.mock("../../../auth/session", () => {
  const { SignInError, normalizeServer } = jest.requireActual<typeof Session>("../../../auth/session");
  return {
    DEFAULT_SERVER: "",
    SignInError,
    normalizeServer,
    useSession: () => ({ state: { phase: "signedOut", server: mockServer }, signIn: mockSignIn, lookAround: mockLookAround }),
  };
});

beforeEach(() => {
  mockServer = "https://plexbie.example.com";
  mockReduced = false;
  mockSignIn.mockReset();
  mockSignIn.mockImplementation(async () => ({}));
  mockLookAround.mockClear();
});

const { SignInError: SignInErrorMock } = jest.requireActual<typeof Session>("../../../auth/session");

const PROJECT_SITE = "plexbie.com is the Plexbie project’s site. Type your own Plexbie’s address.";

test("the status bar has its scrim", async () => {
  await render(<SignInScreen />);
  expect(screen.getByText("status bar scrim")).toBeTruthy();
});

test("a first launch doesn't open the keyboard over the invite link and the sample", async () => {
  mockServer = "";
  await render(<SignInScreen />);
  expect(screen.getByLabelText("Your domain").props.autoFocus).toBeFalsy();
});

test("switching back to the domain field focuses it", async () => {
  mockServer = "";
  await render(<SignInScreen />);
  await fireEvent.press(screen.getByText("Use a different address"));
  await fireEvent.press(screen.getByText("Use your plexbie. address instead"));
  expect(screen.getByLabelText("Your domain").props.autoFocus).toBe(true);
});

test.each(["plexbie.com", "www.plexbie.com", "https://plexbie.com/", "com", "PLEXBIE.COM"])(
  "%s as the domain is the project's own site: said so, and no sign-in starts", async (typed) => {
    mockServer = "";
    await render(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText("Your domain"), typed);
    await fireEvent.press(screen.getByLabelText("Sign in with Discord"));
    expect(screen.getByText(PROJECT_SITE)).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

test.each(["plexbie.com", "www.plexbie.com", "https://plexbie.com/", "https://www.plexbie.com/requests"])(
  "%s as a different address is the project's own site too", async (typed) => {
    mockServer = "";
    await render(<SignInScreen />);
    await fireEvent.press(screen.getByText("Use a different address"));
    await fireEvent.changeText(screen.getByLabelText("Your Plexbie address"), typed);
    await fireEvent.press(screen.getByLabelText("Sign in with Plex"));
    expect(screen.getByText(PROJECT_SITE)).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

test("a household's own address under plexbie.com, or plexbie.<its domain>, signs in", async () => {
  mockServer = "";
  await render(<SignInScreen />);
  await fireEvent.changeText(screen.getByLabelText("Your domain"), "example.com");
  await fireEvent.press(screen.getByLabelText("Sign in with Discord"));
  expect(mockSignIn).toHaveBeenLastCalledWith("plexbie.example.com", "discord");
  await fireEvent.press(screen.getByText("Use a different address"));
  await fireEvent.changeText(screen.getByLabelText("Your Plexbie address"), "home.plexbie.com");
  await fireEvent.press(screen.getByLabelText("Sign in with Plex"));
  expect(mockSignIn).toHaveBeenLastCalledWith("home.plexbie.com", "plex");
  expect(screen.queryByText(PROJECT_SITE)).toBeNull();
});

test("at rest: channel 1, the tally on Standby, both keys and the other ways in", async () => {
  await render(<SignInScreen />);
  expect(screen.getByText("CH 1 · Sign in")).toBeTruthy();
  expect(screen.getByText("Standby")).toBeTruthy();
  expect(screen.queryByText("Tuning in")).toBeNull();
  expect(screen.getByText("Your household’s Plex, on air.")).toBeTruthy();
  expect(screen.getByLabelText("Sign in with Discord")).toBeTruthy();
  expect(screen.getByLabelText("Sign in with Plex")).toBeTruthy();
  expect(screen.getByText("Have an invite link?")).toBeTruthy();
  await fireEvent.press(screen.getByText("Look around with sample data"));
  expect(mockLookAround).toHaveBeenCalled();
});

test("the channel key tunes to channel 2's steps after the flick, and back", async () => {
  jest.useFakeTimers();
  try {
    await render(<SignInScreen />);
    await fireEvent.press(screen.getByLabelText("How to get in"));
    // The picture changes as the flick closes, not before.
    expect(screen.getByText("CH 1 · Sign in")).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(100); });
    expect(screen.getByText("CH 2 · Getting in")).toBeTruthy();
    // Channel 1 is silent to screen readers while channel 2 is on, and the other way round.
    expect(screen.queryByText("Your household’s Plex, on air.")).toBeNull();
    expect(screen.getByTestId("channel-off", { includeHiddenElements: true }).props.importantForAccessibility).toBe("no-hide-descendants");
    expect(screen.getByTestId("channel-on").props.importantForAccessibility).toBe("auto");
    await fireEvent.press(screen.getByLabelText("Back to sign-in"));
    await act(async () => { jest.advanceTimersByTime(100); });
    expect(screen.getByText("CH 1 · Sign in")).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

test("the screen is as tall as channel 1; a taller channel 2 grows it on channel 2 only, into room kept under the set", async () => {
  await render(<SignInScreen />);
  const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style);
  // Channel 1 is in the flow and sizes the screen, never under SCREEN_MIN; channel 2 lies over it from the top.
  expect(style("channel-on").position).toBeUndefined();
  expect(style("channel-off")).toMatchObject({ position: "absolute", top: 0, left: 0, right: 0 });
  expect(style("channel-off").bottom).toBeUndefined();
  expect(style("channels")).toMatchObject({ minHeight: SCREEN_MIN });
  // Channel 2 is 120 taller than channel 1: that much room waits under the set while channel 1 is on.
  await fireEvent(screen.getByTestId("channel-on"), "layout", { nativeEvent: { layout: { height: 300 } } });
  await fireEvent(screen.getByTestId("channel-off", { includeHiddenElements: true }), "layout", { nativeEvent: { layout: { height: 420 } } });
  expect(style("channel-2-reserve")).toMatchObject({ height: 120 });
  expect(style("channels").minHeight).toBe(SCREEN_MIN);
  await fireEvent.press(screen.getByLabelText("How to get in"));
  await act(async () => { await new Promise((ok) => setTimeout(ok, 120)); });
  // On channel 2 the screen takes that room: the set grows by as much as the reserve gives up.
  expect(style("channels").minHeight).toBe(420);
  expect(screen.queryByTestId("channel-2-reserve", { includeHiddenElements: true })).toBeNull();
  // All of it shows, with no scrolling box inside the screen.
  expect(screen.queryByTestId("channel-2-scroll", { includeHiddenElements: true })).toBeNull();
  expect(within(screen.getByTestId("channel-on")).getAllByLabelText(/^Step \d:/)).toHaveLength(3);
});

test("a channel 2 no taller than channel 1 keeps no room and changes nothing", async () => {
  await render(<SignInScreen />);
  await fireEvent(screen.getByTestId("channel-on"), "layout", { nativeEvent: { layout: { height: 300 } } });
  await fireEvent(screen.getByTestId("channel-off", { includeHiddenElements: true }), "layout", { nativeEvent: { layout: { height: 280 } } });
  expect(screen.queryByTestId("channel-2-reserve", { includeHiddenElements: true })).toBeNull();
});

test("the readout keeps room for its longest words, unseen and unread, so the set never moves as it changes", async () => {
  await render(<SignInScreen />);
  const ghost = screen.getByTestId("osd-ghost", { includeHiddenElements: true });
  expect(ghost.props.importantForAccessibility).toBe("no-hide-descendants");
  expect(StyleSheet.flatten(ghost.props.style)).toMatchObject({ opacity: 0 });
  expect(within(ghost).getByText("CH 1 · Tuning in to Discord", { includeHiddenElements: true })).toBeTruthy();
  // Only the real readout is read out.
  expect(screen.getByText("CH 1 · Sign in")).toBeTruthy();
  expect(screen.queryByText("CH 1 · Tuning in to Discord")).toBeNull();
  expect(screen.queryByText("Tuning in")).toBeNull();
});

test("under Reduce Motion the channel changes at once", async () => {
  mockReduced = true;
  await render(<SignInScreen />);
  await fireEvent.press(screen.getByLabelText("How to get in"));
  expect(screen.getByText("CH 2 · Getting in")).toBeTruthy();
});

test("a pressed key lights the tally while its sign-in is under way", async () => {
  let finish: (v: object) => void = () => undefined;
  mockSignIn.mockImplementation(() => new Promise((ok) => { finish = ok; }));
  await render(<SignInScreen />);
  await fireEvent.press(screen.getByLabelText("Sign in with Plex"));
  expect(screen.getByText("CH 1 · Tuning in to Plex")).toBeTruthy();
  expect(screen.getByText("Tuning in")).toBeTruthy();
  await act(async () => { finish({}); });
  expect(screen.getByText("Standby")).toBeTruthy();
});

test("a failed sign-in is the screen's lower third, in the website's words", async () => {
  mockSignIn.mockRejectedValue(new SignInErrorMock("Sign-in didn't work. Try again.", false, undefined, "failed"));
  await render(<SignInScreen />);
  await fireEvent.press(screen.getByLabelText("Sign in with Discord"));
  expect(screen.getByText("Sign-in problem")).toBeTruthy();
  expect(screen.getByText("Signing in didn’t work just now. Try again in a moment.")).toBeTruthy();
  expect(screen.getByText("Standby")).toBeTruthy();
});

test("a sign-in turned down is a cancel, not a problem", async () => {
  mockSignIn.mockRejectedValue(new SignInErrorMock("Sign-in was turned down.", false, undefined, "cancelled"));
  await render(<SignInScreen />);
  await fireEvent.press(screen.getByLabelText("Sign in with Discord"));
  expect(screen.getByText("Sign-in cancelled")).toBeTruthy();
  expect(screen.getByText("Sign-in was cancelled. Nothing was changed.")).toBeTruthy();
  expect(screen.queryByText("Sign-in problem")).toBeNull();
});

test("closing the sign-in says nothing", async () => {
  mockSignIn.mockRejectedValue(new SignInErrorMock("Sign-in was closed.", true));
  await render(<SignInScreen />);
  await fireEvent.press(screen.getByLabelText("Sign in with Discord"));
  expect(screen.queryByText("Sign-in problem")).toBeNull();
  expect(screen.queryByText("Sign-in was closed.")).toBeNull();
});

test("a problem while channel 2 is on brings channel 1 back to say it", async () => {
  mockReduced = true;
  mockServer = "";
  await render(<SignInScreen />);
  await fireEvent.press(screen.getByLabelText("How to get in"));
  await fireEvent.press(screen.getByLabelText("Sign in with Discord"));
  expect(screen.getByText("CH 1 · Sign in")).toBeTruthy();
  expect(screen.getByText("Enter your domain, or your Plexbie’s address.")).toBeTruthy();
});
