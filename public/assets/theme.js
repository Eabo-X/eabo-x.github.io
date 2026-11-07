(() => {
  const storageKey = 'eabo-theme';
  const root = document.documentElement;
  let savedTheme;

  try { savedTheme = localStorage.getItem(storageKey); } catch {}

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

  // Restore the preference before the stylesheet paints the page.
  applyTheme(savedTheme);

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    syncButton();
    button.addEventListener('click', () => {
      const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(theme);
      try { localStorage.setItem(storageKey, theme); } catch {}
    });
  });

  window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) applyTheme(event.newValue);
  });
})();
