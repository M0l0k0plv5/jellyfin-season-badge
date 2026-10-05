using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.SeasonBadge.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public bool ShowOnSeasons { get; set; } = true;

    public bool ShowOnSeries { get; set; } = true;

    public bool IncludeSpecials { get; set; }

    public bool HideComplete { get; set; }

    public bool HighlightMissingEpisodes { get; set; } = true;

    public string Position { get; set; } = "top-left";

    public string CompleteColor { get; set; } = "#2e7d32";

    public string IncompleteColor { get; set; } = "#c62828";

    public string[] ExcludedLibraryIds { get; set; } = Array.Empty<string>();

    public string[] ExcludedSeriesIds { get; set; } = Array.Empty<string>();
}
