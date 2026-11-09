(() => {
  const storageKey = 'eabo-theme';
  const root = document.documentElement;
  const manualPreference = (value) => value === 'light' || value === 'dark' ? value : null;
  let manualTheme = null;
  let automaticTimer;

  try { manualTheme = manualPreference(localStorage.getItem(storageKey)); } catch {}

  function syncButton() {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    const dark = root.dataset.theme === 'dark';
    button.setAttribute('aria-pressed', String(dark));
    button.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    button.hidden = false;
  }

  function applyTheme(theme) {
    root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    syncButton();
    window.dispatchEvent(new Event('themechange'));
  }

  function refreshTheme() {
    window.clearTimeout(automaticTimer);
    const now = new Date();
    const hour = now.getHours();
    applyTheme(manualTheme || (hour >= 7 && hour < 19 ? 'light' : 'dark'));
    if (manualTheme || document.hidden) return;

    // Date setters use the visitor's local time, including daylight saving changes.
    const nextChange = new Date(now);
    if (hour < 7) {
      nextChange.setHours(7, 0, 0, 0);
    } else if (hour < 19) {
      nextChange.setHours(19, 0, 0, 0);
    } else {
      nextChange.setDate(nextChange.getDate() + 1);
      nextChange.setHours(7, 0, 0, 0);
    }
    automaticTimer = window.setTimeout(refreshTheme, nextChange.getTime() - now.getTime());
  }

  // Resolve the local-time default or saved manual choice before the page paints.
  refreshTheme();

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    syncButton();
    button.addEventListener('click', () => {
      manualTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      refreshTheme();
      try { localStorage.setItem(storageKey, manualTheme); } catch {}
    });
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    manualTheme = manualPreference(event.newValue);
    refreshTheme();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.clearTimeout(automaticTimer);
    else refreshTheme();
  });
  window.addEventListener('pageshow', refreshTheme);
})();
