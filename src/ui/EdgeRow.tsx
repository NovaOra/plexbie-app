// A row that scrolls sideways (tabs, filter chips) on a padded page: it runs to the
// screen's edges, so chips slide out of sight at the edge of the phone rather than at
// the page's margin, while the first one still lines up with the text above.
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, type ScrollViewProps } from "react-native";
import { space } from "./theme";

/** `inset` is the page's side padding (space.l on every screen). */
export function EdgeRow({ children, inset = space.l, contentContainerStyle, ...rest }: ScrollViewProps & { children: ReactNode; inset?: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} {...rest} style={[{ marginHorizontal: -inset }, rest.style]}
      contentContainerStyle={[styles.row, { paddingHorizontal: inset }, contentContainerStyle]}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.s },
});
