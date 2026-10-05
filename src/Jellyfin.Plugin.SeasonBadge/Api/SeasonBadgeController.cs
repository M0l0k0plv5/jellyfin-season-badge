using System.Text.Json.Serialization;
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
