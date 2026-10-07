// Small pieces Manage's sections share: a section heading with a count, an "all clear"
// note, a status pill, an initial in a circle, a one-line text field and the "Find someone"
// search, and a change shown before the bot has taken it. And two the request and ticket
// screens share: the "looks stuck" box and the search fixes.
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { Ref } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import type { HelpSearch } from "../../api/client";
import { Button } from "../../ui/Button";
import { detailStyles } from "../../ui/DetailPage";
import { Text } from "../../ui/Text";
import { color, font, radius, space, TOUCH } from "../../ui/theme";

export function Heading({ title, count }: { title: string; count?: number }) {
  return (
    <Text variant="eyebrow" accessibilityRole="header" style={styles.heading}>
      {title}{typeof count === "number" ? ` · ${count}` : ""}
    </Text>
  );
}

export function AllClear({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.clear}>
      <Text variant="title">{title}</Text>
      <Text variant="meta">{children}</Text>
    </View>
  );
}

export function Pill({ label, tone = "plain" }: { label: string; tone?: "plain" | "safe" | "bad" | "ok" }) {
  return <Text style={[styles.pill, styles[tone]]}>{label}</Text>;
}

export function Initial({ name }: { name: string }) {
  return (
    <View style={styles.initial} importantForAccessibility="no" accessibilityElementsHidden>
      <Text style={styles.initialText}>{(name.trim()[0] ?? "?").toUpperCase()}</Text>
    </View>
  );
}

/** A one-line text field, styled as every other in Manage. */
export function TextField({ ref, style, ...props }: TextInputProps & { ref?: Ref<TextInput> }) {
  return <TextInput ref={ref} placeholderTextColor={color.faint} {...props} style={[styles.field, style]} />;
}

/** "Find someone" over a list of people; `label` names another search. */
export function SearchField({ value, onChangeText, label = "Find someone" }: { value: string; onChangeText: (q: string) => void; label?: string }) {
  return <TextField value={value} onChangeText={onChangeText} placeholder={label} accessibilityLabel={label} autoCorrect={false} autoCapitalize="none" />;
}

/**
 * Shows a change straight away, before the bot has it: `change` patches the data under `key`,
 * then `send` runs (an act, null when it failed). On a failure `undo` puts back what the
 * change touched, from the data now and as it was before; other changes may have landed
 * since, so it shouldn't simply restore the old data. Answers what `send` did.
 */
export async function optimistic<T, R>(qc: QueryClient, key: QueryKey, change: (d: T) => T, send: () => Promise<R | null>, undo: (now: T, before: T) => T) {
  const before = qc.getQueryData<T>(key);
  qc.setQueryData<T>(key, (d) => (d === undefined ? d : change(d)));
  const out = await send();
  if (out === null && before !== undefined) qc.setQueryData<T>(key, (d) => (d === undefined ? d : undo(d, before)));
  return out;
}

/** Why a request looks stuck, one warning a line. Nothing when it doesn't. */
export function StuckBox({ stuck }: { stuck: string[] }) {
  if (!stuck.length) return null;
  return (
    <View style={[detailStyles.box, styles.stuckBox]} accessibilityRole="summary" accessibilityLabel={`Looks stuck: ${stuck.join(". ")}`}>
      {stuck.map((s) => <Text key={s} variant="label" style={styles.stuck}>⚠︎ {s}</Text>)}
    </View>
  );
}

/** The toast for each search fix. */
export const SEARCH_DONE: Record<HelpSearch, string> = {
  again: "Searching again", episodes: "Searching episode by episode", name: "Searching by name",
};

/**
 * Search again, episode by episode (a show only), or by name. `busy` is the action under
 * way, if any; `byName` makes "Search by name" the main button.
 */
export function SearchFixes({ kind, busy, onSearch, byName = false }: {
  kind: string; busy: string | null; onSearch: (how: HelpSearch) => void; byName?: boolean;
}) {
  return (
    <View style={styles.fixes}>
      <Button kind="secondary" label="Search again" busy={busy === "again"} busyLabel="Searching…" disabled={!!busy}
        onPress={() => onSearch("again")} style={styles.fix} />
      {kind === "tv" ? (
        <Button kind="secondary" label="Episode by episode" busy={busy === "episodes"} busyLabel="Searching…" disabled={!!busy}
          onPress={() => onSearch("episodes")} style={styles.fix} />
      ) : null}
      <Button kind={byName ? "primary" : "secondary"} label="Search by name" busy={busy === "name"} busyLabel="Starting…"
        disabled={!!busy} onPress={() => onSearch("name")} style={styles.fix} />
    </View>
  );
}

export const card = StyleSheet.create({
  box: {
    gap: space.m, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule,
  },
  top: { flexDirection: "row", gap: space.m },
  body: { flex: 1, gap: 4, minWidth: 0 },
  actions: { flexDirection: "row", gap: space.m },
  grow: { flex: 1 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});

const styles = StyleSheet.create({
  heading: { marginTop: space.l, marginBottom: space.xs },
  clear: { gap: space.xs, padding: space.l, borderRadius: radius.m, borderWidth: 1, borderStyle: "dashed", borderColor: color.rule },
  pill: { alignSelf: "flex-start", fontSize: 12, lineHeight: 16, paddingHorizontal: space.s, paddingVertical: 2, borderRadius: radius.pill, overflow: "hidden", fontFamily: font.semibold },
  plain: { backgroundColor: color.panelRaised, color: color.slateInk },
  safe: { backgroundColor: "rgba(255, 209, 228, 0.16)", color: color.screen },
  ok: { backgroundColor: color.screen, color: color.onScreen },
  bad: { backgroundColor: "rgba(255, 92, 147, 0.10)", color: color.tally },
  initial: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.panelRaised, alignItems: "center", justifyContent: "center" },
  initialText: { fontFamily: font.bold, fontSize: 17, color: color.screen },
  stuckBox: { gap: space.s, backgroundColor: "rgba(255, 92, 147, 0.1)", borderColor: "rgba(255, 92, 147, 0.45)" },
  stuck: { color: color.tally },
  fixes: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  field: {
    minHeight: TOUCH, paddingHorizontal: space.l, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.field, color: color.ink, fontFamily: font.regular, fontSize: 16,
  },
  fix: { flexGrow: 1, flexBasis: 150 },
});
