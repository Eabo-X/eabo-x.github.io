const storageKey = 'eabo-reading-language';
const toggles = document.querySelectorAll('[data-reading-language-toggle]');
const alternate = toggles[0].getAttribute('href');
const pageLanguage = alternate ? document.documentElement.lang : null;
const readingLinks = document.querySelectorAll('[data-reading-en-href]');
const readingText = document.querySelectorAll('[data-reading-en-text]');
let preference = storedLanguage() ?? pageLanguage ?? 'zh-Hans';

function storedLanguage() {
  try {
    const language = localStorage.getItem(storageKey);
    return language === 'en' || language === 'zh-Hans' ? language : null;
  } catch {
    return null;
  }
}

function alternateUrl() {
  return `${alternate}${location.search}${location.hash}`;
}

function syncReadingLanguage() {
  if (pageLanguage && pageLanguage !== preference) {
    location.replace(alternateUrl());
    return;
  }
  const language = preference;
  const inEnglish = language === 'en';
  for (const link of readingLinks) {
    link.href = inEnglish ? link.dataset.readingEnHref : link.dataset.readingZhHref;
  }
  for (const element of readingText) {
    element.lang = language;
    element.textContent = inEnglish ? element.dataset.readingEnText : element.dataset.readingZhText;
  }

  for (const toggle of toggles) {
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
}

function refreshPreference() {
  preference = storedLanguage() ?? preference;
  syncReadingLanguage();
}

function savePreference(language) {
  preference = language;
  try {
    localStorage.setItem(storageKey, preference);
  } catch {
    // Language links still work when browser storage is unavailable.
  }
}

for (const toggle of toggles) {
  toggle.addEventListener('click', () => {
    savePreference(preference === 'en' ? 'zh-Hans' : 'en');
    if (!alternate) syncReadingLanguage();
  });
}

window.addEventListener('pageshow', refreshPreference);
window.addEventListener('storage', (event) => {
  if (event.key === storageKey || event.key === null) refreshPreference();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshPreference();
});
if (alternate) window.addEventListener('hashchange', syncReadingLanguage);
savePreference(preference);
syncReadingLanguage();
