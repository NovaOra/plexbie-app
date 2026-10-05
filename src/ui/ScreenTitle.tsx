// A screen's big heading. There's no native header bar, so this is what a screen reader
// lands on and reads when the screen opens (or, with `refocusOn`, when its content swaps).
import type { ReactNode } from "react";
import { useFocusHere } from "./announce";
import { Text } from "./Text";

export function ScreenTitle({ children, refocusOn }: { children: ReactNode; refocusOn?: unknown }) {
  const ref = useFocusHere(refocusOn);
  return <Text ref={ref} variant="display" accessibilityRole="header">{children}</Text>;
}
