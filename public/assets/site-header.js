const header = document.querySelector('.site-header');

function updateHeaderHeight() {
  const height = Math.ceil(header.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--site-header-height', `${height}px`);
}

updateHeaderHeight();
if ('ResizeObserver' in window) new ResizeObserver(updateHeaderHeight).observe(header);
