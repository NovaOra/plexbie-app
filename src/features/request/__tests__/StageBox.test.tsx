// The five steps: the one it's on says when it got there, never a bare "now" beside an older "Asked".
import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { MediaRequestSchema } from "../../../api/schemas";
import { StageBox } from "../StageBox";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("../../../ui/Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const base = { slot: 12, title: { id: "10378", kind: "movie", title: "Big Buck Bunny", poster: null }, updatedAt: ago(1) };

test("asked, it says when it was asked", async () => {
  await render(<StageBox r={MediaRequestSchema.parse({ ...base, stage: "requested", requestedAt: ago(36) })} />);
  expect(screen.getByLabelText(/Step 1 of 5: Requested, 36 min ago$/)).toBeTruthy();
  expect(screen.getByText("· 36 min ago", { includeHiddenElements: true })).toBeTruthy();
});

test("further on, an admin's view says when it reached its stage", async () => {
  const r = MediaRequestSchema.parse({ ...base, stage: "downloading", requestedAt: ago(300), stageSince: ago(120) });
  await render(<StageBox r={r} />);
  expect(screen.getByText("· 2 h ago", { includeHiddenElements: true })).toBeTruthy();
});

test("with no time for its stage, it says now", async () => {
  await render(<StageBox r={MediaRequestSchema.parse({ ...base, stage: "downloading", requestedAt: ago(300) })} />);
  expect(screen.getByText("· now", { includeHiddenElements: true })).toBeTruthy();
});
