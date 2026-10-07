// Manage → Messages: everything Plexbie has said to people (Discord DM, website alert,
// email) and whether it arrived, and what they sent Plexbie (a DM, "Something wrong?",
// answers on their ticket). Tap someone for the conversation, newest at the bottom.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { BackHandler, StyleSheet, TextInput, View } from "react-native";
import type { AppMessagePerson } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { useFocusHere } from "../../ui/announce";
import { Button } from "../../ui/Button";
import { PressableScale } from "../../ui/Pressable";
import { Text } from "../../ui/Text";
import { QueryGate } from "../../ui/QueryGate";
import { color, font, radius, space, TOUCH } from "../../ui/theme";
import { since } from "../requests/stage";
import { Heading, Initial, Pill, SearchField, card } from "./bits";
import { useMe } from "../me/useMe";
import { useAct, useAdminKey } from "./useAdmin";

const VIA: Record<string, string> = { discord: "Discord DM", web: "Website alert", email: "Email", none: "Not delivered" };
/** Where something a person sent Plexbie came from. */
const FROM: Record<string, string> = { discord: "Sent on Discord", web: "Sent on the website or app" };
const WHO = /^[dp][\w .@+-]{1,120}$/;      // the bot's own rule for a person's id

function dayLabel(iso: string) {
  const d = new Date(iso), today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Everyone with a conversation, kept fresh while Manage is open (also feeds "· 2 new"). */
export function useMessagePeople(enabled = true) {
  const client = useApi();
  return useQuery({ queryKey: useAdminKey()("messages"), queryFn: ({ signal }) => client.adminMessages(signal), refetchInterval: 60_000, enabled });
}

/** `who`: open on that conversation (an alert about a DM was tapped); `onClose` hears when
 *  it's closed, so it isn't opened again. `onComposerFocus` scrolls Manage to its end,
 *  where the reply box is, once the keyboard is up. */
export function MessagesSection({ who, onClose, onComposerFocus }: { who?: string; onClose?: () => void; onComposerFocus?: () => void }) {
  const people = useMessagePeople();
  const [openId, setOpen] = useState<string | null>(who ?? null);
  const [query, setQuery] = useState("");
  const open = people.data?.find((p) => p.id === openId) ?? null;
  if (open) return <Conversation person={open} onBack={() => { setOpen(null); onClose?.(); }} onComposerFocus={onComposerFocus} />;
  const rows = people.data;
  if (!rows) return <QueryGate query={people} errorTitle="Couldn’t load messages." height={220} />;
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((p) => p.name.toLowerCase().includes(q)) : rows;
  return (
    <>
      <Heading title="Messages" count={rows.length} />
      <Text variant="meta">Every message Plexbie sends someone and how it got there, and what they send Plexbie: DMs, “Something wrong?” and answers on their tickets. Kept for 90 days.</Text>
      {rows.length > 5 || query ? (
        <SearchField value={query} onChangeText={setQuery} />
      ) : null}
      {shown.map((p) => (
        <PressableScale key={p.id} haptic="none" onPress={() => setOpen(p.id)} style={[styles.person, p.unread > 0 && styles.unread]}
          accessibilityLabel={`${p.name}, ${p.count} messages from Plexbie${p.received ? `, ${p.received} from them` : ""}${p.failed ? `, ${p.failed} not delivered` : ""}. Last ${since(p.last.at)}${p.last.direction === "in" ? `, from ${p.name}` : ""}: ${p.last.text}`}>
          <Initial name={p.name} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.top}>
              <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{p.name}</Text>
              {p.unread ? <Pill label={`${p.unread} new`} tone="bad" /> : null}
              <Text variant="meta">{since(p.last.at)}</Text>
            </View>
            <Text variant="meta" numberOfLines={2}>{p.last.direction === "in" ? <Text variant="meta" style={styles.them}>{p.name.split(" ")[0]}: </Text> : null}{p.last.text}</Text>
            <View style={card.pills}>
              {p.via.map((v) => <Pill key={v} label={VIA[v] ?? v} />)}
              {p.failed ? <Pill label={`${p.failed} not delivered`} tone="bad" /> : null}
              {p.done && !p.unread ? <Pill label="Done" tone="safe" /> : null}
            </View>
          </View>
        </PressableScale>
      ))}
      {!shown.length ? <Text variant="meta">{q ? "Nobody matches." : "No messages yet."}</Text> : null}
    </>
  );
}

