// A request card's "Updated" age keeps counting while the card stays on screen, even when
// the list hands it the same request again.
import { expect, jest, test } from "@jest/globals";
import { act, render, screen } from "@testing-library/react-native";
import { myRequests } from "../../../api/__fixtures__/bot";
import type { AppRequest } from "../../../api/schemas";
import { RequestCard } from "../RequestCard";

jest.mock("../../../auth/session", () => ({
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("../../../ui/Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));

test("the updated age moves on with the clock", async () => {
  const now = new Date("2026-10-07T12:00:00Z");
  jest.useFakeTimers({ now, doNotFake: ["nextTick", "setImmediate"] });
  try {
    const request = { ...(myRequests[0] as unknown as AppRequest), updatedAt: new Date(now.getTime() - 14 * 60_000).toISOString() };
    const { unmount } = await render(<RequestCard request={request} />);
    expect(screen.getByText("Updated 14 min ago")).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(7 * 60_000); });
    expect(screen.getByText("Updated 21 min ago")).toBeTruthy();
    await unmount();
  } finally {
    jest.useRealTimers();
  }
});
