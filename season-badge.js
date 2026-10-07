// Season Badge for Jellyfin
// Shows "✓ 13" (complete) or "11/13" (episodes missing) on season and series posters
// and highlights missing episodes in episode lists.
// Unaired episodes are ignored. Requires missing episodes to be enabled
// (metadata provider + "Display missing episodes within seasons").
// Injected by the Season Badge plugin (counts come from the server in batches).
// Can also be pasted into JavaScript Injector as is (counts are then fetched per series).
(function () {
  'use strict';

  if (window.__seasonBadgeLoaded) return;
  window.__seasonBadgeLoaded = true;

  const cfg = Object.assign({
    showOnSeasons: true,
    showOnSeries: true,
    includeSpecials: false,
    hideComplete: false,
    highlightMissing: true,
    position: 'top-left',
    completeColor: '#2e7d32',
    incompleteColor: '#c62828',
    excludedLibraryIds: [],
    excludedSeriesIds: [],
    serverStats: false
  }, window.SeasonBadgeConfig || {});

  const norm = function (id) { return String(id || '').replace(/-/g, '').toLowerCase(); };
  const excludedLibraries = new Set((cfg.excludedLibraryIds || []).map(norm));
  const excludedSeries = new Set((cfg.excludedSeriesIds || []).map(norm));

  const FLAG = 'data-cbadge';
  const TTL = 60000;
  const BATCH = 40;

  // ---- Missing episode highlight (pure CSS) ----
  if (cfg.highlightMissing) {
    const style = document.createElement('style');
    style.textContent =
      ':root{--sb-missing:' + cfg.incompleteColor + '}' +
      '.listItem:has(.missingIndicator){box-shadow:inset 4px 0 0 var(--sb-missing);' +
      'background:color-mix(in srgb,var(--sb-missing) 12%,transparent)}' +
      '.card:has(.missingIndicator) .cardImageContainer{outline:3px solid var(--sb-missing);outline-offset:-3px}' +
      '.missingIndicator{background:var(--sb-missing)!important}' +
      '.unairedIndicator{background:#616161!important}';
    document.head.appendChild(style);
  }

  // ---- Badge rendering ----
  const POSITIONS = {
    'top-left': ['top', 'left'],
    'top-right': ['top', 'right'],
    'bottom-left': ['bottom', 'left'],
    'bottom-right': ['bottom', 'right']
  };

  // ---- Avoid overlays from other plugins (e.g. quality tags of Jellyfin Enhanced) ----
  function overlaps(a, b) {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  }

  function dodge(card, badge) {
    const host = badge.parentElement;
    if (!host) return;
    const count = card.getElementsByTagName('*').length;
    if (badge.dataset.n === String(count)) return; // nothing new in this card
    badge.dataset.n = String(count);

    const hr = host.getBoundingClientRect();
    if (!hr.width || !hr.height) return;
    const side = badge.dataset.v;
    badge.style[side] = '.4em';

    const others = Array.prototype.filter.call(card.querySelectorAll('*'), function (el) {
      if (el === badge || badge.contains(el) || el.contains(badge)) return false;
      const cs = getComputedStyle(el);
      if (cs.position !== 'absolute' && cs.position !== 'fixed') return false;
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      // Ignore full-size layers like the poster image or hover overlays
      return r.width > 0 && r.height > 0 && r.width < hr.width * 0.6 && r.height < hr.height * 0.6;
    });

    for (let i = 0; i < 6; i++) {
      const br = badge.getBoundingClientRect();
      const hits = others.map(function (el) { return el.getBoundingClientRect(); })
        .filter(function (r) { return overlaps(br, r); });
      if (!hits.length) return;
      if (side === 'top') {
        const lowest = Math.max.apply(null, hits.map(function (r) { return r.bottom; }));
        badge.style.top = Math.round(lowest - hr.top + 4) + 'px';
      } else {
        const highest = Math.min.apply(null, hits.map(function (r) { return r.top; }));
        badge.style.bottom = Math.round(hr.bottom - highest + 4) + 'px';
      }
    }
  }

  function dodgeAll() {
    document.querySelectorAll('.season-complete-badge').forEach(function (badge) {
      const card = badge.closest('.card');
      if (card) dodge(card, badge);
    });
  }

  function addBadge(card, s) {
    if (!s || !s.total) return;
    const done = s.have >= s.total;
    if (done && cfg.hideComplete) return;
    const host = card.querySelector('.cardImageContainer') ||
                 card.querySelector('.cardScalable') || card;
    if (host.querySelector('.season-complete-badge')) return;
    const pos = POSITIONS[cfg.position] || POSITIONS['top-left'];
    const b = document.createElement('div');
    b.className = 'season-complete-badge';
    b.dataset.v = pos[0];
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
    dodge(card, b);
  }

  // ---- Server mode: one request per batch of cards ----
  const statsCache = new Map(); // id -> { at, value }

  function cached(id) {
    const e = statsCache.get(id);
    return e && Date.now() - e.at < TTL ? e : null;
  }

  async function fetchServer(c, ids) {
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      const res = await c.getJSON(c.getUrl('SeasonBadge/Stats', { ids: chunk.join(',') }));
      const now = Date.now();
      chunk.forEach(function (id) {
        statsCache.set(id, { at: now, value: (res && res[id]) || null });
      });
    }
  }

  // ---- Script-only mode: count episodes in the browser ----
  const seriesCache = new Map();

  async function isExcluded(c, seriesId) {
    if (excludedSeries.has(norm(seriesId))) return true;
    if (!excludedLibraries.size) return false;
    const url = c.getUrl('Items/' + seriesId + '/Ancestors', { UserId: c.getCurrentUserId() });
    const ancestors = await c.getJSON(url);
    return (ancestors || []).some(function (a) { return excludedLibraries.has(norm(a.Id)); });
  }

  async function loadSeries(c, seriesId) {
    if (await isExcluded(c, seriesId)) return null;
    const url = c.getUrl('Shows/' + seriesId + '/Episodes', {
      UserId: c.getCurrentUserId(),
      Fields: 'PremiereDate',
      EnableImages: false,
      EnableUserData: false
    });
    const res = await c.getJSON(url);
    const now = Date.now();
    const seasons = new Map();
    const all = { have: 0, total: 0 };
    (res.Items || []).forEach(function (ep) {
      const virtual = ep.LocationType === 'Virtual';
      const aired = ep.PremiereDate && Date.parse(ep.PremiereDate) <= now;
      if (virtual && !aired) return;
      const s = seasons.get(ep.SeasonId) || { have: 0, total: 0 };
      s.total++;
      if (!virtual) s.have++;
      seasons.set(ep.SeasonId, s);
      if (cfg.includeSpecials || ep.ParentIndexNumber !== 0) {
        all.total++;
        if (!virtual) all.have++;
      }
    });
    return { seasons: seasons, all: all };
  }

  function seriesStats(c, seriesId) {
    if (!seriesCache.has(seriesId)) {
      seriesCache.set(seriesId, loadSeries(c, seriesId));
      setTimeout(function () { seriesCache.delete(seriesId); }, TTL);
    }
    return seriesCache.get(seriesId);
  }

  async function clientStats(c, card) {
    const id = card.getAttribute('data-id');
    if (card.getAttribute('data-type') === 'Series') {
      const s = await seriesStats(c, id);
      return s && s.all;
    }
    const season = await c.getItem(c.getCurrentUserId(), id);
    if (!season.SeriesId) return null;
    const s = await seriesStats(c, season.SeriesId);
    return s && s.seasons.get(id);
  }

  // ---- Scan ----
  async function scan() {
    const c = window.ApiClient;
    if (!c || !c.getCurrentUserId || !c.getCurrentUserId()) return;
    dodgeAll();
    const selectors = [];
    if (cfg.showOnSeasons) selectors.push('.card[data-type="Season"][data-id]:not([' + FLAG + '])');
    if (cfg.showOnSeries) selectors.push('.card[data-type="Series"][data-id]:not([' + FLAG + '])');
    if (!selectors.length) return;
    const cards = Array.prototype.slice.call(document.querySelectorAll(selectors.join(',')));
    if (!cards.length) return;
    cards.forEach(function (card) { card.setAttribute(FLAG, '1'); });

    if (cfg.serverStats) {
      try {
        const ids = cards.map(function (card) { return card.getAttribute('data-id'); })
          .filter(function (id, i, arr) { return arr.indexOf(id) === i && !cached(id); });
        if (ids.length) await fetchServer(c, ids);
        cards.forEach(function (card) {
          const e = cached(card.getAttribute('data-id'));
          if (e) addBadge(card, e.value);
        });
        return;
      } catch (e) {
        console.warn('[season-badge] server stats unavailable, counting in the browser', e);
        cfg.serverStats = false;
      }
    }

    for (const card of cards) {
      try {
        addBadge(card, await clientStats(c, card));
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
