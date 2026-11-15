const sections = [...document.querySelectorAll('[data-post-section]')];
const tocLinks = [...document.querySelectorAll('[data-post-toc] a')];
const languageLink = document.querySelector('[data-post-language]');
const languageRoute = languageLink?.getAttribute('href');
const sectionHashes = new Set(tocLinks.map((link) => link.hash));
let currentHash = '';
let frame = 0;

function updateCurrentSection() {
  frame = 0;
  const threshold = Math.min(104, window.innerHeight * 0.25);
  let section;
  for (const heading of sections) {
    if (heading.getBoundingClientRect().top > threshold) break;
    section = heading;
  }
  const scroller = document.scrollingElement;
  if (scroller?.scrollTop > 0 && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 2) {
    section = sections.at(-1);
  }
  const nextHash = section ? `#${encodeURIComponent(section.id)}` : '';
  if (nextHash === currentHash) return;
  currentHash = nextHash;
  for (const link of tocLinks) {
    if (link.hash === currentHash) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

function scheduleUpdate() {
  if (!frame) frame = requestAnimationFrame(updateCurrentSection);
}

function syncLanguageLink() {
  if (!languageLink) return;
  const hash = sectionHashes.has(window.location.hash) ? window.location.hash : '';
  languageLink.setAttribute('href', `${languageRoute}${hash}`);
}

const mobileToc = document.querySelector('.post-toc-mobile');
mobileToc?.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (event.target.closest('[data-post-toc] a')) mobileToc.open = false;
});

window.addEventListener('scroll', scheduleUpdate, { passive: true });
window.addEventListener('resize', scheduleUpdate);
window.addEventListener('pageshow', scheduleUpdate);
window.addEventListener('hashchange', () => {
  syncLanguageLink();
  scheduleUpdate();
});
syncLanguageLink();
scheduleUpdate();
