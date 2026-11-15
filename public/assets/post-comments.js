const widget = document.querySelector('[data-comment-widget]');
const origin = 'https://giscus.app';
const root = document.documentElement;
const currentTheme = () => root.dataset.theme === 'dark' ? 'transparent_dark' : 'light';

if (widget) {
  const client = document.createElement('script');
  client.src = `${origin}/client.js`;
  client.async = true;
  client.crossOrigin = 'anonymous';
  Object.assign(client.dataset, widget.dataset, {
    strict: '1',
    reactionsEnabled: '0',
    emitMetadata: '0',
    inputPosition: 'top',
    loading: 'lazy',
    theme: currentTheme(),
  });
  widget.append(client);

  new MutationObserver(() => {
    const theme = currentTheme();
    client.dataset.theme = theme;
    widget.querySelector('iframe.giscus-frame')?.contentWindow?.postMessage({ giscus: { setConfig: { theme } } }, origin);
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
}
