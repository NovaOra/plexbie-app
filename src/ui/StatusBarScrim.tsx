import { FrostedTop } from "./Glass";

/** The top of every page, Android and iPhone alike: the page runs up behind the status
 *  bar (and the Dynamic Island) and fades into the page colour there, so scrolled content
 *  never fights the clock and there's no hard band to cut it off. */
export function StatusBarScrim() {
  return <FrostedTop />;
}
