const test = require('node:test');
const assert = require('node:assert');
const { wait, pluginPage } = require('./helpers');

const PAGE = 'src/Jellyfin.Plugin.SeasonBadge/Configuration/incompletePage.html';

const data = [
  {
    id: 'a1', name: 'Pastewka', year: 2005, have: 90, total: 101,
    seasons: [{ id: 's3', name: 'Season 3', index: 3, have: 5, total: 10 }],
    missing: [
      { id: 'e1', season: 3, episode: 6, name: 'Die Hochzeit', airDate: '2007-02-01' },
      { id: 'e2', season: 3, episode: 7, name: 'Quote "Test", ok', airDate: null }
    ]
  },
  {
    id: 'b2', name: 'Die Sopranos', year: 1999, have: 80, total: 86,
    seasons: [{ id: 's2', name: 'Staffel 2', index: 2, have: 7, total: 13 }],
    missing: [{ id: 'e3', season: 2, episode: 4, name: 'Commendatori', airDate: '2000-02-06' }]
  }
];

function api(state) {
  return {
    getUrl: (p) => p,
    getJSON: async (url) => (url.endsWith('Incomplete') ? JSON.parse(JSON.stringify(data)) : { missingEpisodes: 17 }),
    getPluginConfiguration: async () => state.config,
    updatePluginConfiguration: async (id, c) => { state.config = c; return {}; }
  };
}

const rowTitles = (d) => [...d.querySelectorAll('#sbList > div')].map((r) => r.querySelector('a').textContent);

test('lists series, sorted by most missing, with summary', async () => {
  const state = { config: { ExcludedSeriesIds: [] } };
  const { d } = pluginPage(PAGE, api(state));
  await wait(200);
  assert.deepStrictEqual(rowTitles(d), ['Pastewka (2005)', 'Die Sopranos (1999)']);
  assert.match(d.querySelector('#sbSummary').textContent, /^2 series with missing episodes, 17 episodes missing/);
});

test('sorting and filtering', async () => {
  const state = { config: {} };
  const { w, d } = pluginPage(PAGE, api(state));
  await wait(200);
  d.querySelector('#sbSort').value = 'name';
  d.querySelector('#sbSort').dispatchEvent(new w.Event('change'));
  assert.deepStrictEqual(rowTitles(d), ['Die Sopranos (1999)', 'Pastewka (2005)']);
  d.querySelector('#sbFilter').value = 'sopr';
  d.querySelector('#sbFilter').dispatchEvent(new w.Event('input'));
  assert.deepStrictEqual(rowTitles(d), ['Die Sopranos (1999)']);
});

test('missing episodes expand with SxxEyy labels', async () => {
  const { d } = pluginPage(PAGE, api({ config: {} }));
  await wait(200);
  const row = d.querySelector('#sbList > div');
  const toggle = [...row.querySelectorAll('a')].find((a) => a.textContent.startsWith('Show 2 missing'));
  assert.ok(toggle, 'toggle link exists');
  toggle.click();
  assert.match(toggle.textContent, /^Hide 2 missing episodes$/);
  const lines = [...row.querySelectorAll('a[href^="#/details?id=e"]')].map((a) => a.textContent);
  assert.deepStrictEqual(lines, ['S03E06 - Die Hochzeit (2007-02-01)', 'S03E07 - Quote "Test", ok']);
});

test('CSV export escapes quotes and commas', async () => {
  const { w, d } = pluginPage(PAGE, api({ config: {} }));
  await wait(200);
  let csv = null;
  w.URL.createObjectURL = (blob) => {
    const reader = new w.FileReader();
    reader.onload = () => { csv = reader.result.replace(/^\ufeff/, ''); };
    reader.readAsText(blob);
    return 'blob:x';
  };
  w.URL.revokeObjectURL = () => {};
  d.querySelector('#sbExport').click();
  await wait(50);
  assert.strictEqual(csv.split('\r\n')[0], 'Series,Year,Season,Episode,Title,Air date');
  assert.ok(csv.includes('Pastewka,2005,3,7,"Quote ""Test"", ok",'));
  assert.ok(csv.includes('Die Sopranos,1999,2,4,Commendatori,2000-02-06'));
});

test('ignore adds the series to the exclusion list', async () => {
  const state = { config: { ExcludedSeriesIds: ['x'] } };
  const { d } = pluginPage(PAGE, api(state));
  await wait(200);
  [...d.querySelectorAll('#sbList button')].find((b) => b.textContent === 'Ignore').click();
  await wait(50);
  assert.deepStrictEqual(Array.from(state.config.ExcludedSeriesIds), ['x', 'a1']);
  assert.deepStrictEqual(rowTitles(d), ['Die Sopranos (1999)']);
});
