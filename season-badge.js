// Season Badge for Jellyfin
// Shows "✓ 13" (complete) or "11/13" (episodes missing) on season and series posters.
// Unaired episodes are ignored. Requires missing episodes to be enabled
// (metadata provider + "Display missing episodes within seasons").
// Used by the Season Badge plugin; can also be pasted into JavaScript Injector as is.
(function () {
  'use strict';

  if (window.__seasonBadgeLoaded) return;
  window.__seasonBadgeLoaded = true;

  const cfg = Object.assign({
    showOnSeasons: true,
    showOnSeries: true,
    includeSpecials: false,
    hideComplete: false,
    position: 'top-left',
    completeColor: '#2e7d32',
    incompleteColor: '#c62828',
    excludedLibraryIds: []
  }, window.SeasonBadgeConfig || {});

  const norm = function (id) { return String(id || '').replace(/-/g, '').toLowerCase(); };
  const excluded = new Set((cfg.excludedLibraryIds || []).map(norm));

  const FLAG = 'data-cbadge';
  const SERIES_KEY = '__series';
  const seriesCache = new Map();

  async function isExcluded(c, seriesId) {
    if (!excluded.size) return false;
    const url = c.getUrl('Items/' + seriesId + '/Ancestors', { UserId: c.getCurrentUserId() });
    const ancestors = await c.getJSON(url);
    return (ancestors || []).some(function (a) { return excluded.has(norm(a.Id)); });
  }

  async function loadStats(c, seriesId) {
    if (await isExcluded(c, seriesId)) return null;
    const url = c.getUrl('Shows/' + seriesId + '/Episodes', {
      UserId: c.getCurrentUserId(),
      Fields: 'PremiereDate',
      EnableImages: false,
      EnableUserData: false
    });
    const res = await c.getJSON(url);
    const now = Date.now();
    const stats = new Map();
    const all = { have: 0, total: 0 };
    (res.Items || []).forEach(function (ep) {
      const virtual = ep.LocationType === 'Virtual';
      const aired = ep.PremiereDate && Date.parse(ep.PremiereDate) <= now;
      if (virtual && !aired) return; // skip unaired / undated placeholders
      const s = stats.get(ep.SeasonId) || { have: 0, total: 0 };
      s.total++;
      if (!virtual) s.have++;
      stats.set(ep.SeasonId, s);
      if (cfg.includeSpecials || ep.ParentIndexNumber !== 0) {
        all.total++;
        if (!virtual) all.have++;
      }
    });
    stats.set(SERIES_KEY, all);
    return stats;
  }

  function seriesStats(c, seriesId) {
    if (!seriesCache.has(seriesId)) {
      seriesCache.set(seriesId, loadStats(c, seriesId));
      setTimeout(function () { seriesCache.delete(seriesId); }, 60000);
    }
    return seriesCache.get(seriesId);
  }

  const POSITIONS = {
    'top-left': ['top', 'left'],
    'top-right': ['top', 'right'],
    'bottom-left': ['bottom', 'left'],
    'bottom-right': ['bottom', 'right']
  };

  function addBadge(card, s) {
    if (!s || !s.total) return;
    const done = s.have >= s.total;
    if (done && cfg.hideComplete) return;
    const host = card.querySelector('.cardImageContainer') ||
                 card.querySelector('.cardScalable') || card;
    const pos = POSITIONS[cfg.position] || POSITIONS['top-left'];
    const b = document.createElement('div');
    b.className = 'season-complete-badge';
    b.textContent = done ? '✓ ' + s.total : s.have + '/' + s.total;
    b.title = done ? 'Complete' : (s.total - s.have) + ' episode(s) missing';
    b.style.cssText = [
      'position:absolute', pos[0] + ':.4em', pos[1] + ':.4em', 'z-index:5',
      'padding:.15em .5em', 'border-radius:.4em',
      'font-size:.8em', 'font-weight:600', 'line-height:1.4',
      'color:#fff', 'pointer-events:none',
      'background:' + (done ? cfg.completeColor : cfg.incompleteColor)
    ].join(';');
    host.appendChild(b);
  }

  async function scan() {
    const c = window.ApiClient;
    if (!c || !c.getCurrentUserId || !c.getCurrentUserId()) return;
    const selectors = [];
    if (cfg.showOnSeasons) selectors.push('.card[data-type="Season"][data-id]:not([' + FLAG + '])');
    if (cfg.showOnSeries) selectors.push('.card[data-type="Series"][data-id]:not([' + FLAG + '])');
    if (!selectors.length) return;
    for (const card of document.querySelectorAll(selectors.join(','))) {
      card.setAttribute(FLAG, '1');
      const id = card.getAttribute('data-id');
      try {
        if (card.getAttribute('data-type') === 'Series') {
          const stats = await seriesStats(c, id);
          if (stats) addBadge(card, stats.get(SERIES_KEY));
        } else {
          const season = await c.getItem(c.getCurrentUserId(), id);
          if (!season.SeriesId) continue;
          const stats = await seriesStats(c, season.SeriesId);
          if (stats) addBadge(card, stats.get(id));
        }
      } catch (e) {
        console.warn('[season-badge]', e);
      }
    }
  }

  let timer;
  new MutationObserver(function () {
    clearTimeout(timer);
    timer = setTimeout(scan, 300);
  }).observe(document.body, { childList: true, subtree: true });
  scan();
})();
