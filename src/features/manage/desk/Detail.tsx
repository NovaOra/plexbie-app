// One thing from the queue in full: on a phone, a sheet that rises over the desk; on a
// wide screen, a pane beside the queue. Its main key is the sheet's one pink key, its next
// a quiet pill; a ticket or a request shows its own page's insides under them.
import { router } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../../ui/Button";
import { HoldButton } from "../../../ui/HoldButton";
import { KeyRow } from "../../../ui/KeyRow";
import { Text } from "../../../ui/Text";
import { color, radius, space } from "../../../ui/theme";
import { since } from "../../requests/stage";
import { AdminRequestBody } from "../AdminRequestScreen";
import { AdminTicketBody } from "../AdminTicketScreen";
import { BlockedImport } from "../BlockedImport";
import { ItemArt, type OpenFull } from "./Queue";
import type { Item } from "./manageQueue";
import type { DeskActions } from "./useDeskActions";

/** The phone's sheet: over the desk (not a modal, so a page opened from it lands on top). */
export function DetailSheet({ item, a, full, onClose }: { item: Item; a: DeskActions; full: OpenFull; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  // Android's Back closes the sheet, rather than leaving Manage.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Back to the queue" />
      </Animated.View>
      <Animated.View entering={SlideInDown.duration(240)} exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { top: insets.top + space.xl }]} accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <View style={styles.grab} />
        <ScrollView contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <View style={styles.grow}>{ownHead(item) ? null : <Hero item={item} />}</View>
            <Button kind="quiet" label="Close" onPress={onClose} haptic="none" accessibilityLabel="Back to the queue" />
          </View>
          <DetailBody item={item} a={a} full={(tab, who) => { onClose(); full(tab, who); }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/** The wide screen's pane beside the queue. */
export function DetailPane({ item, a, full }: { item: Item; a: DeskActions; full: OpenFull }) {
  return (
    <View style={styles.pane}>
      {ownHead(item) ? null : <Hero item={item} />}
      <DetailBody item={item} a={a} full={full} />
    </View>
  );
}

/** A ticket or a request shows its own page's head (title, poster, who asked), so no second one. */
const ownHead = (item: Item) => ["ticket", "request", "stuck"].includes(item.src.type) && item.group !== "done";

function Hero({ item }: { item: Item }) {
  return (
    <View style={styles.hero}>
      <ItemArt item={item} />
      <View style={styles.grow}>
        <Text variant="eyebrow" style={item.group === "urgent" ? styles.urgent : undefined}>{item.eyebrow}{item.age ? ` · ${item.age}` : ""}</Text>
        <Text variant="heading" accessibilityRole="header">{item.title}</Text>
        {item.sub ? <Text variant="meta">{item.sub}</Text> : null}
      </View>
    </View>
  );
}

function Facts({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <View style={styles.facts}>
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <View key={k} style={styles.fact} accessible accessibilityLabel={`${k}: ${v}`}>
          <Text variant="eyebrow" style={styles.factKey}>{k}</Text>
          <Text variant="body" style={styles.ink}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

function DetailBody({ item, a, full }: { item: Item; a: DeskActions; full: OpenFull }) {
  const src = item.src;
  const busy = a.busy(item.key);
  const acts = (...keys: ReactNode[]) => <KeyRow>{keys.filter(Boolean)}</KeyRow>;
  const key = (label: string, onPress: () => unknown, guarded = true) =>
    <Button key={label} label={label} busy={guarded && busy} onPress={() => void onPress()} />;
  const pill = (label: string, onPress: () => unknown) => <Button key={label} kind="quiet" label={label} onPress={() => void onPress()} />;
  const hold = (label: string, run: () => unknown) =>
    <HoldButton key={label} kind="quiet" label={label} blocked={busy} onConfirm={() => void run()} accessibilityLabel={`${label} ${item.title}`} />;
  switch (src.type) {
    case "ticket":
      return (
        <>
          {item.group === "waiting" ? acts(pill("Stop waiting", () => a.reopen(src.t))) : null}
          <AdminTicketBody id={src.t.id} embedded />
          {pill("Open the full ticket", () => router.push({ pathname: "/manage-ticket/[id]", params: { id: src.t.id } }))}
        </>
      );
    case "import":
      return (
        <>
          {acts(pill("All blocked imports", () => full("health")))}
          <BlockedImport target={{ app: src.b.app, downloadId: src.b.downloadId }} />
        </>
      );
    case "request":
      if (item.group === "done") {
        return (
          <>
            {acts(pill("All requests", () => full("all")))}
            <Facts rows={[["Asked", `${since(src.r.requestedAt)} by ${src.r.requester}`],
              [src.r.status === "approved" ? "Approved" : "Declined", src.r.resolvedAt ? `${since(src.r.resolvedAt)}${src.r.resolvedBy ? ` by ${src.r.resolvedBy}` : ""}` : null]]} />
          </>
        );
      }
      return (
        <>
          {acts(key("Approve", () => a.approve(src.r, true)), hold("Decline", () => a.approve(src.r, false)))}
          <AdminRequestBody id={src.r.id} embedded />
        </>
      );
    case "stuck":
      return (
        <>
          {acts(["tv", "movie"].includes(src.r.title.kind) ? key("Search again", () => a.searchRequest(src.r)) : null, pill("All requests", () => full("all")))}
          <AdminRequestBody id={src.r.id!} embedded />
        </>
      );
    case "chat":
      return (
        <>
          {acts(item.group === "done" ? key("Mark unread", () => a.chatDone(src.p, false)) : key("Done", () => a.chatDone(src.p, true)),
            pill("Reply", () => full("messages", src.p.id)))}
          <Facts rows={[[src.p.last.direction === "in" ? `${src.p.name} said` : "Plexbie said", src.p.last.text], ["When", since(src.p.last.at)]]} />
        </>
      );
    case "join":
      return (
        <>
          {src.j.messageId ? acts(key("Invite to Plex", () => a.invite(src.j, true)), hold("Deny", () => a.invite(src.j, false)))
            : acts(pill("Join requests", () => full("joins")))}
          {src.j.messageId ? null : <Text variant="meta">Answer this one in Discord.</Text>}
          <Facts rows={[["Asked", since(src.j.askedAt)], ["How", src.j.via === "plex" ? "Signed in with Plex" : "On Discord"],
            ["Plex invite to", src.j.email || (src.j.via === "plex" ? "Their Plex account" : null)]]} />
        </>
      );
    case "person": {
      const p = src.p;
      return (
        <>
          {acts(key("Never remove", () => a.keepPerson(p)), pill("People", () => full("people")))}
          <Facts rows={[["Removal", p.removalIn ? `In ${days(p.removalIn)}, nothing watched in ${days(p.daysIdle)}` : "Due now"],
            ["Last watched", p.lastWatched ? since(p.lastWatched) : "No watch recorded"], ["Discord", p.discordName], ["Warned", p.warned ? "Yes" : null]]} />
        </>
      );
    }
    case "leaving":
      return (
        <>
          {acts(key("Keep it", () => a.keepTitle(src.c)), pill("Leaving soon", () => full("cleanup")))}
          <Facts rows={[["Leaves in", days(src.c.daysLeft)], ["Why", src.c.reason], ["Type", src.c.type === "show" ? "TV" : "Film"]]} />
        </>
      );
    case "link":
      return (
        <>
          {acts(pill("Invite links", () => full("invites")), hold("Cancel", () => a.cancelLink(src.i)))}
          <Facts rows={[["Made", `${since(src.i.createdAt)} by ${src.i.createdBy ?? "an admin"}`], ["Locked to", src.i.email]]} />
          <Text variant="meta">The link itself is only shown once, when it’s made. To send it again, make a new one under Invites.</Text>
        </>
      );
    case "plexinvite":
      return (
        <>
          {src.i.email ? acts(pill("Change email", () => full("invites")), hold("Cancel", () => a.cancelPlex(src.i))) : acts(pill("Waiting on Plex", () => full("invites")))}
          {src.i.email ? null : <Text variant="meta">Sent to a Plex username, so change or cancel it on plex.tv.</Text>}
          <Facts rows={[["Sent", since(src.i.sentAt)], ["To", src.i.email || src.i.name]]} />
        </>
      );
    case "down":
      return (
        <>
          {acts(key("Check again", () => a.checkAgain(src.h)), pill("Services", () => full("health")))}
          <Text variant="body" style={styles.ink}>{src.h.detail ?? "Not answering."}</Text>
        </>
      );
  }
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  ink: { color: color.ink },
  urgent: { color: color.tally },
  scrim: { flex: 1, backgroundColor: "rgba(6, 9, 20, 0.72)" },
  // A floating thing: the float shadow, rounded at the top, the sheet's colours.
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: color.field, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l,
    borderTopWidth: 1, borderColor: color.rule, elevation: 16, shadowColor: "#030612", shadowOpacity: 0.7, shadowRadius: 20, shadowOffset: { width: 0, height: -6 },
  },
  grab: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: color.slate, marginTop: space.s },
  sheetBody: { padding: space.l, gap: space.l },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.m },
  pane: { flex: 1, gap: space.l, padding: space.l, borderRadius: radius.l, backgroundColor: color.panel },
  hero: { flexDirection: "row", gap: space.m, alignItems: "flex-start" },
  facts: { gap: space.m },
  fact: { gap: 2 },
  factKey: { color: color.faint },
});
