// The Request tab: one search box for films, shows and books, three small dropdowns
// (Type, Language, Genre), and the results grouped, or things to browse when nothing's
// typed (features/search/Discover). The same as the website's Request page.
import { useEffect, useState } from "react";
import { Keyboard, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBarScrim } from "../../ui/StatusBarScrim";
import { ScreenTitle } from "../../ui/ScreenTitle";
import { Text } from "../../ui/Text";
import { color, font, radius, space, TOUCH } from "../../ui/theme";
import { RequestBody, type RequestType } from "./Discover";
import { Ambient, GlassFill, glass, TAB_BAR_CLEARANCE } from "../../ui/Glass";

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

const IOS = Platform.OS === "ios";

export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<RequestType>("all");
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 350);

  return (
    <View style={styles.page}>
      <Ambient />
      <ScrollView
        contentContainerStyle={[styles.list, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl + TAB_BAR_CLEARANCE }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.header}>
          <ScreenTitle>Request</ScreenTitle>
          <Text variant="body">Find a film, show or book and ask for it. An admin approves every request first.</Text>
          {/* On iOS the box is a glass capsule, as the system's own search fields are. */}
          <View style={[styles.field, glass.surface]}>
          <GlassFill radius={TOUCH / 2} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Films, shows and books"
            placeholderTextColor={color.faint}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search films, shows and books"
            style={[styles.input, IOS && styles.inputOnGlass]}
          />
          </View>
        </View>
        <RequestBody q={q} type={type} setType={setType} />
      </ScrollView>
      <StatusBarScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  list: { paddingHorizontal: space.l, gap: space.l },
  header: { gap: space.m },
  field: { borderRadius: TOUCH / 2 },
  input: {
    minHeight: TOUCH, paddingHorizontal: space.l, borderRadius: radius.pill, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.panel, color: color.ink, fontFamily: font.regular, fontSize: 16,
  },
  inputOnGlass: { backgroundColor: "transparent", borderWidth: 0 },
});
