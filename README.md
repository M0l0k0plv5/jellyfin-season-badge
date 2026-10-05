# Jellyfin Season Badge

Shows at a glance whether a season or series is complete in your Jellyfin library.

- **✓ 13** (green): all aired episodes are present
- **11/13** (red): episodes are missing — hover for the exact count

Badges appear on season posters and on series posters in the library. Series badges count all seasons except Specials (configurable). Unaired episodes are ignored, so an ongoing season isn't flagged as incomplete.

<!-- ![Season badges](screenshot.png) -->

## Requirements

- Jellyfin 12.x (web client)
- A metadata provider that creates placeholders for missing episodes, enabled for your TV library (e.g. the TheTVDB plugin's *Missing Episode Fetcher*)
- **Display missing episodes within seasons** enabled in your user settings (Profile → Display)

If missing episodes don't show up inside a season in Jellyfin itself, there is nothing to count.

## Installation (plugin, recommended)

The plugin injects the script into the web client through the [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) plugin, so no files of your Jellyfin installation are modified.

1. Dashboard → Plugins → Repositories → add both:
   - `https://www.iamparadox.dev/jellyfin/plugins/manifest.json`
   - `https://github.com/M0l0k0plv5/jellyfin-season-badge/releases/latest/download/manifest.json`
2. Catalog → install **File Transformation** and **Season Badge**.
3. Restart Jellyfin and hard-refresh your browser (`Ctrl+Shift+R`).

### Settings

Dashboard → Plugins → Season Badge:

- badges on season posters, series posters, or both
- count specials in series badges
- only show badges when episodes are missing
- badge position and colors
- enable or disable per TV library

Reload the web client after saving.

## Installation (script only)

No plugin, no settings: paste [`season-badge.js`](season-badge.js) into the [JavaScript Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector) plugin and hard-refresh your browser. Don't use both methods at the same time.

## How it works

For each season or series card on the page, the script asks the Jellyfin API for the series' episodes and counts:

- **have** — episodes with a file on disk
- **total** — have + missing episodes that have already aired

Results are cached for 60 seconds per series. Nothing is changed on the server; the script only reads data.

## Troubleshooting

- **No badges:** check that missing episodes are visible inside a season first. Make sure File Transformation is installed and the *Season Badge Startup* task ran (Dashboard → Scheduled Tasks). Then open the browser console (`F12`) and look for `[season-badge]` messages.
- **Every season shows as complete:** placeholders haven't been created yet. Run *Refresh metadata* on the series or library.
- **Badges gone after a Jellyfin update:** the web client's markup may have changed. Please open an issue with your Jellyfin version.

## Limitations

- Web client only. Native TV apps won't show badges.
- Episodes without an air date are treated as unaired.

## Building

```sh
dotnet publish src/Jellyfin.Plugin.SeasonBadge -c Release -o out
```

`./release.sh 1.2.3` builds the plugin and publishes a GitHub release with the zip and `manifest.json` (requires the .NET 10 SDK and `gh`).

## License

MIT
