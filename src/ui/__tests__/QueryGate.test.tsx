// What stands in for a screen or section until its data is in: a placeholder a screen reader
// hears as loading, "You're offline" while the load waits for a connection, or what went
// wrong with Try again.
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { QueryGate } from "../QueryGate";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("../haptics", () => ({ tap: () => undefined, select: () => undefined, reward: () => undefined, error: () => undefined }));

const query = (over: Partial<{ error: Error | null; fetchStatus: "fetching" | "paused" | "idle"; isFetching: boolean }> = {}) =>
  ({ error: null, fetchStatus: "fetching" as const, isFetching: true, refetch: jest.fn(), ...over });

test("while it loads, a placeholder a screen reader hears as loading", async () => {
  await render(<QueryGate query={query()} errorTitle="Couldn’t load people." />);
  const loading = screen.getByLabelText("Loading");
  expect(loading.props.accessibilityState).toEqual({ busy: true });
  expect(screen.queryByRole("alert")).toBeNull();
});

test("offline with nothing loaded yet, it says it loads once back online", async () => {
  await render(<QueryGate query={query({ fetchStatus: "paused", isFetching: false })} errorTitle="Couldn’t load people." />);
  expect(screen.getByRole("alert").props.children).toBe("You’re offline.");
  expect(screen.getByText("This loads when you’re back online.")).toBeTruthy();
  expect(screen.queryByLabelText("Loading")).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});

test("a load that fails says so and why, and Try again loads it again", async () => {
  const q = query({ error: new Error("The server didn’t answer."), fetchStatus: "idle", isFetching: false });
  await render(<QueryGate query={q} errorTitle="Couldn’t load people." />);
  expect(screen.getByRole("alert").props.children).toBe("Couldn’t load people.");
  expect(screen.getByText("The server didn’t answer.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(q.refetch).toHaveBeenCalledTimes(1);
});

test("a failed load that waits for a connection says it's offline", async () => {
  await render(<QueryGate query={query({ error: new Error("The server didn’t answer."), fetchStatus: "paused", isFetching: false })} errorTitle="Couldn’t load people." />);
  expect(screen.getByRole("alert").props.children).toBe("You’re offline.");
});

test("a screen's own placeholder is used, still heard as loading", async () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  await render(<QueryGate query={query()} errorTitle="Couldn’t load this title." skeleton={<Text>shapes</Text>} />);
  expect(screen.getByLabelText("Loading")).toBeTruthy();
  expect(screen.getByText("shapes")).toBeTruthy();
});
