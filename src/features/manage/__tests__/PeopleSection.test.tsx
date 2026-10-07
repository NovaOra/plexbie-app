// Manage → People: Unlink and picking who to link are sent once, however fast they're
// tapped, and Unlink waits while its unlink is on its way.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { Ack, AppAdminPerson } from "../../../api/schemas";
import { PeopleSection } from "../PeopleSection";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => jest.requireActual("react-native-reanimated/mock"));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// What each tappable row does, by its label, to tap it twice before the first is done.
const mockPresses: Record<string, () => unknown> = {};
jest.mock("../../../ui/Pressable", () => {
  const { Pressable } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PressableScale: (props: { accessibilityLabel?: string; onPress?: () => unknown } & object) => {
      if (props.accessibilityLabel && props.onPress) mockPresses[props.accessibilityLabel] = props.onPress;
      return <Pressable {...props} />;
    },
  };
});
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));
const mockToast = jest.fn();
jest.mock("../../../ui/Toast", () => ({ useToast: () => mockToast }));
jest.mock("../../../ui/Confirm", () => ({ useConfirm: () => jest.fn() }));

const mockClient = {
  adminPeople: jest.fn<() => Promise<AppAdminPerson[]>>(),
  linkCandidates: jest.fn<() => Promise<{ discord: { id: string; name: string; username: string }[] }>>(),
  linkPerson: jest.fn<() => Promise<Ack>>(),
  unlinkPerson: jest.fn<() => Promise<Ack>>(),
};
jest.mock("../../../auth/session", () => ({
  useApi: () => mockClient,
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));

const person = (over: Partial<AppAdminPerson>) => ({
  plexName: "samr", displayName: "Sam Rivers", linked: false, discordName: null, discordId: null, owner: false, topThree: false,
  neverRemove: false, warned: false, hasAccess: true, tracked: true, lastWatched: null, daysIdle: 3, removalIn: 40, warnAfter: 30,
  ...over,
}) as AppAdminPerson;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let qc: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.linkCandidates.mockResolvedValue({ discord: [{ id: "42", name: "Sam", username: "sam" }] });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 1600)); });
  qc.clear();
});

const show = async () => {
  await render(<QueryClientProvider client={qc}><PeopleSection /></QueryClientProvider>);
  await screen.findByText("Sam Rivers");
};

test("Unlink tapped twice unlinks once, and waits while it's on its way", async () => {
  mockClient.adminPeople.mockResolvedValue([person({ linked: true, discordName: "Sam", discordId: "42" })]);
  const unlinking = deferred<Ack>();
  mockClient.unlinkPerson.mockReturnValue(unlinking.promise);
  await show();
  const unlink = screen.getByLabelText("Unlink Discord, Sam Rivers");
  await fireEvent.press(unlink);
  await fireEvent.press(unlink);
  expect(screen.getByLabelText("Unlink Discord, Sam Rivers").props.accessibilityState?.disabled).toBe(true);
  await act(async () => { unlinking.resolve({ ok: true, message: "Unlinked" } as Ack); });
  await settle();
  expect(mockClient.unlinkPerson).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledTimes(1);
});

test("picking who to link, tapped twice, links once and says nothing went wrong", async () => {
  mockClient.adminPeople.mockResolvedValue([person({})]);
  const linking = deferred<Ack>();
  mockClient.linkPerson.mockReturnValue(linking.promise);
  await show();
  await fireEvent.press(screen.getByLabelText("Link Discord, Sam Rivers"));
  await screen.findByLabelText("Link to Sam");
  // The member's row waits for the link to be made, so both taps land before it's in.
  await act(async () => { void mockPresses["Link to Sam"](); void mockPresses["Link to Sam"](); });
  await settle();
  expect(screen.queryByText("Couldn’t link Sam. Try again.")).toBeNull();
  await act(async () => { linking.resolve({ ok: true, message: "Linked" } as Ack); });
  await settle();
  expect(mockClient.linkPerson).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledTimes(1);
});
