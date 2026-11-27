import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../public/assets/reading-language.js', import.meta.url), 'utf8');

function page({ language = 'en', saved = null, alternate = null, search = '', hash = '', storageAvailable = true, article = false } = {}) {
  const events = new Map();
  const redirects = [];
  const on = (event, callback) => events.set(event, callback);
  function toggle() {
    return {
      href: alternate,
      dataset: {},
      getAttribute(name) { return name === 'href' ? this.href : null; },
      setAttribute(name, value) { this[name] = value; },
      addEventListener(event, callback) { this[event] = callback; },
    };
  }
  const toggles = Array.from({ length: article ? 2 : 1 }, toggle);
  const links = ['blog', 'publication', 'project'].map((section) => ({
    dataset: { readingZhHref: `/${section}/`, readingEnHref: `/en/${section}/` },
  }));
  const titles = ['tech', 'reflection'].map((category) => ({
    dataset: { readingZhText: `${category} 中文标题`, readingEnText: `${category} English title` },
  }));
  const elements = {
    '[data-reading-language-toggle]': toggles,
    '[data-reading-en-href]': links,
    '[data-reading-en-text]': titles,
  };
  runInNewContext(script, {
    document: { documentElement: { lang: language }, querySelectorAll: (selector) => elements[selector], addEventListener: on, hidden: false },
    window: { addEventListener: on },
    location: { search, hash, replace: (url) => redirects.push(url) },
    localStorage: {
      getItem() {
        if (!storageAvailable) throw new Error('Storage unavailable');
        return saved;
      },
      setItem(key, value) {
        assert.equal(key, 'eabo-reading-language');
        if (!storageAvailable) throw new Error('Storage unavailable');
        saved = value;
      },
    },
  });
  return {
    toggles, links, titles, redirects,
    saved: () => saved,
    updateSaved: (value) => { saved = value; },
    emit: (event, data = {}) => events.get(event)(data),
  };
}

test('saved language wins over either page edition while retaining query and section', () => {
  for (const [language, saved, alternate] of [
    ['en', 'zh-Hans', '/blog/example/'],
    ['zh-Hans', 'en', '/en/blog/example/'],
  ]) {
    const view = page({ language, saved, alternate, search: '?from=project', hash: '#reference-example' });
    assert.deepEqual(view.redirects, [`${alternate}?from=project#reference-example`]);
    assert.equal(view.saved(), saved);
  }
});

test('a language choice on Home or Contact updates every navigation link and latest-post title', () => {
  const view = page({ saved: 'en' });
  assert.ok(view.links.every((link) => link.href.startsWith('/en/')));
  assert.ok(view.titles.every((title) => title.textContent.includes('English title')));
  view.toggles[0].click();
  assert.equal(view.saved(), 'zh-Hans');
  assert.ok(view.links.every((link) => !link.href.startsWith('/en/')));
  assert.ok(view.titles.every((title) => title.textContent.includes('中文标题')));
  assert.equal(view.toggles[0].dataset.readingLanguage, 'zh-Hans');
});

test('returning through browser history restores the shared language instead of cached page language', () => {
  const view = page({ language: 'zh-Hans', saved: 'zh-Hans', alternate: '/en/project/' });
  view.updateSaved('en');
  view.emit('pageshow', { persisted: true });
  assert.deepEqual(view.redirects, ['/en/project/']);
});

test('other-tab language changes synchronize content pages in both directions', () => {
  for (const [language, nextLanguage, alternate] of [
    ['en', 'zh-Hans', '/publication/'],
    ['zh-Hans', 'en', '/en/publication/'],
  ]) {
    const view = page({ language, saved: language, alternate });
    view.updateSaved(nextLanguage);
    view.emit('storage', { key: 'eabo-reading-language' });
    assert.deepEqual(view.redirects, [alternate]);
  }
  const home = page({ saved: 'zh-Hans' });
  home.updateSaved('en');
  home.emit('storage', { key: 'eabo-reading-language' });
  assert.ok(home.links.every((link) => link.href.startsWith('/en/')));
});

test('reactivating a background tab refreshes its language selection', () => {
  const view = page({ language: 'en', saved: 'en', alternate: '/blog/example/' });
  view.updateSaved('zh-Hans');
  view.emit('visibilitychange');
  assert.deepEqual(view.redirects, ['/blog/example/']);
});

test('both article and header buttons save the same global language', () => {
  for (const index of [0, 1]) {
    const view = page({ language: 'en', saved: 'en', alternate: '/blog/example/', article: true });
    view.toggles[index].click();
    assert.equal(view.saved(), 'zh-Hans');
    assert.equal(view.toggles[index].href, '/blog/example/');
  }
});

test('the initial edition sets the first preference and unavailable storage keeps controls working', () => {
  const english = page({ language: 'en', alternate: '/project/' });
  assert.equal(english.saved(), 'en');
  assert.deepEqual(english.redirects, []);
  const home = page();
  assert.equal(home.saved(), 'zh-Hans');
  const unavailable = page({ storageAvailable: false });
  unavailable.toggles[0].click();
  assert.ok(unavailable.links.every((link) => link.href.startsWith('/en/')));
  assert.deepEqual(unavailable.redirects, []);
});
