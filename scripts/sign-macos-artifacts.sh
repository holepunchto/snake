#!/usr/bin/env bash
set -euo pipefail

app="${1:?Expected app bundle}"
dmg="${2:?Expected DMG}"

: "${MAC_CODESIGN_IDENTITY:?Missing macOS signing identity}"
: "${KEYCHAIN_PROFILE:?Missing notarization keychain profile}"

codesign --verify --deep --strict --verbose=2 "$app"
xcrun stapler validate "$app"
spctl --assess --type execute --verbose=2 "$app"

credentials=(--keychain-profile "$KEYCHAIN_PROFILE")
codesign --force --sign "$MAC_CODESIGN_IDENTITY" --timestamp "$dmg"
if ! result="$(xcrun notarytool submit "$dmg" "${credentials[@]}" --wait --output-format json)"; then
  printf '%s\n' "$result" >&2
  exit 1
fi
if ! jq -e '.status == "Accepted"' <<< "$result" > /dev/null; then
  printf '%s\n' "$result" >&2
  submission_id="$(jq -r '.id' <<< "$result")"
  xcrun notarytool log "$submission_id" "${credentials[@]}" >&2 || true
  exit 1
fi
xcrun stapler staple "$dmg"
xcrun stapler validate "$dmg"
codesign --verify --strict --verbose=2 "$dmg"
spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"
