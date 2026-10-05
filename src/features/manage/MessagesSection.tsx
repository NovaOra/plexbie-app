// Manage → Messages: everything Plexbie has said to people (Discord DM, website alert,
// email) and whether it arrived. Tap someone for their messages, newest at the bottom.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import type { AppMessagePerson } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { useFocusHere } from "../../ui/announce";
import { Button } from "../../ui/Button";
import { PressableScale } from "../../ui/Pressable";
import { Text } from "../../ui/Text";
import { color, font, radius, space, TOUCH } from "../../ui/theme";
import { since } from "../requests/stage";
import { Heading, Initial, Pill, card } from "./bits";
import { useAdminKey } from "./useAdmin";

const VIA: Record<string, string> = { discord: "Discord DM", web: "Website alert", email: "Email", none: "Not delivered" };
const WHO = /^[dp][\w .@+-]{1,120}$/;      // the bot's own rule for a person's id

function dayLabel(iso: string) {
  const d = new Date(iso), today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function MessagesSection() {
  const client = useApi();
  const people = useQuery({ queryKey: useAdminKey()("messages"), queryFn: ({ signal }) => client.adminMessages(signal), staleTime: 30_000 });
  const [open, setOpen] = useState<AppMessagePerson | null>(null);
  const [query, setQuery] = useState("");
  if (open) return <Conversation person={open} onBack={() => setOpen(null)} />;
  const rows = people.data;
  if (!rows) return people.error ? <Text variant="body">{people.error.message}</Text> : <View style={[card.box, { height: 220 }]} />;
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((p) => p.name.toLowerCase().includes(q)) : rows;
  return (
    <>
      <Heading title="What Plexbie said" count={rows.length} />
      <Text variant="meta">Every message Plexbie sends someone, and how it got there. Kept for 90 days.</Text>
      {rows.length > 5 ? (
        <TextInput value={query} onChangeText={setQuery} placeholder="Find someone" placeholderTextColor={color.faint}
          autoCorrect={false} autoCapitalize="none" accessibilityLabel="Find someone" style={styles.search} />
      ) : null}
      {shown.map((p) => (
        <PressableScale key={p.id} haptic="none" onPress={() => setOpen(p)} style={styles.person}
          accessibilityLabel={`${p.name}, ${p.count} messages${p.failed ? `, ${p.failed} not delivered` : ""}. Last ${since(p.last.at)}: ${p.last.text}`}>
          <Initial name={p.name} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.top}>
              <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{p.name}</Text>
              <Text variant="meta">{since(p.last.at)}</Text>
            </View>
            <Text variant="meta" numberOfLines={2}>{p.last.text}</Text>
            <View style={card.pills}>
              {p.via.map((v) => <Pill key={v} label={VIA[v] ?? v} />)}
              {p.failed ? <Pill label={`${p.failed} not delivered`} tone="bad" /> : null}
            </View>
          </View>
        </PressableScale>
      ))}
      {!shown.length ? <Text variant="meta">{q ? "Nobody matches." : "Plexbie hasn’t messaged anyone yet."}</Text> : null}
    </>
  );
}

function Conversation({ person, onBack }: { person: AppMessagePerson; onBack: () => void }) {
  const heading = useFocusHere(person.id);
  const client = useApi();
  const key = useAdminKey()("messages");
  const valid = WHO.test(person.id);
  const res = useQuery({ queryKey: [...key, person.id], queryFn: ({ signal }) => client.conversation(person.id, signal), enabled: valid });
  let lastDay = "";
  return (
    <>
      <Button kind="secondary" label="‹ Everyone" onPress={onBack} style={{ alignSelf: "flex-start" }} accessibilityLabel="Back to everyone" />
      <View style={styles.head}>
        <Initial name={person.name} />
        <View style={{ flex: 1 }}>
          <Text ref={heading} variant="title" accessibilityRole="header">{person.name}</Text>
          <Text variant="meta">{person.count} message{person.count === 1 ? "" : "s"} from Plexbie</Text>
        </View>
      </View>
      {!valid ? <Text variant="meta">This person’s messages can’t be opened here.</Text> : null}
      {res.error ? <Text variant="body">{res.error.message}</Text> : null}
      {valid && !res.data && !res.error ? <View style={[card.box, { height: 160 }]} /> : null}
      {(res.data ?? []).map((m) => {
        const day = dayLabel(m.at);
        const showDay = day !== lastDay;
        lastDay = day;
        return (
          <View key={m.id} style={{ gap: space.s }}>
            {showDay ? <Text variant="eyebrow" style={styles.day}>{day}</Text> : null}
            <View style={[styles.bubble, !m.delivered && styles.failed]} accessible
              accessibilityLabel={`${m.title ? `${m.title}. ` : ""}${m.text}. ${m.delivered ? VIA[m.channel] ?? m.channel : `Not delivered${m.error ? `: ${m.error}` : ""}`}`}>
              <View style={styles.top}>
                <Text variant="label" style={styles.plexbie}>Plexbie</Text>
                <Text variant="meta">{new Date(m.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
              </View>
              {m.title ? <Text variant="label">{m.title}</Text> : null}
              <Text variant="body" style={styles.ink}>{m.text}</Text>
              <Pill label={m.delivered ? VIA[m.channel] ?? m.channel : `${m.channel === "discord" ? "Discord DM didn’t arrive" : "Not delivered"}${m.error ? `: ${m.error}` : ""}`}
                tone={m.delivered ? "plain" : "bad"} />
            </View>
          </View>
        );
      })}
      {res.data && !res.data.length ? <Text variant="meta">No messages kept for {person.name}.</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  search: {
    minHeight: TOUCH, paddingHorizontal: space.l, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.field, color: color.ink, fontFamily: font.regular, fontSize: 16,
  },
  person: { flexDirection: "row", gap: space.m, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel },
  top: { flexDirection: "row", alignItems: "center", gap: space.s },
  head: { flexDirection: "row", alignItems: "center", gap: space.m },
  day: { alignSelf: "center", marginTop: space.s },
  bubble: { gap: space.xs, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel },
  failed: { borderWidth: 1, borderColor: color.tally },
  plexbie: { color: color.screen },
  ink: { color: color.ink },
});
