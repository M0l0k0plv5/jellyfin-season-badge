// Season completeness badge for Jellyfin
// Shows "✓ 13" (complete) or "11/13" (episodes missing) on season posters.
// Unaired episodes are ignored. Requires missing episodes to be enabled
// (metadata provider + "Display missing episodes within seasons").
(function () {
  'use strict';

  const FLAG = 'data-cbadge';
  const seriesCache = new Map();

  function seriesStats(c, seriesId) {
    if (!seriesCache.has(seriesId)) {
      const url = c.getUrl('Shows/' + seriesId + '/Episodes', {
        UserId: c.getCurrentUserId(),
        Fields: 'PremiereDate',
        EnableImages: false,
        EnableUserData: false
      });
      const p = c.getJSON(url).then(function (res) {
        const now = Date.now();
        const stats = new Map();
        (res.Items || []).forEach(function (ep) {
          const virtual = ep.LocationType === 'Virtual';
          const aired = ep.PremiereDate && Date.parse(ep.PremiereDate) <= now;
          if (virtual && !aired) return;
          const s = stats.get(ep.SeasonId) || { have: 0, total: 0 };
          s.total++;
          if (!virtual) s.have++;
          stats.set(ep.SeasonId, s);
        });
        return stats;
      });
      seriesCache.set(seriesId, p);
      setTimeout(function () { seriesCache.delete(seriesId); }, 60000);
    }
    return seriesCache.get(seriesId);
  }

  function addBadge(card, s) {
    if (!s || !s.total) return;
    const host = card.querySelector('.cardImageContainer') ||
                 card.querySelector('.cardScalable') || card;
    const done = s.have >= s.total;
    const b = document.createElement('div');
    b.className = 'season-complete-badge';
    b.textContent = done ? '✓ ' + s.total : s.have + '/' + s.total;
    b.title = done ? 'Season complete' : (s.total - s.have) + ' episode(s) missing';
    b.style.cssText = [
      'position:absolute', 'top:.4em', 'left:.4em', 'z-index:5',
      'padding:.15em .5em', 'border-radius:.4em',
      'font-size:.8em', 'font-weight:600', 'line-height:1.4',
      'color:#fff', 'pointer-events:none',
      'background:' + (done ? '#2e7d32' : '#c62828')
    ].join(';');
    host.appendChild(b);
  }

  async function scan() {
    const c = window.ApiClient;
    if (!c || !c.getCurrentUserId || !c.getCurrentUserId()) return;
    const cards = document.querySelectorAll(
      '.card[data-type="Season"][data-id]:not([' + FLAG + '])');
    for (const card of cards) {
      card.setAttribute(FLAG, '1');
      const seasonId = card.getAttribute('data-id');
      try {
        const season = await c.getItem(c.getCurrentUserId(), seasonId);
        if (!season.SeriesId) continue;
        const stats = await seriesStats(c, season.SeriesId);
        addBadge(card, stats.get(seasonId));
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
