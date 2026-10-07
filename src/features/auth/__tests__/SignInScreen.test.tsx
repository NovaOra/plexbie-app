// Sign-in, like every other page, has the frosted band under the status bar, so the logo
// and title never scroll up under the clock (small phones, the keyboard up, large text).
// A first launch doesn't open the keyboard over the other ways in; switching back to the
// domain field does focus it.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
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
jest.mock("../../../auth/session", () => ({
  DEFAULT_SERVER: "",
  SignInError: class extends Error {},
  normalizeServer: (s: string) => `https://${s}`,
  useSession: () => ({ state: { phase: "signedOut", server: mockServer }, signIn: jest.fn(), lookAround: jest.fn() }),
}));

beforeEach(() => { mockServer = "https://plexbie.example.com"; });

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
