import { useWindowDimensions } from "react-native";

/** Poster grid columns: three, or two once the system text is large enough that titles
 *  and the line under them would be cut off in a third of the screen. */
export function useColumns() {
  const { width, fontScale } = useWindowDimensions();
  return fontScale >= 1.3 || width < 340 ? 2 : 3;
}

/** The system text is large enough that one-line truncation would hide what something says. */
export function useLargeText() {
  return useWindowDimensions().fontScale >= 1.3;
}
