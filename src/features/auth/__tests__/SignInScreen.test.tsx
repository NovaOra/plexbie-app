// Sign-in, like every other page, has the frosted band under the status bar, so the logo
// and title never scroll up under the clock (small phones, the keyboard up, large text).
// A first launch doesn't open the keyboard over the other ways in; switching back to the
// domain field does focus it. The Plexbie project's own site is never taken as a household's
// server, however it's typed.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type * as Session from "../../../auth/session";
import { Text as MockText } from "react-native";
import { SignInScreen } from "../SignInScreen";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: () => undefined }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null }));
jest.mock("../../../ui/StatusBarScrim", () => ({ StatusBarScrim: () => <MockText>status bar scrim</MockText> }));
jest.mock("../InviteScreen", () => ({ InviteLinkField: () => null }));
// The Plexbie used before, or "" on a fresh install.
let mockServer = "https://plexbie.example.com";
const mockSignIn = jest.fn(async (_server: string, _via: string) => ({}));
jest.mock("../../../auth/session", () => {
  const { SignInError, normalizeServer } = jest.requireActual<typeof Session>("../../../auth/session");
  return {
    DEFAULT_SERVER: "",
    SignInError,
    normalizeServer,
    useSession: () => ({ state: { phase: "signedOut", server: mockServer }, signIn: mockSignIn, lookAround: jest.fn() }),
  };
});

beforeEach(() => { mockServer = "https://plexbie.example.com"; mockSignIn.mockClear(); });

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
