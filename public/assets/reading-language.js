const storageKey = 'eabo-reading-language';
const toggle = document.querySelector('[data-reading-language-toggle]');
const alternate = toggle.getAttribute('href');
const pageLanguage = alternate ? document.documentElement.lang : null;
const readingLinks = document.querySelectorAll('[data-reading-en-href]');
let preference = storedLanguage() ?? 'zh-Hans';

function storedLanguage() {
  try {
    return localStorage.getItem(storageKey) === 'en' ? 'en' : 'zh-Hans';
  } catch {
    return null;
  }
}

function alternateUrl() {
  return `${alternate}${location.search}${location.hash}`;
}

function syncNavigation() {
  const inEnglish = (pageLanguage ?? preference) === 'en';
  for (const link of readingLinks) {
    link.href = inEnglish ? link.dataset.readingEnHref : link.dataset.readingZhHref;
  }

  if (alternate) {
    toggle.href = alternateUrl();
  } else {
    const label = `Switch reading language to ${inEnglish ? 'Chinese' : 'English'}`;
    toggle.dataset.readingLanguage = inEnglish ? 'en' : 'zh-Hans';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.hidden = false;
  }
}

function refreshPreference() {
  preference = storedLanguage() ?? preference;
  syncNavigation();
}

const canonical = document.querySelector('link[rel="canonical"]').href;
const defaultChineseRoute = pageLanguage === 'zh-Hans' && location.pathname === new URL(canonical).pathname;
const usingHistory = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';

if (defaultChineseRoute && preference === 'en' && !usingHistory) {
  location.replace(alternateUrl());
} else {
  toggle.addEventListener('click', () => {
    preference = (pageLanguage ?? preference) === 'en' ? 'zh-Hans' : 'en';
    try {
      localStorage.setItem(storageKey, preference);
    } catch {
      // Language links still work when browser storage is unavailable.
    }
    if (!alternate) syncNavigation();
  });

  window.addEventListener('pageshow', refreshPreference);
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey) refreshPreference();
  });
  if (alternate) window.addEventListener('hashchange', () => { toggle.href = alternateUrl(); });
  syncNavigation();
}
