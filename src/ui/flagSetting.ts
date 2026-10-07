// An on/off setting kept as a small file ("on" or "off") in the app's own documents folder:
// not a secret, so not the Keychain, and a background task can read it with the phone locked.
// Read once when it is set up, written when it changes. Nothing else imported here, so it stays
// cheap to load early (index.ts brings in live progress before anything else).
import { File, Paths } from "expo-file-system";

export type FlagSetting = { get: () => boolean; set: (next: boolean) => void };

export function flagSetting(fileName: string, fallback: boolean): FlagSetting {
  const file = () => new File(Paths.document, fileName);
  let on = (() => {
    try {
      const f = file();
      if (!f.exists) return fallback;
      const text = f.textSync().trim();
      return text === "on" ? true : text === "off" ? false : fallback;
    } catch { return fallback; }
  })();
  return {
    get: () => on,
    set: (next) => {
      on = next;
      try { file().write(next ? "on" : "off"); } catch { /* stays for this run */ }
    },
  };
}
