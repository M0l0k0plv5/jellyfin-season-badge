# Jellyfin Season Badge

A small script that shows at a glance whether a season is complete in your Jellyfin library.

- **✓ 13** (green): all aired episodes of the season are present
- **11/13** (red): episodes are missing — hover for the exact count

Unaired episodes are ignored, so an ongoing season isn't flagged as incomplete.

<!-- ![Season badges](screenshot.png) -->

## Requirements

- Jellyfin 12.x (web client)
- A metadata provider that creates placeholders for missing episodes, enabled for your TV library (e.g. the TheTVDB plugin's *Missing Episode Fetcher*)
- **Display missing episodes within seasons** enabled in your user settings (Profile → Display)
- The [JavaScript Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector) plugin

If missing episodes don't show up inside a season in Jellyfin itself, the script has nothing to count.

## Installation

1. Install **JavaScript Injector** from the Jellyfin plugin catalog and restart Jellyfin.
2. Open the plugin settings, add a new script and paste the contents of [`season-badge.js`](season-badge.js).
3. Save and hard-refresh your browser (`Ctrl+Shift+R`).

## How it works

For each season card, the script asks the Jellyfin API for the series' episodes and counts per season:

- **have** — episodes with a file on disk
- **total** — have + missing episodes that have already aired

Results are cached for 60 seconds per series. Nothing is changed on the server; the script only reads data.

## Troubleshooting

- **No badges:** check that missing episodes are visible inside a season first. Then open the browser console (`F12`) and look for `[season-badge]` messages.
- **Every season shows as complete:** placeholders haven't been created yet. Run *Refresh metadata* on the series or library.
- **Badges gone after a Jellyfin update:** the web client's markup may have changed. Please open an issue with your Jellyfin version.

## Limitations

- Web client only. Native TV apps won't show badges.
- Episodes without an air date are treated as unaired.

## License

MIT
