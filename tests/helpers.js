const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const wait = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs season-badge.js against a page containing the given cards.
function badgePage(cardsHtml, config, apiClient) {
  const dom = new JSDOM(`<!DOCTYPE html><head></head><body>${cardsHtml}</body>`, { runScripts: 'outside-only' });
  const w = dom.window;
  if (config) w.SeasonBadgeConfig = config;
  w.ApiClient = apiClient;
  w.console.warn = () => {};
  w.eval(read('season-badge.js'));
  return w;
}

const card = (type, id) =>
  `<div class="card" data-type="${type}" data-id="${id}"><div class="cardImageContainer"></div></div>`;

const badges = (w) =>
  [...w.document.querySelectorAll('.season-complete-badge')]
    .map((b) => `${b.closest('.card').dataset.id}=${b.textContent}`);

// Loads a plugin page (settings or overview) with mocked Jellyfin globals.
function pluginPage(file, api) {
  const dashboard = { loading: 0 };
  const dom = new JSDOM(read(file), {
    runScripts: 'dangerously',
    url: 'http://localhost/web/',
    beforeParse(w) {
      w.Dashboard = {
        showLoadingMsg() { dashboard.loading++; },
        hideLoadingMsg() { dashboard.loading--; },
        processPluginConfigurationUpdateResult() {}
      };
      w.ApiClient = api;
    }
  });
  const w = dom.window;
  w.document.querySelector('[data-role="page"]').dispatchEvent(new w.Event('pageshow'));
  return { w, d: w.document, dashboard };
}

module.exports = { read, wait, badgePage, card, badges, pluginPage };
