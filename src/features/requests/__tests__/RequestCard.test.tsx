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

test("the age turns over on its own minute, not a minute after the card appeared", async () => {
  const now = new Date("2026-10-07T12:00:00Z");
  jest.useFakeTimers({ now, doNotFake: ["nextTick", "setImmediate"] });
  try {
    // 14 min exactly: the line reads 15 min from 14 min 30 s on.
    const request = { ...(myRequests[0] as unknown as AppRequest), updatedAt: new Date(now.getTime() - 14 * 60_000).toISOString() };
    const { unmount } = await render(<RequestCard request={request} />);
    expect(screen.getByText("Updated 14 min ago")).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(29_000); });
    expect(screen.getByText("Updated 14 min ago")).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(2_000); });
    expect(screen.getByText("Updated 15 min ago")).toBeTruthy();
    expect(screen.getByLabelText(/Updated 15 min ago\.$/)).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(screen.getByText("Updated 16 min ago")).toBeTruthy();
    // The next turn is almost a minute away; once the card is gone nothing should still be waiting for it.
    await unmount();
    jest.advanceTimersByTime(10_000);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test("a newer update restarts the count from its own time", async () => {
  const now = new Date("2026-10-07T12:00:00Z");
  jest.useFakeTimers({ now, doNotFake: ["nextTick", "setImmediate"] });
  try {
    const base = myRequests[0] as unknown as AppRequest;
    // 14 min 31 s: the first render's turn is 59 s away, well after the newer update's own turn.
    const { rerender, unmount } = await render(<RequestCard request={{ ...base, updatedAt: new Date(now.getTime() - (14 * 60 + 31) * 1000).toISOString() }} />);
    expect(screen.getByText("Updated 15 min ago")).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(10_000); });
    // Moved on 50 s ago: "1 min ago" from 30 s on, so the next turn is 40 s away.
    await rerender(<RequestCard request={{ ...base, updatedAt: new Date(Date.now() - 50_000).toISOString() }} />);
    expect(screen.getByText("Updated 1 min ago")).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(41_000); });
    expect(screen.getByText("Updated 2 min ago")).toBeTruthy();
    // The next turn is almost a minute away; once the card is gone nothing should still be waiting for it.
    await unmount();
    jest.advanceTimersByTime(10_000);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});
