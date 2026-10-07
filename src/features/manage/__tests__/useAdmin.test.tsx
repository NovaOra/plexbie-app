// Manage's action runner: a write that got no answer (the app or a proxy stopped waiting)
// may still have gone through, so it says so instead of "didn't work", reloads what it
// touched, and keeps its button busy until that reload is in.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { ApiError } from "../../../api/client";
import type { Ack } from "../../../api/schemas";
import { useAct, type Section } from "../useAdmin";

jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
const mockToast = jest.fn();
jest.mock("../../../ui/Toast", () => ({ useToast: () => mockToast }));
jest.mock("../../../auth/session", () => ({
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));

const tickets = jest.fn<() => Promise<string[]>>();
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function Harness({ call, refresh, recheck }: { call: () => Promise<Ack>; refresh?: Section[]; recheck?: () => Promise<unknown> }) {
  useQuery({ queryKey: ["admin", "https://plexbie.example", "tickets"], queryFn: tickets });
  const { busy, act: run } = useAct();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ busy: busy === "go" }}
      onPress={() => void run("go", call, { failText: "Not imported", refresh, recheck })}>
      <Text>Go</Text>
    </Pressable>
  );
}

let qc: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  tickets.mockResolvedValue([]);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 1600)); });
  qc.clear();
});

const show = async (props: Parameters<typeof Harness>[0]) => {
  await render(<QueryClientProvider client={qc}><Harness {...props} /></QueryClientProvider>);
  await settle();
};
const busy = () => screen.getByRole("button").props.accessibilityState.busy;

test("no answer says it may have gone through, and stays busy until what it touched has reloaded", async () => {
  const reload = deferred<string[]>(), looked = deferred<void>();
  const recheck = jest.fn(() => looked.promise);
  await show({ call: () => Promise.reject(new ApiError(0, "The server took too long to answer.", "timeout")), refresh: ["tickets"], recheck });
  tickets.mockReturnValueOnce(reload.promise);
  await fireEvent.press(screen.getByRole("button"));
  await settle();
  expect(mockToast).toHaveBeenCalledWith({ tone: "error", text: "No answer yet", detail: "It may have gone through. Check before trying again." });
  expect(recheck).toHaveBeenCalledTimes(1);
  expect(tickets).toHaveBeenCalledTimes(2);
  expect(busy()).toBe(true);
  await act(async () => { reload.resolve([]); looked.resolve(); });
  await settle();
  expect(busy()).toBe(false);
});

test("a proxy that gave up waiting is no answer too", async () => {
  await show({ call: () => Promise.reject(new ApiError(504, "The server said no (504).", "http")) });
  await fireEvent.press(screen.getByRole("button"));
  await settle();
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ text: "No answer yet" }));
});

test("a refusal is still a refusal, with the bot's reason", async () => {
  const recheck = jest.fn(() => Promise.resolve());
  await show({ call: () => Promise.reject(new ApiError(409, "Already imported.", "http")), recheck });
  await fireEvent.press(screen.getByRole("button"));
  await settle();
  expect(mockToast).toHaveBeenCalledWith({ tone: "error", text: "Not imported", detail: "Already imported." });
  expect(recheck).not.toHaveBeenCalled();
  expect(busy()).toBe(false);
});