function Conversation({ person, onBack, onComposerFocus }: { person: AppMessagePerson; onBack: () => void; onComposerFocus?: () => void }) {
  const heading = useFocusHere(person.id);
  const client = useApi();
  const qc = useQueryClient();
  const key = useAdminKey()("messages");
  const valid = WHO.test(person.id);
  const res = useQuery({ queryKey: [...key, person.id], queryFn: ({ signal }) => client.conversation(person.id, signal), enabled: valid });
  const { isBusy, act } = useAct();
  const me = useMe().data?.user.name ?? "you";
  const [text, setText] = useState("");
  const reload = () => void qc.invalidateQueries({ queryKey: key });
  // Android Back closes the conversation, as "‹ Everyone" does, rather than leaving Manage.
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { onBack(); return true; });
    return () => sub.remove();
  }, [onBack]));
  const send = async () => {
    if (!text.trim()) return;
    const out = await act("send", () => client.messageReply(person.id, text.trim()), {
      failText: "Not sent", done: (o) => ({ text: "Sent as Plexbie", detail: o.message || undefined }) });
    // Sent or not, reload: one the bot refused is logged as not delivered. The text stays to retry.
    if (out) setText("");
    reload();
  };
  const done = async (yes: boolean) => {
    if (await act("done", () => client.messageDone(person.id, yes), { done: () => ({ text: yes ? "Marked done" : "Marked unread" }) })) reload();
  };
  const toTicket = async (id: string) => {
    if (await act(id, () => client.messageToTicket(id), { failText: "Not added", done: (o) => ({ text: "Added to their ticket", detail: o.message || undefined }),
      refresh: ["tickets"] })) reload();
  };
  const handled = !!person.done && !person.unread;
  let lastDay = "";
  return (
    <>
      <Button kind="secondary" label="‹ Everyone" onPress={onBack} style={{ alignSelf: "flex-start" }} accessibilityLabel="Back to everyone" />
      <View style={styles.head}>
        <Initial name={person.name} />
        <View style={{ flex: 1 }}>
          <Text ref={heading} variant="title" accessibilityRole="header">{person.name}</Text>
          <Text variant="meta">{person.count} message{person.count === 1 ? "" : "s"} from Plexbie{person.received ? ` · ${person.received} from ${person.name}` : ""}</Text>
          {person.done ? <Text variant="meta">Marked done{person.done.by ? ` by ${person.done.by}` : ""} {since(person.done.at)}</Text> : null}
        </View>
      </View>
      <Button kind="secondary" label={handled ? "Mark unread" : "Done"} busy={isBusy("done")} busyLabel="Saving…"
        onPress={() => void done(!handled)} style={{ alignSelf: "flex-start" }}
        accessibilityLabel={handled ? `Mark the conversation with ${person.name} unread` : `Mark the conversation with ${person.name} done`} />
      {!valid ? <Text variant="meta">This person’s messages can’t be opened here.</Text> : null}
      {valid && !res.data ? <QueryGate query={res} errorTitle="Couldn’t load this conversation." />
        : res.error ? <Text variant="body">{res.error.message}</Text> : null}
      {(res.data ?? []).map((m) => {
        const day = dayLabel(m.at);
        const showDay = day !== lastDay;
        lastDay = day;
        const incoming = m.direction === "in";
        const via = incoming ? FROM[m.channel] ?? VIA[m.channel] ?? m.channel : m.delivered ? VIA[m.channel] ?? m.channel
          : `${m.channel === "discord" ? "Discord DM didn’t arrive" : "Not delivered"}${m.error ? `: ${m.error}` : ""}`;
        return (
          <View key={m.id} style={{ gap: space.s }}>
            {showDay ? <Text variant="eyebrow" style={styles.day}>{day}</Text> : null}
            <View style={[styles.bubble, incoming && styles.incoming, !m.delivered && styles.failed]}>
              {/* One stop for a screen reader; the button beside it, so VoiceOver can reach it. */}
              <View style={styles.said} accessible
                accessibilityLabel={`${incoming ? person.name : "Plexbie"}: ${m.title ? `${m.title}. ` : ""}${m.text}. ${via}${m.by ? `. Sent by ${m.by}` : ""}${incoming && m.ticket ? ". On their ticket" : ""}`}>
                <View style={styles.top}>
                  <Text variant="label" style={incoming ? styles.ink : styles.plexbie}>{incoming ? person.name : "Plexbie"}</Text>
                  <Text variant="meta">{new Date(m.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
                </View>
                {m.title ? <Text variant="label">{m.title}</Text> : null}
                <Text variant="body" style={styles.ink}>{m.text}</Text>
                <Pill label={via} tone={m.delivered ? "plain" : "bad"} />
                {m.by ? <Text variant="meta">Sent by {m.by}</Text> : null}
                {incoming && m.ticket ? <Text variant="meta">On their ticket</Text> : null}
              </View>
              {incoming && !m.ticket && person.ticket && m.context === "Discord DM" ? (
                <Button kind="secondary" label={`Add to their ticket on ${person.ticket.title}`} busy={isBusy(m.id)} busyLabel="Adding…"
                  onPress={() => void toTicket(m.id)} style={{ alignSelf: "flex-start" }} />
              ) : null}
            </View>
          </View>
        );
      })}
      {res.data && !res.data.length ? <Text variant="meta">No messages kept for {person.name}.</Text> : null}
      {valid ? (
        <View style={styles.composer}>
          <Text variant="label" nativeID="reply-as-plexbie">Message {person.name} as Plexbie</Text>
          <TextInput value={text} onChangeText={setText} multiline maxLength={1500} onFocus={onComposerFocus}
            placeholder="Type a message" placeholderTextColor={color.faint}
            accessibilityLabel={`Message ${person.name} as Plexbie`} accessibilityLabelledBy="reply-as-plexbie" style={styles.reply} />
          <Text variant="meta">{person.id.startsWith("d") ? "A Discord DM from Plexbie" : "A phone alert, else an email"}, signed “— {me} (admin)”</Text>
          <Button label="Send as Plexbie" busy={isBusy("send")} busyLabel="Sending…" disabled={!text.trim()} onPress={() => void send()} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: "row", gap: space.m, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel },
  top: { flexDirection: "row", alignItems: "center", gap: space.s },
  head: { flexDirection: "row", alignItems: "center", gap: space.m },
  day: { alignSelf: "center", marginTop: space.s },
  bubble: { gap: space.xs, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel },
  said: { gap: space.xs },
  failed: { borderWidth: 1, borderColor: color.tally },
  incoming: { marginLeft: space.xl, backgroundColor: "rgba(255, 209, 228, 0.1)", borderWidth: 1, borderColor: "rgba(255, 209, 228, 0.25)" },
  them: { color: color.screen, fontFamily: font.semibold },
  plexbie: { color: color.screen },
  unread: { borderWidth: 1, borderColor: "rgba(255, 92, 147, 0.5)" },
  composer: { gap: space.s, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel, borderWidth: 1, borderColor: "rgba(255, 209, 228, 0.35)" },
  reply: {
    minHeight: TOUCH * 2, padding: space.m, borderRadius: radius.m, borderWidth: 1.5, borderColor: "rgba(255, 209, 228, 0.6)",
    backgroundColor: color.field, color: color.ink, fontFamily: font.regular, fontSize: 16, textAlignVertical: "top",
  },
  ink: { color: color.ink },
});
