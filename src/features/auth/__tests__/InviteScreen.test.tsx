// Invite links: the Plexbie project's own site is never a household's server, whether the link
// is pasted or opens the app; a household's own address, under that name or any other, is used.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { pub } from "../../../api/client";
import { InviteScreen, parseInviteLink } from "../InviteScreen";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
// The app's own link, as it opened the screen.
let mockParams: { server?: string; code?: string } = {};
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null }));
jest.mock("../../../ui/BackHeader", () => ({ BackHeader: () => null }));
const mockSignIn = jest.fn(async () => ({}));
jest.mock("../../../auth/session", () => ({
  ...jest.requireActual<object>("../../../auth/session"),
  useSession: () => ({ state: { phase: "signedOut", server: "" }, signIn: mockSignIn, signOut: jest.fn() }),
}));

const PROJECT_SITE = "plexbie.com is the Plexbie project’s site. Type your own Plexbie’s address.";
const CODE = "abcdefgh";

beforeEach(() => {
  mockParams = {};
  mockSignIn.mockClear();
  jest.spyOn(pub, "inviteCheck").mockImplementation(() => new Promise(() => undefined));
});

test.each(["https://plexbie.com/invite/abcdefgh", "www.plexbie.com/invite/abcdefgh", "Join us: https://PLEXBIE.COM/invite/abcdefgh"])(
  "a pasted invite link at the project's own site (%s) is refused", (text) => {
    expect(() => parseInviteLink(text)).toThrow(PROJECT_SITE);
  });

test("a pasted invite link at a household's own address is used", () => {
  expect(parseInviteLink("https://home.plexbie.com/invite/abcdefgh")).toEqual({ server: "https://home.plexbie.com", code: CODE });
  expect(parseInviteLink("plexbie.example.com/invite/abcdefgh")).toEqual({ server: "https://plexbie.example.com", code: CODE });
});

test.each(["plexbie.com", "https://www.plexbie.com"])(
  "the app's own link to the project's own site (%s) asks nothing of it and signs nothing in", async (server) => {
    mockParams = { server, code: CODE };
    await render(<InviteScreen />);
    expect(screen.getByText("That link to the app doesn’t work. Paste the invite link itself instead.")).toBeTruthy();
    expect(pub.inviteCheck).not.toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

test("the app's own link to a household's own address is checked there", async () => {
  mockParams = { server: "https://home.plexbie.com", code: CODE };
  await render(<InviteScreen />);
  expect(pub.inviteCheck).toHaveBeenCalledWith("https://home.plexbie.com", CODE);
});
