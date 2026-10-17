// The frame of a pushed detail screen (a request, a ticket): the page runs up behind the
// status bar under a floating Back and moves out of the keyboard's way. Until there's
// something to show, DetailFallback stands in: loading, offline, couldn't load, or not there.
import type { ReactNode, Ref } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, View, type Text as RNText } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackHeader, useBackClearance } from "./BackHeader";
import { Button } from "./Button";
import { Ambient } from "./Glass";
import { KEYBOARD_BEHAVIOR } from "./keyboard";
import { Poster } from "./Poster";
import { OfflineNote } from "./QueryGate";
import { StatusBarScrim } from "./StatusBarScrim";
import { Text } from "./Text";
import { color, font, radius, space } from "./theme";
import { Placeholder } from "./Placeholder";

/** `scroll`: useScrollToField's, so a focused field scrolls into view. */
export function DetailPage({ scroll, children }: { scroll: Ref<ScrollView>; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const top = useBackClearance();
  return (
    <KeyboardAvoidingView style={styles.page} behavior={KEYBOARD_BEHAVIOR}>
      <Ambient />
      <ScrollView ref={scroll} contentContainerStyle={[styles.pad, { paddingTop: top, paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <StatusBarScrim />
      <BackHeader overlay />
    </KeyboardAvoidingView>
  );
}

/** The same insides without the page: in Manage's detail sheet or beside its queue, which scroll them. */
export function DetailFrame({ embedded, scroll, children }: { embedded?: boolean; scroll: Ref<ScrollView>; children: ReactNode }) {
  return embedded ? <View style={styles.embedded}>{children}</View> : <DetailPage scroll={scroll}>{children}</DetailPage>;
}

/** In the page's place until it loads: a placeholder, or `errorTitle` with Try again.
 *  `notFound` (passed once the load is done and the thing isn't in it) says so, with
 *  nothing to retry. `offline` (the load is waiting for a connection, a Try again too) says
 *  it loads then, in place of the last error. */
export function DetailFallback({ error, errorTitle, onRetry, notFound, offline, embedded }: {
  error: unknown; errorTitle: string; onRetry: () => void; notFound?: string; offline?: boolean;
  /** In a sheet or a pane: no page and no Back of its own. */
  embedded?: boolean;
}) {
  return (
    <View style={embedded ? styles.embedded : styles.page}>
      {embedded ? null : <BackHeader />}
      <View style={embedded ? undefined : styles.pad}>
        {offline && !notFound ? <OfflineNote /> : error || notFound ? (
          <>
            <Text variant="title" accessibilityRole="alert">{error ? errorTitle : notFound}</Text>
            {error ? <Button kind="secondary" label="Try again" onPress={onRetry} style={detailStyles.start} /> : null}
          </>
        ) : <View accessibilityLabel="Loading" accessibilityState={{ busy: true }} accessible><Placeholder height={160} /></View>}
      </View>
    </View>
  );
}

/** A title's head: its poster, then the eyebrow, the title (the screen's heading, focused
 *  through `heading`) and any lines under it. */
export function TitleHead({ title, eyebrow, heading, children }: {
  title: { poster: string | null | undefined; title: string; id: string }; eyebrow: string; heading: Ref<RNText>; children?: ReactNode;
}) {
  return (
    <View style={styles.head}>
      <Poster poster={title.poster} title={title.title} id={title.id} size="w342" style={styles.poster} />
      <View style={styles.headText}>
        <Text variant="eyebrow">{eyebrow}</Text>
        <Text ref={heading} style={detailStyles.name} accessibilityRole="header">{title.title}</Text>
        {children}
      </View>
    </View>
  );
}

/** What the detail screens' own parts share. */
export const detailStyles = StyleSheet.create({
  start: { alignSelf: "flex-start" },
  name: { fontFamily: font.black, fontSize: 24, lineHeight: 28, color: color.ink },
  box: { gap: space.m, padding: space.l, borderRadius: radius.m, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule },
  ink: { color: color.ink },
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  pad: { paddingHorizontal: space.l, gap: space.l },
  embedded: { gap: space.l },
  head: { flexDirection: "row", alignItems: "flex-end", gap: space.l },
  poster: { width: 104 },
  headText: { flex: 1, gap: space.xs },
});
