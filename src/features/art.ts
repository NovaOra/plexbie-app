// Poster addresses as the bot gives them, turned into something expo-image can load.
// The bot's own image proxy (/img/...) is for signed-in members, so those requests carry
// the session token as a header, the same way every API call does, and only ever to the
// server the token came from. Anything that doesn't look like a poster address is ignored.
import type { ImageSource } from "expo-image";
import { useSession } from "../auth/session";

/** The bot's image proxy, with the small query it adds (a cache version, Plex's ?p=&w=). */
const PROXY = /^\/img\/[A-Za-z0-9/_.-]+(\?[A-Za-z0-9=&%_.~-]*)?$/;
const TMDB = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i;
const OPEN_LIBRARY = /^ol:\d+$/;

export function useArt() {
  const { state } = useSession();
  const server = state.phase === "signedIn" && !state.sample ? state.server : null;
  const token = state.phase === "signedIn" ? state.token : null;
  return (poster: string | null | undefined, size: "w185" | "w342" | "w780" = "w342"): ImageSource | null => {
    if (!poster || poster.includes("..") || poster.includes("//", poster.startsWith("https://") ? 8 : 0)) return null;
    if (poster.startsWith("https://")) return { uri: poster };          // a public poster: no token
    if (PROXY.test(poster)) {
      if (!server) return null;
      // Cached under this server's address, so another server's /img/… never stands in for it.
      // X-Plexbie as on every API call: the bot accepts the token only together with it.
      return { uri: `${server}${poster}`, headers: token ? { Authorization: `Bearer ${token}`, "X-Plexbie": "1" } : undefined, cacheKey: `${server}${poster}` };
    }
    if (OPEN_LIBRARY.test(poster)) return { uri: `https://covers.openlibrary.org/b/id/${poster.slice(3)}-${size === "w185" ? "M" : "L"}.jpg` };
    if (TMDB.test(poster)) return { uri: `https://image.tmdb.org/t/p/${size}${poster}` };
    return null;
  };
}
