(() => {
  const root = document.documentElement;
  let automaticTimer;

  function syncButton() {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    const dark = root.dataset.theme === 'dark';
    button.setAttribute('aria-pressed', String(dark));
    const source = root.dataset.themeSource === 'manual' ? 'Temporary selection' : 'Automatic by local time';
    button.title = `${source}. Switch to ${dark ? 'light' : 'dark'} mode`;
    button.hidden = false;
  }

  function applyTheme(theme, source = 'automatic') {
    root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    root.dataset.themeSource = source;
    syncButton();
    window.dispatchEvent(new Event('themechange'));
  }

  function refreshTheme() {
    window.clearTimeout(automaticTimer);
    const now = new Date();
    const hour = now.getHours();
    applyTheme(hour >= 7 && hour < 19 ? 'light' : 'dark');
    if (document.hidden) return;

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

  // Every page opening starts from local time, ignoring legacy saved preferences.
  refreshTheme();

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    syncButton();
    button.addEventListener('click', () => {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', 'manual');
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.clearTimeout(automaticTimer);
    else refreshTheme();
  });
  window.addEventListener('pageshow', refreshTheme);
})();
