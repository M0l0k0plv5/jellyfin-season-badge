using System.Text.Json.Serialization;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.SeasonBadge.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SeasonBadge.Api;

public record BadgeResult(
    [property: JsonPropertyName("have")] int Have,
    [property: JsonPropertyName("total")] int Total);

public record HealthResult(
    [property: JsonPropertyName("missingEpisodes")] int MissingEpisodes);

public record IncompleteSeason(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("index")] int? Index,
    [property: JsonPropertyName("have")] int Have,
    [property: JsonPropertyName("total")] int Total);

public record MissingEpisodeResult(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("season")] int? Season,
    [property: JsonPropertyName("episode")] int? Episode,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("airDate")] string? AirDate);

public record IncompleteSeries(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("year")] int? Year,
    [property: JsonPropertyName("have")] int Have,
    [property: JsonPropertyName("total")] int Total,
    [property: JsonPropertyName("seasons")] IReadOnlyList<IncompleteSeason> Seasons,
    [property: JsonPropertyName("missing")] IReadOnlyList<MissingEpisodeResult> Missing);

/// <summary>
/// Returns badge counts for many seasons and series in one request.
/// </summary>
[ApiController]
[Authorize]
[Route("SeasonBadge")]
public class SeasonBadgeController : ControllerBase
{
    private const int MaxIds = 200;

    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly StatsService _stats;

    public SeasonBadgeController(ILibraryManager libraryManager, IUserManager userManager, StatsService stats)
    {
        _libraryManager = libraryManager;
        _userManager = userManager;
        _stats = stats;
    }

    /// <summary>
    /// Gets have/total counts for the given season and series ids (comma separated).
    /// </summary>
    [HttpGet("Stats")]
    public ActionResult<Dictionary<string, BadgeResult>> GetStats([FromQuery] string? ids)
    {
        User? user = GetUser();
        if (user is null)
        {
            return Unauthorized();
        }

        PluginConfiguration cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        HashSet<Guid> excludedLibraries = ToGuids(cfg.ExcludedLibraryIds);
        HashSet<Guid> excludedSeries = ToGuids(cfg.ExcludedSeriesIds);
        Dictionary<string, BadgeResult> result = new();

        string[] requested = (ids ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (string raw in requested.Take(MaxIds))
        {
            if (!Guid.TryParse(raw, out Guid id))
            {
                continue;
            }

            BaseItem? item = _libraryManager.GetItemById(id);
            Series? series = item switch
            {
                Series s => s,
                Season season => _libraryManager.GetItemById(season.SeriesId != Guid.Empty ? season.SeriesId : season.FindSeriesId()) as Series,
                _ => null
            };

            if (item is null || series is null || !item.IsVisible(user) || excludedSeries.Contains(series.Id))
            {
                continue;
            }

            if (excludedLibraries.Count > 0
                && _libraryManager.GetCollectionFolders(series).Any(f => excludedLibraries.Contains(f.Id)))
            {
                continue;
            }

            SeriesStats stats = _stats.GetSeriesStats(series, user);
            Counts? counts = item is Series
                ? stats.ForSeries(cfg.IncludeSpecials)
                : stats.Seasons.GetValueOrDefault(item.Id);

            if (counts is not null && counts.Total > 0)
            {
                result[raw] = new BadgeResult(counts.Have, counts.Total);
            }
        }

        return result;
    }

    /// <summary>
    /// Lists every series with missing aired episodes, most missing first.
    /// </summary>
    [HttpGet("Incomplete")]
    public ActionResult<List<IncompleteSeries>> GetIncomplete()
    {
        User? user = GetUser();
        if (user is null)
        {
            return Unauthorized();
        }

        PluginConfiguration cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        HashSet<Guid> excludedLibraries = ToGuids(cfg.ExcludedLibraryIds);
        HashSet<Guid> excludedSeries = ToGuids(cfg.ExcludedSeriesIds);
        List<IncompleteSeries> result = new();

        IReadOnlyList<BaseItem> allSeries = _libraryManager.GetItemList(new InternalItemsQuery(user)
        {
            IncludeItemTypes = new[] { BaseItemKind.Series },
            Recursive = true
        });

        foreach (BaseItem item in allSeries)
        {
            if (item is not Series series || excludedSeries.Contains(series.Id))
            {
                continue;
            }

            if (excludedLibraries.Count > 0
                && _libraryManager.GetCollectionFolders(series).Any(f => excludedLibraries.Contains(f.Id)))
            {
                continue;
            }

            SeriesStats stats = _stats.GetSeriesStats(series, user);
            Counts counts = stats.ForSeries(cfg.IncludeSpecials);
            if (counts.Total == 0 || counts.Have >= counts.Total)
            {
                continue;
            }

            List<IncompleteSeason> seasons = new();
            foreach (KeyValuePair<Guid, Counts> entry in stats.Seasons)
            {
                if (entry.Value.Have >= entry.Value.Total)
                {
                    continue;
                }

                BaseItem? season = _libraryManager.GetItemById(entry.Key);
                int? index = season?.IndexNumber;
                if (index == 0 && !cfg.IncludeSpecials)
                {
                    continue;
                }

                seasons.Add(new IncompleteSeason(entry.Key.ToString("N"), season?.Name ?? "Unknown season", index, entry.Value.Have, entry.Value.Total));
            }

            seasons.Sort((a, b) => (a.Index ?? int.MaxValue).CompareTo(b.Index ?? int.MaxValue));

            List<MissingEpisodeResult> missing = stats.Missing
                .Where(e => cfg.IncludeSpecials || e.Season != 0)
                .OrderBy(e => e.Season ?? int.MaxValue)
                .ThenBy(e => e.Episode ?? int.MaxValue)
                .Select(e => new MissingEpisodeResult(
                    e.Id.ToString("N"),
                    e.Season,
                    e.Episode,
                    e.Name,
                    e.PremiereDate?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture)))
                .ToList();

            result.Add(new IncompleteSeries(series.Id.ToString("N"), series.Name, series.ProductionYear, counts.Have, counts.Total, seasons, missing));
        }

        result.Sort((a, b) =>
        {
            int byMissing = (b.Total - b.Have).CompareTo(a.Total - a.Have);
            return byMissing != 0 ? byMissing : string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase);
        });

        return result;
    }

    /// <summary>
    /// Reports how many missing-episode placeholders exist, so the settings page can warn when there are none.
    /// </summary>
    [HttpGet("Health")]
    public ActionResult<HealthResult> GetHealth()
    {
        return new HealthResult(_stats.CountMissingEpisodes());
    }

    private User? GetUser()
    {
        string? claim = User.FindFirst("Jellyfin-UserId")?.Value;
        return Guid.TryParse(claim, out Guid userId) ? _userManager.GetUserById(userId) : null;
    }

    private static HashSet<Guid> ToGuids(IEnumerable<string> values)
    {
        HashSet<Guid> set = new();
        foreach (string value in values)
        {
            if (Guid.TryParse(value, out Guid guid))
            {
                set.Add(guid);
            }
        }

        return set;
    }
}
