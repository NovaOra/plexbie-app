// Manage → Discord: a live watch party, posting as Plexbie in a channel (mass pings off
// unless switched on, and then it asks first), and who brought whom.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SwitchRow } from "../../ui/SwitchRow";
import { useApi } from "../../auth/session";
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/Confirm";
import { Chip } from "../../ui/Chip";
import { Text } from "../../ui/Text";
import { color, font, radius, space, TOUCH } from "../../ui/theme";
import { since } from "../requests/stage";
import { Heading, Initial, Pill, card } from "./bits";
import { useAct, useAdminKey } from "./useAdmin";
import { GlassFill, glass } from "../../ui/Glass";

export function DiscordSection() {
  const confirm = useConfirm();
  const client = useApi();
  const discord = useQuery({ queryKey: useAdminKey()("discord"), queryFn: ({ signal }) => client.adminDiscord(signal), staleTime: 30_000 });
  const { act } = useAct();
  const [channel, setChannel] = useState("");
  const [text, setText] = useState("");
  const [pings, setPings] = useState(false);
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const d = discord.data;
  if (!d) {
    return discord.error ? <Text variant="body">{discord.error.message}</Text> : <View style={[card.box, { height: 220 }]} />;
  }
  const chosen = channel || d.channels[0]?.id || "";
  const post = async () => {
    setSending(true);
    const out = await act(null, () => client.say(chosen, text.trim(), pings), { done: (o) => ({ text: "Posted as Plexbie", detail: o.message || undefined }), failText: "Not posted" });
    setSending(false);
    if (out) { setText(""); setPings(false); }
  };
  const send = () => {
    if (!text.trim() || !chosen) return;
    if (pings) {
      confirm("Ping everyone?", "@everyone and role mentions in this message will notify people.", [
        { text: "Cancel", style: "cancel" }, { text: "Post it", onPress: () => void post() },
      ]);
    } else void post();
  };
  const q = query.trim().toLowerCase();
  const joins = q ? d.joins.filter((j) => `${j.who} ${j.by} ${j.code ?? ""}`.toLowerCase().includes(q)) : d.joins;

  return (
    <>
      <Heading title="Watch party" />
      {d.party ? (
        <View style={[card.box, glass.surface, styles.party]}>
          <GlassFill radius={radius.m} />
          <Text variant="eyebrow" style={styles.liveText}>Live{d.party.startedAt ? ` · started ${since(d.party.startedAt)}` : ""}</Text>
          <Text variant="title">{d.party.title ?? "Something on Plex"}</Text>
          <Text variant="meta">{d.party.streamer} is streaming{d.party.channel ? ` in ${d.party.channel}` : ""}.</Text>
          <View style={card.pills}>{d.party.people.map((n) => <Pill key={n} label={n} />)}</View>
        </View>
      ) : <Text variant="meta">No watch party right now. One starts on its own when someone streams Plex in the Watch Party voice channel.</Text>}

      <Heading title="Say something as Plexbie" />
      <View style={[card.box, glass.surface]}>
        <GlassFill radius={radius.m} />
        <Text variant="label">Channel</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Channel">
          {d.channels.map((c) => <Chip key={c.id} label={`#${c.name}`} selected={chosen === c.id} onPress={() => setChannel(c.id)} />)}
        </ScrollView>
        <TextInput value={text} onChangeText={setText} multiline maxLength={2000} placeholder="Movie night Friday at 8!"
          placeholderTextColor={color.faint} accessibilityLabel="Message" style={styles.message} />
        <Text variant="meta">{text.length}/2000</Text>
        <SwitchRow label="Allow @everyone and role pings" value={pings} onValueChange={setPings}>
          <Text variant="label">Allow @everyone and role pings</Text>
          <Text variant="meta">Off: those show as plain text and notify nobody.</Text>
        </SwitchRow>
        <Button label="Post it" busy={sending} busyLabel="Posting…" disabled={!text.trim() || !chosen} onPress={send} />
      </View>

      <Heading title="Who brought whom" />
      <Text variant="meta">Discord invites people used to join the server, and Plexbie invite links people used to get on Plex.</Text>
      {d.joins.length > 5 ? (
        <TextInput value={query} onChangeText={setQuery} placeholder="Find someone" placeholderTextColor={color.faint}
          autoCorrect={false} autoCapitalize="none" accessibilityLabel="Find someone" style={styles.search} />
      ) : null}
      {joins.map((j, i) => (
        <View key={`${j.who}-${j.at}-${i}`} style={styles.log}>
          <Initial name={j.who} />
          <View style={{ flex: 1 }}>
            <Text variant="label">{j.who} <Text variant="meta">invited by {j.by}</Text></Text>
            <Text variant="meta">
              {j.via === "plexbie" ? `Invite link “${j.code}”` : `Discord code ${j.code}`}{j.role ? ` · got ${j.role}` : ""}{j.at ? ` · ${since(j.at)}` : ""}
            </Text>
          </View>
        </View>
      ))}
      {!joins.length ? <Text variant="meta">{q ? "Nobody matches." : "No invites recorded yet."}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  party: { borderColor: color.tally },
  liveText: { color: color.tally },
  chips: { gap: space.s, paddingVertical: space.xs },
  message: {
    minHeight: 110, padding: space.m, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate, backgroundColor: color.field,
    color: color.ink, fontFamily: font.regular, fontSize: 16, textAlignVertical: "top",
  },
  search: {
    minHeight: TOUCH, paddingHorizontal: space.l, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.field, color: color.ink, fontFamily: font.regular, fontSize: 16,
  },
  log: { flexDirection: "row", alignItems: "center", gap: space.m },
});
