#!/usr/bin/env bash
# VirusTotal's verdict on one release file: about 70 antivirus engines, and a public report
# people can check for themselves.
#   scripts/virustotal.sh <file>
# Prints one line: <flagged> <engines> <report url>, where flagged counts engines calling it
# malicious or suspicious. Looks the file up by SHA-256 first and uploads it only when
# VirusTotal hasn't seen it. Uploaded files are shared with VirusTotal's security partners,
# so only use it on files that are public anyway (the release's APK and IPA).
# Needs VIRUSTOTAL_API_KEY (a free account's key, in ~/.plexbie/release.env). The free API
# allows 4 requests a minute, so it waits between checks; a new file takes a few minutes.
set -euo pipefail
file="${1:?usage: scripts/virustotal.sh <file>}"
[[ -f "$file" ]] || { echo "No such file: $file" >&2; exit 1; }
[[ -n "${VIRUSTOTAL_API_KEY:-}" ]] || { echo "Set VIRUSTOTAL_API_KEY (in ~/.plexbie/release.env)." >&2; exit 1; }
API=https://www.virustotal.com/api/v3
sha=$(shasum -a 256 "$file" | cut -d' ' -f1)
report="https://www.virustotal.com/gui/file/$sha"

# The key goes to curl on stdin (a config line), never on its command line.
vt() { printf 'header = "x-apikey: %s"\n' "$VIRUSTOTAL_API_KEY" | curl -sS -K - "$@"; }
# stats <json>: "<flagged> <engines>" from a file's last_analysis_stats or an analysis' stats.
stats() {
  node -e '
    const d = JSON.parse(require("fs").readFileSync(0, "utf8")).data || {};
    const s = d.attributes?.last_analysis_stats || d.attributes?.stats;
    if (!s) process.exit(3);
    const flagged = (s.malicious || 0) + (s.suspicious || 0);
    console.log(flagged, flagged + (s.undetected || 0) + (s.harmless || 0));
  '
}

# Seen before (an earlier run, or the same file elsewhere)? Its latest analysis will do.
code=$(vt -o /tmp/vt-$$.json -w '%{http_code}' "$API/files/$sha")
if [[ "$code" == 200 ]] && out=$(stats < /tmp/vt-$$.json) && [[ "${out#* }" != 0 ]]; then
  rm -f /tmp/vt-$$.json; echo "$out $report"; exit 0
fi
rm -f /tmp/vt-$$.json
[[ "$code" == 200 || "$code" == 404 ]] || { echo "VirusTotal answered $code for the lookup (is the key right?)." >&2; exit 1; }

# Over 32 MB goes to a one-time upload address.
url="$API/files"
if (( $(stat -f%z "$file") > 32000000 )); then
  url=$(vt "$API/files/upload_url" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).data)')
fi
analysis=$(vt -F "file=@$file" "$url" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).data.id)')

for _ in $(seq 1 60); do          # up to 20 minutes
  sleep 20
  body=$(vt "$API/analyses/$analysis")
  if [[ "$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).data.attributes.status)' <<<"$body")" == completed ]]; then
    echo "$(stats <<<"$body") $report"; exit 0
  fi
done
echo "VirusTotal hadn't finished after 20 minutes: $report" >&2
exit 1
