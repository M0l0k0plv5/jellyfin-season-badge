using System.Collections.Concurrent;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;

namespace Jellyfin.Plugin.SeasonBadge;

/// <summary>
/// Episode counts for one season or series.
/// </summary>
public sealed class Counts
{
    public int Have { get; set; }

    public int Total { get; set; }

    public void Add(bool have)
    {
        Total++;
        if (have)
        {
            Have++;
        }
    }
}

/// <summary>
/// An aired episode that has no file.
/// </summary>
public sealed record MissingEpisode(Guid Id, int? Season, int? Episode, string Name, DateTime? PremiereDate);

/// <summary>
/// Counts for all seasons of a series.
/// </summary>
public sealed class SeriesStats
{
    public Dictionary<Guid, Counts> Seasons { get; } = new();

    public Counts All { get; } = new();

    public Counts Specials { get; } = new();

    public List<MissingEpisode> Missing { get; } = new();

    public Counts ForSeries(bool includeSpecials)
    {
        return includeSpecials
            ? All
            : new Counts { Have = All.Have - Specials.Have, Total = All.Total - Specials.Total };
    }
}

/// <summary>
/// Computes and caches episode counts. The cache is cleared whenever episodes, seasons or series change.
/// </summary>
public sealed class StatsService : IDisposable
{
    private static readonly TimeSpan MaxAge = TimeSpan.FromMinutes(10);

    private readonly ILibraryManager _libraryManager;
    private readonly ConcurrentDictionary<(Guid UserId, Guid SeriesId), (DateTime Created, SeriesStats Stats)> _cache = new();

    public StatsService(ILibraryManager libraryManager)
    {
        _libraryManager = libraryManager;
        _libraryManager.ItemAdded += OnLibraryChanged;
        _libraryManager.ItemUpdated += OnLibraryChanged;
        _libraryManager.ItemRemoved += OnLibraryChanged;
    }

    public SeriesStats GetSeriesStats(Series series, User user)
    {
        (Guid, Guid) key = (user.Id, series.Id);
        if (_cache.TryGetValue(key, out var entry) && DateTime.UtcNow - entry.Created < MaxAge)
        {
            return entry.Stats;
        }

        SeriesStats stats = Compute(series, user);
        _cache[key] = (DateTime.UtcNow, stats);
        return stats;
    }

    public int CountMissingEpisodes()
    {
        return _libraryManager.GetCount(new InternalItemsQuery
        {
            IncludeItemTypes = new[] { BaseItemKind.Episode },
            IsVirtualItem = true,
            Recursive = true
        });
    }

    public void Dispose()
    {
        _libraryManager.ItemAdded -= OnLibraryChanged;
        _libraryManager.ItemUpdated -= OnLibraryChanged;
        _libraryManager.ItemRemoved -= OnLibraryChanged;
    }

    private static SeriesStats Compute(Series series, User user)
    {
        DateTime now = DateTime.UtcNow;
        SeriesStats stats = new();

        foreach (BaseItem item in series.GetEpisodes(user, new DtoOptions(false), true))
        {
            if (item is not Episode episode)
            {
                continue;
            }

            bool missing = episode.IsMissingEpisode;
            bool aired = episode.PremiereDate.HasValue && episode.PremiereDate.Value <= now;
            if (missing && !aired)
            {
                // Unaired or undated placeholder
                continue;
            }

            Guid seasonId = episode.SeasonId != Guid.Empty ? episode.SeasonId : episode.FindSeasonId();
            if (!stats.Seasons.TryGetValue(seasonId, out Counts? season))
            {
                season = new Counts();
                stats.Seasons[seasonId] = season;
            }

            season.Add(!missing);
            stats.All.Add(!missing);
            if (episode.ParentIndexNumber == 0)
            {
                stats.Specials.Add(!missing);
            }

            if (missing)
            {
                stats.Missing.Add(new MissingEpisode(episode.Id, episode.ParentIndexNumber, episode.IndexNumber, episode.Name, episode.PremiereDate));
            }
        }

        return stats;
    }

    private void OnLibraryChanged(object? sender, ItemChangeEventArgs e)
    {
        if (e.Item is Episode or Season or Series)
        {
            _cache.Clear();
        }
    }
}
