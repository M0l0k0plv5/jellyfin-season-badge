using System.Text.Json;
using Jellyfin.Plugin.SeasonBadge.Configuration;

namespace Jellyfin.Plugin.SeasonBadge;

/// <summary>
/// Payload passed in by the File Transformation plugin.
/// </summary>
public class PatchRequestPayload
{
    public string? Contents { get; set; }
}

/// <summary>
/// Callbacks invoked by the File Transformation plugin via reflection.
/// </summary>
public static class Transformations
{
    private const string Marker = "<!-- season-badge -->";

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private static readonly Lazy<string> Script = new(() =>
    {
        using Stream stream = typeof(Plugin).Assembly.GetManifestResourceStream("SeasonBadge.js")
            ?? throw new InvalidOperationException("SeasonBadge.js resource missing");
        using StreamReader reader = new(stream);
        return reader.ReadToEnd();
    });

    public static string IndexHtml(PatchRequestPayload payload)
    {
        string html = payload.Contents ?? string.Empty;
        if (html.Contains(Marker, StringComparison.Ordinal))
        {
            return html;
        }

        int index = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        if (index < 0)
        {
            return html;
        }

        PluginConfiguration cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        string json = JsonSerializer.Serialize(
            new
            {
                cfg.ShowOnSeasons,
                cfg.ShowOnSeries,
                cfg.IncludeSpecials,
                cfg.HideComplete,
                cfg.Position,
                cfg.CompleteColor,
                cfg.IncompleteColor,
                cfg.ExcludedLibraryIds
            },
            JsonOptions);

        string injection = Marker
            + "<script>window.SeasonBadgeConfig=" + json + ";</script>"
            + "<script>" + Script.Value + "</script>";

        return html.Insert(index, injection);
    }
}
