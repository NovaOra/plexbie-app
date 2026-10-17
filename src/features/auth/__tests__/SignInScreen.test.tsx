// Sign-in, like every other page, has the frosted band under the status bar, so the logo
// and title never scroll up under the clock (small phones, the keyboard up, large text).
// A first launch doesn't open the keyboard over the other ways in; switching back to the
// domain field does focus it. The Plexbie project's own site is never taken as a household's
// server, however it's typed.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type * as Session from "../../../auth/session";
import { Text as MockText } from "react-native";
import { SignInScreen } from "../SignInScreen";

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
  await fireEvent.press(screen.getByText("Use plexbie.your domain instead"));
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
