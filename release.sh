#!/bin/sh
# Usage: ./release.sh 1.0.0
set -e
V="${1:?usage: ./release.sh 1.0.0}"
VERSION="$V.0"
ZIP="season-badge_$VERSION.zip"
REPO="M0l0k0plv5/jellyfin-season-badge"
export PATH="/usr/local/share/dotnet:$PATH"
rm -rf out "$ZIP" manifest.json
dotnet publish src/Jellyfin.Plugin.SeasonBadge -c Release -o out -p:Version="$VERSION"
(cd out && zip -q "../$ZIP" Jellyfin.Plugin.SeasonBadge.dll)
python3 - "$VERSION" "$ZIP" "$REPO" "v$V" <<'PY'
import datetime, hashlib, json, sys
version, zip_name, repo, tag = sys.argv[1:5]
checksum = hashlib.md5(open(zip_name, "rb").read()).hexdigest()
json.dump([{
    "guid": "4298b1d5-858b-4417-98aa-bb6c6895b61c",
    "name": "Season Badge",
    "overview": "Completeness badges on season and series posters",
    "description": "Shows on season and series posters whether all aired episodes are in your library, and highlights missing episodes. Requires the File Transformation plugin.",
    "owner": repo.split("/")[0],
    "category": "General",
    "imageUrl": f"https://raw.githubusercontent.com/{repo}/main/logo.png",
    "versions": [{
        "version": version,
        "changelog": f"https://github.com/{repo}/releases/tag/{tag}",
        "targetAbi": "12.0.0.0",
        "sourceUrl": f"https://github.com/{repo}/releases/download/{tag}/{zip_name}",
        "checksum": checksum,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }],
}], open("manifest.json", "w"), indent=2)
PY
git tag -f "v$V" && git push -q -f origin "v$V"
gh release create "v$V" "$ZIP" manifest.json --title "v$V" --generate-notes
rm -rf out "$ZIP" manifest.json
