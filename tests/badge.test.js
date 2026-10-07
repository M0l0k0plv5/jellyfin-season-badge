const test = require('node:test');
const assert = require('node:assert');
const { wait, badgePage, card, badges } = require('./helpers');

const PAST = '2000-01-01T00:00:00Z';
const FUTURE = '2999-01-01T00:00:00Z';
const cards = card('Series', 'S1') + card('Season', 'A') + card('Season', 'B');

const episodes = [
  { SeasonId: 'A', ParentIndexNumber: 1, LocationType: 'FileSystem', PremiereDate: PAST },
  { SeasonId: 'A', ParentIndexNumber: 1, LocationType: 'FileSystem', PremiereDate: PAST },
  { SeasonId: 'B', ParentIndexNumber: 2, LocationType: 'FileSystem', PremiereDate: PAST },
  { SeasonId: 'B', ParentIndexNumber: 2, LocationType: 'Virtual', PremiereDate: PAST },
  { SeasonId: 'B', ParentIndexNumber: 2, LocationType: 'Virtual', PremiereDate: FUTURE },
  { SeasonId: 'SP', ParentIndexNumber: 0, LocationType: 'Virtual', PremiereDate: PAST }
];

function scriptApi(log = []) {
  return {
    getCurrentUserId: () => 'user',
    getUrl: (p) => p,
    getJSON: async (url) => {
      log.push(url);
      if (url.startsWith('SeasonBadge')) throw new Error('404');
      if (url.endsWith('/Ancestors')) return [{ Id: 'lib-1' }];
      return { Items: episodes };
    },
    getItem: async () => ({ SeriesId: 'S1' })
  };
}

test('server mode: one batched request, badges from the response', async () => {
  const log = [];
  const api = {
    getCurrentUserId: () => 'user',
    getUrl: (p, q) => p + '?' + new URLSearchParams(q),
    getJSON: async (url) => {
      log.push(url);
      return { S1: { have: 3, total: 4 }, A: { have: 2, total: 2 } };
    }
  };
  const w = badgePage(cards, { serverStats: true }, api);
  await wait();
  assert.deepStrictEqual(badges(w), ['S1=3/4', 'A=✓ 2']);
  assert.strictEqual(log.length, 1);
  assert.match(log[0], /^SeasonBadge\/Stats\?ids=S1%2CA%2CB$/);
});

test('server mode: re-rendered cards are served from the cache', async () => {
  const log = [];
  const api = {
    getCurrentUserId: () => 'user',
    getUrl: (p) => p,
    getJSON: async (url) => { log.push(url); return { A: { have: 1, total: 2 } }; }
  };
  const w = badgePage(card('Season', 'A'), { serverStats: true }, api);
  await wait();
  w.document.body.insertAdjacentHTML('beforeend', card('Season', 'A'));
  await wait(500);
  assert.strictEqual(log.length, 1);
  assert.strictEqual(badges(w).length, 2);
});

test('script mode: counts aired episodes, skips unaired and specials', async () => {
  const w = badgePage(cards, null, scriptApi());
  await wait();
  assert.deepStrictEqual(badges(w), ['S1=3/4', 'A=✓ 2', 'B=1/2']);
});

test('script mode: specials count when enabled', async () => {
  const w = badgePage(card('Series', 'S1'), { includeSpecials: true }, scriptApi());
  await wait();
  assert.deepStrictEqual(badges(w), ['S1=3/5']);
});

test('falls back to script mode when the server endpoint fails', async () => {
  const w = badgePage(cards, { serverStats: true }, scriptApi());
  await wait();
  assert.deepStrictEqual(badges(w), ['S1=3/4', 'A=✓ 2', 'B=1/2']);
});

test('excluded series and libraries get no badge', async () => {
  let w = badgePage(cards, { excludedSeriesIds: ['s1'] }, scriptApi());
  await wait();
  assert.deepStrictEqual(badges(w), []);
  w = badgePage(cards, { excludedLibraryIds: ['LIB1'] }, scriptApi());
  await wait();
  assert.deepStrictEqual(badges(w), []);
});

test('hideComplete only shows incomplete badges', async () => {
  const w = badgePage(cards, { hideComplete: true }, scriptApi());
  await wait();
  assert.deepStrictEqual(badges(w), ['S1=3/4', 'B=1/2']);
});

test('badge position and colors follow the config', async () => {
  const w = badgePage(card('Season', 'B'), { position: 'bottom-right', incompleteColor: '#123456' }, scriptApi());
  await wait();
  const b = w.document.querySelector('.season-complete-badge');
  assert.strictEqual(b.style.bottom, '0.4em');
  assert.strictEqual(b.style.right, '0.4em');
  assert.strictEqual(b.style.background, 'rgb(18, 52, 86)');
});

test('missing-episode highlight style is only added when enabled', async () => {
  let w = badgePage('', { highlightMissing: true }, scriptApi());
  assert.match(w.document.head.innerHTML, /missingIndicator/);
  w = badgePage('', { highlightMissing: false }, scriptApi());
  assert.doesNotMatch(w.document.head.innerHTML, /missingIndicator/);
});
