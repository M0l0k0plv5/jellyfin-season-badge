const test = require('node:test');
const assert = require('node:assert');
const { wait, pluginPage } = require('./helpers');

const PAGE = 'src/Jellyfin.Plugin.SeasonBadge/Configuration/configPage.html';

test('settings load and save round-trip', async () => {
  const state = {
    config: {
      ShowOnSeasons: true, ShowOnSeries: false, IncludeSpecials: true, HideComplete: false,
      HighlightMissingEpisodes: true, Position: 'bottom-left', CompleteColor: '#00ff00', IncompleteColor: '#ff0000',
      ExcludedLibraryIds: ['lib2'], ExcludedSeriesIds: ['s9']
    }
  };
  const api = {
    getCurrentUserId: () => 'user',
    getUrl: (p) => p,
    getJSON: async () => ({ missingEpisodes: 0 }),
    getVirtualFolders: async () => [
      { ItemId: 'lib1', Name: 'Shows', CollectionType: 'tvshows' },
      { ItemId: 'lib2', Name: 'Anime', CollectionType: 'tvshows' },
      { ItemId: 'lib3', Name: 'Movies', CollectionType: 'movies' }
    ],
    getItems: async () => ({ Items: [{ Id: 's9', Name: 'Lain', ProductionYear: 1998 }] }),
    getPluginConfiguration: async () => JSON.parse(JSON.stringify(state.config)),
    updatePluginConfiguration: async (id, c) => { state.config = c; return {}; }
  };
  const { w, d } = pluginPage(PAGE, api);
  await wait(200);

  assert.strictEqual(d.querySelector('#sbShowOnSeries').checked, false);
  assert.strictEqual(d.querySelector('#sbPosition').value, 'bottom-left');
  const libs = [...d.querySelectorAll('.sbLibrary')].map((i) => `${i.dataset.id}:${i.checked}`);
  assert.deepStrictEqual(libs, ['lib1:true', 'lib2:false']);
  assert.match(d.querySelector('#sbExcludedSeries').textContent, /Lain \(1998\)/);
  assert.notStrictEqual(d.querySelector('#sbHealthWarning').style.display, 'none');

  d.querySelector('#sbShowOnSeries').checked = true;
  d.querySelector('.sbLibrary[data-id="lib2"]').checked = true;
  d.querySelector('#seasonBadgeConfigForm').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await wait(50);
  assert.strictEqual(state.config.ShowOnSeries, true);
  assert.deepStrictEqual(Array.from(state.config.ExcludedLibraryIds), []);
  assert.deepStrictEqual(Array.from(state.config.ExcludedSeriesIds), ['s9']);
});
