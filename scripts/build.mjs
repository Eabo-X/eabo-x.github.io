import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Marked, marked } from 'marked';
import matter from 'gray-matter';
import { ensureBlogDiscussions } from './blog-discussions.mjs';
import { linkBlogReferences } from './blog-references.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const output = path.join(root, 'dist');

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const icons = {
  github: '<path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.08c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.73 1.16 1.73 1.16 1.01 1.72 2.65 1.22 3.3.93.1-.73.4-1.22.72-1.5-2.5-.29-5.13-1.25-5.13-5.57 0-1.23.44-2.24 1.16-3.03-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.55.23 2.7.12 2.98.72.79 1.15 1.8 1.15 3.03 0 4.33-2.63 5.28-5.14 5.56.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.78.54A11.2 11.2 0 0 0 12 .8Z"/>',
  twitter: '<path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.5 5.5 22H2.3l8.2-9.4L.8 2h6.5l4.5 6.9L18.9 2Zm-1.1 18h1.7L6.4 3.9H4.6L17.8 20Z"/>',
  xiaohongshu: '<path d="M22.405 9.879c.002.016.01.02.07.019h.725a.797.797 0 0 0 .78-.972.794.794 0 0 0-.884-.618.795.795 0 0 0-.692.794c0 .101-.002.666.001.777zm-11.509 4.808c-.203.001-1.353.004-1.685.003a2.528 2.528 0 0 1-.766-.126.025.025 0 0 0-.03.014L7.7 16.127a.025.025 0 0 0 .01.032c.111.06.336.124.495.124.66.01 1.32.002 1.981 0 .01 0 .02-.006.023-.015l.712-1.545a.025.025 0 0 0-.024-.036zM.477 9.91c-.071 0-.076.002-.076.01a.834.834 0 0 0-.01.08c-.027.397-.038.495-.234 3.06-.012.24-.034.389-.135.607-.026.057-.033.042.003.112.046.092.681 1.523.787 1.74.008.015.011.02.017.02.008 0 .033-.026.047-.044.147-.187.268-.391.371-.606.306-.635.44-1.325.486-1.706.014-.11.021-.22.03-.33l.204-2.616.022-.293c.003-.029 0-.033-.03-.034zm7.203 3.757a1.427 1.427 0 0 1-.135-.607c-.004-.084-.031-.39-.235-3.06a.443.443 0 0 0-.01-.082c-.004-.011-.052-.008-.076-.008h-1.48c-.03.001-.034.005-.03.034l.021.293c.076.982.153 1.964.233 2.946.05.4.186 1.085.487 1.706.103.215.223.419.37.606.015.018.037.051.048.049.02-.003.742-1.642.804-1.765.036-.07.03-.055.003-.112zm3.861-.913h-.872a.126.126 0 0 1-.116-.178l1.178-2.625a.025.025 0 0 0-.023-.035l-1.318-.003a.148.148 0 0 1-.135-.21l.876-1.954a.025.025 0 0 0-.023-.035h-1.56c-.01 0-.02.006-.024.015l-.926 2.068c-.085.169-.314.634-.399.938a.534.534 0 0 0-.02.191.46.46 0 0 0 .23.378.981.981 0 0 0 .46.119h.59c.041 0-.688 1.482-.834 1.972a.53.53 0 0 0-.023.172.465.465 0 0 0 .23.398c.15.092.342.12.475.12l1.66-.001c.01 0 .02-.006.023-.015l.575-1.28a.025.025 0 0 0-.024-.035zm-6.93-4.937H3.1a.032.032 0 0 0-.034.033c0 1.048-.01 2.795-.01 6.829 0 .288-.269.262-.28.262h-.74c-.04.001-.044.004-.04.047.001.037.465 1.064.555 1.263.01.02.03.033.051.033.157.003.767.009.938-.014.153-.02.3-.06.438-.132.3-.156.49-.419.595-.765.052-.172.075-.353.075-.533.002-2.33 0-4.66-.007-6.991a.032.032 0 0 0-.032-.032zm11.784 6.896c0-.014-.01-.021-.024-.022h-1.465c-.048-.001-.049-.002-.05-.049v-4.66c0-.072-.005-.07.07-.07h.863c.08 0 .075.004.075-.074V8.393c0-.082.006-.076-.08-.076h-3.5c-.064 0-.075-.006-.075.073v1.445c0 .083-.006.077.08.077h.854c.075 0 .07-.004.07.07v4.624c0 .095.008.084-.085.084-.37 0-1.11-.002-1.304 0-.048.001-.06.03-.06.03l-.697 1.519s-.014.025-.008.036c.006.01.013.008.058.008 1.748.003 3.495.002 5.243.002.03-.001.034-.006.035-.033v-1.539zm4.177-3.43c0 .013-.007.023-.02.024-.346.006-.692.004-1.037.004-.014-.002-.022-.01-.022-.024-.005-.434-.007-.869-.01-1.303 0-.072-.006-.071.07-.07l.733-.003c.041 0 .081.002.12.015.093.025.16.107.165.204.006.431.002 1.153.001 1.153zm2.67.244a1.953 1.953 0 0 0-.883-.222h-.18c-.04-.001-.04-.003-.042-.04V10.21c0-.132-.007-.263-.025-.394a1.823 1.823 0 0 0-.153-.53 1.533 1.533 0 0 0-.677-.71 2.167 2.167 0 0 0-1-.258c-.153-.003-.567 0-.72 0-.07 0-.068.004-.068-.065V7.76c0-.031-.01-.041-.046-.039H17.93s-.016 0-.023.007c-.006.006-.008.012-.008.023v.546c-.008.036-.057.015-.082.022h-.95c-.022.002-.028.008-.03.032v1.481c0 .09-.004.082.082.082h.913c.082 0 .072.128.072.128V11.19s.003.117-.06.117h-1.482c-.068 0-.06.082-.06.082v1.445s-.01.068.064.068h1.457c.082 0 .076-.006.076.079v3.225c0 .088-.007.081.082.081h1.43c.09 0 .082.007.082-.08v-3.27c0-.029.006-.035.033-.035l2.323-.003c.098 0 .191.02.28.061a.46.46 0 0 1 .274.407c.008.395.003.79.003 1.185 0 .259-.107.367-.33.367h-1.218c-.023.002-.029.008-.028.033.184.437.374.871.57 1.303a.045.045 0 0 0 .04.026c.17.005.34.002.51.003.15-.002.517.004.666-.01a2.03 2.03 0 0 0 .408-.075c.59-.18.975-.698.976-1.313v-1.981c0-.128-.01-.254-.034-.38 0 .078-.029-.641-.724-.998z"/>',
  linkedin: '<path d="M5.37 24H.4V7.98h4.97V24ZM2.88 5.8a2.89 2.89 0 1 1 0-5.78 2.89 2.89 0 0 1 0 5.78ZM24 24h-4.97v-7.79c0-1.85-.04-4.23-2.58-4.23-2.58 0-2.98 2.02-2.98 4.1V24H8.5V7.98h4.77v2.19h.07c.66-1.26 2.29-2.59 4.7-2.59C23.08 7.58 24 10.9 24 15.21V24Z"/>',
};
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
const chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const globe = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>';
const languageIcon = `<svg class="language-toggle-icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <g class="language-card-zh">
    <rect x="9.5" y="8" width="12.5" height="13.5" rx="1.8" fill="var(--language-card-fill)"/>
    <path d="M15.4 12h4.7m-2.35-1.5V12m1.3 0c-.7 2.9-2.6 4.7-5.15 6.2m1.45-4.4c.9 1.85 2.4 3.25 4.45 4.4" fill="none" stroke="var(--language-card-ink)"/>
  </g>
  <g class="language-card-en">
    <rect x="2" y="2.5" width="12" height="13" rx="1.8" fill="var(--language-card-fill)"/>
    <path d="m5 12 3-6 3 6M6 10h4" fill="none" stroke="var(--language-card-ink)"/>
  </g>
</svg>`;
const blogRoute = '/blog/';
const publicationRoute = '/publication/';
const englishRoute = (route) => `/en${route}`;
const englishBlogRoute = englishRoute(blogRoute);
const englishPublicationRoute = englishRoute(publicationRoute);
const blogCategories = ['tech', 'reflection'];
const categoryRoute = (category, indexRoute = blogRoute) => `${indexRoute}category/${category}/`;

function renderSocials(socials = {}) {
  const labels = {
    github: 'GitHub',
    twitter: 'X / Twitter',
    xiaohongshu: 'Xiaohongshu (RedNote)',
    linkedin: 'LinkedIn',
  };
  return Object.entries(labels).map(([key, label]) => {
    const icon = `<svg class="social-icon-${key}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${icons[key]}</svg>`;
    const url = socials[key];
    if (!url) return `<span class="social-link is-pending" role="img" aria-label="${label}: link coming soon" title="${label} · Link coming soon">${icon}</span>`;
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error(`${label} must use an https:// URL.`);
    return `<a class="social-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer" aria-label="${label} (opens in a new tab)" title="${label}">${icon}</a>`;
  }).join('');
}

function readingAlternates(chinese, english = englishRoute(chinese)) {
  return [{ language: 'zh-Hans', route: chinese }, { language: 'en', route: english }];
}

function readingLinkAttributes(chinese, english = englishRoute(chinese)) {
  return `data-reading-zh-href="${escape(chinese)}" data-reading-en-href="${escape(english)}"`;
}

function readingTextAttributes(chinese, english) {
  return `data-reading-zh-text="${escape(chinese)}" data-reading-en-text="${escape(english)}"`;
}

function renderReadingLanguageToggle(language, alternates) {
  const alternate = alternates.find((edition) => edition.language !== language);
  const inEnglish = alternate?.language === 'zh-Hans';
  const label = `Switch reading language to ${inEnglish ? 'Chinese' : 'English'}`;
  const attributes = `class="language-toggle" data-reading-language-toggle data-reading-language="${inEnglish ? 'en' : 'zh-Hans'}" aria-label="${label}" title="${label}"`;
  return alternate
    ? `<a ${attributes} href="${escape(alternate.route)}" hreflang="${escape(alternate.language)}">${languageIcon}</a>`
    : `<button ${attributes} type="button" hidden>${languageIcon}</button>`;
}

function shell(config, logo, assetURLs, { title, description, route = '/', active = 'about', body, pageClass = '', language = config.language || 'en', alternates = [], readingTools = false, commentBacklink = '' }) {
  const canonical = new URL(route, config.url).href;
  const siteLanguage = config.language || 'en';
  const chromeLanguage = language === siteLanguage ? '' : ` lang="${escape(siteLanguage)}"`;
  const inEnglish = alternates.length > 0 && language === 'en';
  return `<!doctype html>
<html lang="${escape(language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escape(title)}</title>
  <meta name="description" content="${escape(description || config.description)}">
  <link rel="canonical" href="${escape(canonical)}">
  ${alternates.map(({ language, route }) => `<link rel="alternate" hreflang="${escape(language)}" href="${escape(new URL(route, config.url).href)}">`).join('\n  ')}
  ${commentBacklink ? `<meta name="giscus:backlink" content="${escape(new URL(commentBacklink, config.url).href)}">` : ''}
  <meta property="og:type" content="${pageClass === 'post-page' ? 'article' : 'website'}">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description || config.description)}">
  <meta property="og:url" content="${escape(canonical)}">
  <meta property="og:site_name" content="${escape(config.name)}">
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48 64x64">
  <link rel="icon" href="/assets/favicon-96.png" type="image/png" sizes="96x96">
  <link rel="icon" href="/assets/favicon.svg?v=2" type="image/svg+xml" sizes="any">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
  <script src="${assetURLs['theme.js']}"></script>
  ${['blog-page', 'publication-page', 'post-page'].includes(pageClass) ? `<link rel="preload" href="/assets/fonts/spectral-${pageClass === 'post-page' ? 'light' : 'regular'}-latin.woff2" as="font" type="font/woff2" crossorigin>` : ''}
  <link rel="stylesheet" href="${assetURLs['style.css']}">
  <script type="module" src="${assetURLs['site-header.js']}"></script>
  <script type="module" src="${assetURLs['pythagoras.js']}"></script>
  <script type="module" src="${assetURLs['reading-language.js']}"></script>
  ${pageClass === 'about-page' ? `<script type="module" src="${assetURLs['typewriter.js']}"></script>` : ''}
  ${readingTools ? `<script type="module" src="${assetURLs['post-reading.js']}"></script>` : ''}
  ${commentBacklink ? `<script type="module" src="${assetURLs['post-comments.js']}"></script>` : ''}
</head>
<body>
  <canvas id="pythagoras-background" class="geometry-background" aria-hidden="true"></canvas>
  <a class="skip-link" href="#main"${chromeLanguage}>Skip to content</a>
  <div class="site-shell">
    <header class="site-header"${chromeLanguage}>
      <div class="site-frame site-header-inner">
        <div class="site-brand">
          <a class="wordmark" href="/" aria-label="${escape(config.name)} home"><span class="wordmark-logo" aria-hidden="true">${logo}</span><span>${escape(config.name)}</span></a>
          <div class="site-controls">
            <button class="theme-toggle" type="button" data-theme-toggle aria-label="Dark mode" aria-pressed="false" title="Switch to dark mode" hidden>
              <svg class="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>
              <svg class="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 14.1A8.7 8.7 0 0 1 9.9 3.2 8.7 8.7 0 1 0 20.8 14.1Z"/></svg>
            </button>
            ${renderReadingLanguageToggle(language, alternates)}
          </div>
        </div>
        <nav class="main-nav" aria-label="Main navigation">
          <a href="/"${active === 'about' ? ' aria-current="page"' : ''}>About me</a>
          <a href="${inEnglish ? englishBlogRoute : blogRoute}" ${readingLinkAttributes(blogRoute)}${active === 'blog' ? ' aria-current="page"' : ''}>Blog</a>
          <a href="${inEnglish ? englishPublicationRoute : publicationRoute}" ${readingLinkAttributes(publicationRoute)}${active === 'publication' ? ' aria-current="page"' : ''}>Publication</a>
        </nav>
      </div>
    </header>
    <div class="site-frame site-content">
      <main id="main" class="${pageClass}${readingTools ? ' has-toc' : ''}" tabindex="-1">${body}</main>
      ${route === '/' ? '' : `<nav class="page-home" aria-label="Return to homepage"${chromeLanguage}><a class="home-link" href="/"><span aria-hidden="true">←</span>Home</a></nav>`}
    </div>
  </div>
</body>
</html>
`;
}

function redirectPage(config, route, label) {
  return `<!doctype html>
<html lang="${escape(config.language || 'en')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(label)} — ${escape(config.name)}</title>
  <link rel="canonical" href="${escape(new URL(route, config.url).href)}">
  <meta http-equiv="refresh" content="0; url=${escape(route)}">
</head>
<body><p>This page has moved. <a href="${escape(route)}">Continue to ${escape(label)}</a>.</p></body>
</html>
`;
}

function renderLatestPost(post) {
  const chinese = post.zh;
  const edition = chinese ?? post;
  const language = chinese ? ' lang="zh-Hans"' : '';
  const category = post.category === 'tech' ? 'Tech' : 'Reflection';
  return `<a class="latest-post-card" href="${edition.route}"${chinese ? ` ${readingLinkAttributes(chinese.route, post.route)}` : ''}>
    <span class="eyebrow">Latest post · ${category}</span>
    <h2${language}${chinese ? ` ${readingTextAttributes(chinese.title, post.title)}` : ''}>${escape(edition.title)}</h2>
    <p${language}${chinese ? ` ${readingTextAttributes(chinese.summary, post.summary)}` : ''}>${escape(edition.summary)}</p>
    <span class="latest-post-read">Read post ${arrow}</span>
  </a>`;
}

function renderPostList(posts, selectedCategory = null, isChinese = false) {
  const indexRoute = isChinese ? blogRoute : englishBlogRoute;
  return `<ol class="post-list">${posts.map((post) => {
    const edition = isChinese ? post.zh ?? post : post;
    let dateLabel = post.date;
    if (isChinese) dateLabel = formatDate(post.date, 'zh-CN');
    else if (post.layout === 'essay') dateLabel = formatDate(post.date, 'en-US', 'short');
    else if (post.date.length === 7) dateLabel = formatDate(post.date);
    return `
    <li class="post-row category-${post.category}">
      ${post.category === 'paper' ? '' : `<a class="post-category" href="${categoryRoute(post.category, indexRoute)}" aria-label="${post.category}"${isChinese ? ' lang="en"' : ''}${post.category === selectedCategory ? ' aria-current="page"' : ''}><span class="category-swatch" aria-hidden="true"></span></a>`}
      <time datetime="${post.date}">${escape(dateLabel)}</time>
      <a class="post-link" href="${edition.route}"${isChinese && edition === post ? ' lang="en"' : ''}><span class="post-title">${escape(edition.title)}</span></a>
    </li>`;
  }).join('')}</ol>`;
}

function inlineText(tokens) {
  return tokens.map((token) => {
    if (token.tokens) return inlineText(token.tokens);
    if (token.type === 'html') return '';
    if (token.type === 'br') return ' ';
    return token.text || '';
  }).join('');
}

function renderBlogMarkdown(content, file, originalSections = null, citationAliases = {}) {
  const ids = new Map();
  const parser = new Marked({ renderer: {
    heading(token) {
      const id = ids.get(token);
      if (!id) return false;
      return `<h${token.depth} id="${escape(id)}" tabindex="-1" data-post-section>${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
    },
  } });
  const tokens = parser.lexer(content);
  const headings = tokens.filter((token) => token.type === 'heading' && token.depth >= 2 && token.depth <= 4);
  if (originalSections && (headings.length !== originalSections.length || headings.some((token, index) => token.depth !== originalSections[index].depth))) {
    throw new Error(`${file}: translation headings must match the original heading count and levels.`);
  }
  const used = new Set();
  const sections = headings.map((token, index) => {
    const label = inlineText(token.tokens).replace(/\s+/g, ' ').trim();
    const slug = label.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    const base = `section-${slug || index + 1}`;
    // The same fragment leads to the corresponding section in either language.
    let id = originalSections?.[index].id || base;
    for (let suffix = 2; used.has(id); suffix++) id = `${base}-${suffix}`;
    used.add(id);
    ids.set(token, id);
    return { id, label, depth: token.depth };
  });
  return { html: linkBlogReferences(parser.parser(tokens), citationAliases, file), sections };
}

function renderPostContent(content, file, category, originalSections = null, citationAliases = {}) {
  if (category === 'paper') return { html: marked.parse(content), sections: [] };
  return renderBlogMarkdown(content, file, originalSections, citationAliases);
}

function renderToc(sections) {
  const roots = [];
  const parents = [];
  for (const section of sections) {
    while (parents.length && parents.at(-1).depth >= section.depth) parents.pop();
    const entry = { ...section, children: [] };
    (parents.at(-1)?.children ?? roots).push(entry);
    parents.push(entry);
  }
  const render = (entries) => `<ol class="post-toc-list">${entries.map(({ id, label, children }) =>
    `<li><a href="#${encodeURIComponent(id)}">${escape(label)}</a>${children.length ? render(children) : ''}</li>`).join('')}</ol>`;
  return render(roots);
}

async function loadChinesePost(folder, file, post) {
  const source = await readFile(path.join(folder, 'zh', file), 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (source === null) return null;
  const { data, content } = matter(source);
  if (data.draft !== false) return null;
  if (typeof data.title !== 'string' || !data.title.trim() || !content.trim()) {
    throw new Error(`zh/${file}: a title and translated text are required.`);
  }
  return {
    title: data.title, description: data.description || '', summary: data.description || postExcerpt(content, '阅读全文。'),
    route: post.route,
    ...renderPostContent(content, `zh/${file}`, post.category, post.sections, { ...post.citationAliases, ...data.citationAliases }),
  };
}

async function loadPosts() {
  const folder = path.join(root, 'content/posts');
  const files = (await readdir(folder)).filter((file) => file.endsWith('.md'));
  const posts = [];
  for (const file of files) {
    const { data, content } = matter(await readFile(path.join(folder, file), 'utf8'));
    if (data.draft !== false) continue;
    const slug = file.slice(0, -3);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`${file}: use a lowercase, hyphen-separated filename.`);
    }
    if (!data.title) throw new Error(`${file}: a title is required.`);
    const date = readPostDate(data.date, file);
    if (!content.trim()) throw new Error(`${file}: the post is empty.`);
    const category = data.category ?? 'tech';
    if (!blogCategories.includes(category) && category !== 'paper') {
      throw new Error(`${file}: category must be tech, paper, or reflection.`);
    }
    const post = {
      title: data.title, description: data.description || '', date, category,
      layout: data.layout,
      citationAliases: data.citationAliases || {},
      summary: data.description || postExcerpt(content),
      slug, route: `${category === 'paper' ? publicationRoute : blogRoute}${slug}/`,
      ...renderPostContent(content, file, category, null, data.citationAliases),
    };
    post.zh = await loadChinesePost(folder, file, post);
    if (post.zh) post.route = englishRoute(post.route);
    posts.push(post);
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

function postExcerpt(content, fallback = 'Read the full post.') {
  const paragraph = marked.lexer(content).find((token) => token.type === 'paragraph');
  const characters = Array.from(inlineText(paragraph?.tokens || []).replace(/\s+/g, ' ').trim());
  if (!characters.length) return fallback;
  return characters.length > 160 ? `${characters.slice(0, 160).join('').trimEnd()}…` : characters.join('');
}

function parsePostDate(date) {
  const calendarDate = date.length === 7 ? `${date}-01` : date;
  return new Date(`${calendarDate}T12:00:00Z`);
}

function readPostDate(value, file) {
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '');
  const parsed = parsePostDate(date);
  if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, date.length) !== date) {
    throw new Error(`${file}: a valid date (YYYY-MM or YYYY-MM-DD) is required.`);
  }
  return date;
}

function formatDate(date, locale = 'en-GB', month = 'long') {
  const options = { month, year: 'numeric', timeZone: 'UTC' };
  if (date.length === 10) options.day = 'numeric';
  return new Intl.DateTimeFormat(locale, options).format(parsePostDate(date));
}

function renderArticleComments(config, post, isChinese, label) {
  const { repo, repoId, category, categoryId, threads } = config;
  const number = threads && Object.hasOwn(threads, post.slug) ? threads[post.slug] : undefined;
  const discussionLink = number
    ? `<a href="${escape(`https://github.com/${repo}/discussions/${number}`)}">${isChinese ? '在 GitHub 查看讨论' : 'View on GitHub'}</a>`
    : '';
  return `<section class="article-comments" aria-labelledby="comments">
    <div class="article-comments-heading">
      <h2 id="comments" tabindex="-1" data-post-section>${label}</h2>
      ${discussionLink}
    </div>
    <div class="giscus" data-comment-widget data-repo="${escape(repo)}" data-repo-id="${escape(repoId)}" data-category="${escape(category)}" data-category-id="${escape(categoryId)}" data-lang="${isChinese ? 'zh-CN' : 'en'}" data-mapping="${number ? 'number' : 'specific'}" data-term="${escape(number || `blog/${post.slug}`)}"></div>
  </section>`;
}

function postPage(config, logo, assetURLs, post, edition = post) {
  const isPublication = post.category === 'paper';
  const isChinese = edition === post.zh;
  const isEssay = post.layout === 'essay';
  const siteLanguage = config.language || 'en';
  const language = isChinese ? 'zh-Hans' : 'en';
  const navLanguage = isChinese ? ` lang="${escape(siteLanguage)}"` : '';
  const alternates = post.zh ? readingAlternates(post.zh.route, post.route) : [];
  const alternate = alternates.find((edition) => edition.language !== language);
  const switchLink = alternate
    ? `<a class="article-language" data-reading-language-toggle href="${escape(alternate.route)}" hreflang="${escape(alternate.language)}" lang="${escape(alternate.language)}"><span>${globe}${isChinese ? 'Read in English' : '阅读中文版'}</span></a>`
    : '';
  const inEnglish = Boolean(post.zh) && !isChinese;
  const indexRoute = isPublication ? publicationRoute : blogRoute;
  const metaRoute = isPublication ? publicationRoute : categoryRoute(post.category);
  const backLabel = isPublication ? 'All publications' : 'All posts';
  const tocLabel = isChinese ? '本文目录' : 'On this page';
  const comments = !isPublication && config.blogComments?.categoryId ? config.blogComments : null;
  const commentsLabel = isChinese ? '评论' : 'Comments';
  const sections = comments && edition.sections.length ? [...edition.sections, { id: 'comments', label: commentsLabel, depth: 2 }] : edition.sections;
  const toc = sections.length ? renderToc(sections) : '';
  const dateLabel = formatDate(post.date, isChinese ? 'zh-CN' : 'en-GB');
  return shell(config, logo, assetURLs, {
    title: `${edition.title} — ${config.name}`, description: edition.description || edition.summary,
    route: edition.route, active: isPublication ? 'publication' : 'blog', pageClass: 'post-page',
    language, alternates, readingTools: Boolean(toc),
    commentBacklink: comments ? (post.zh ?? post).route : '',
    body: `<div class="post-reading">
      ${toc ? `<nav class="post-toc post-toc-desktop" data-post-toc aria-label="${tocLabel}"><p class="post-toc-label" aria-hidden="true">${tocLabel}</p>${toc}</nav>` : ''}
      <div class="post-reading-main">
        <a class="back-link" href="${inEnglish ? englishRoute(indexRoute) : indexRoute}" ${readingLinkAttributes(indexRoute)}${navLanguage}>${arrow}${backLabel}</a>
        <article${isEssay ? ' class="article-essay"' : ''}>
          <header class="article-header">
            <div class="post-meta"><a href="${inEnglish ? englishRoute(metaRoute) : metaRoute}" ${readingLinkAttributes(metaRoute)}${navLanguage}>${isPublication ? 'Publication' : post.category}</a><span aria-hidden="true">·</span><time datetime="${post.date}">${escape(dateLabel)}</time></div>
            <h1>${escape(edition.title)}</h1>
            ${edition.description ? `<p class="page-description">${escape(edition.description)}</p>` : ''}
            ${switchLink}
          </header>
          ${toc ? `<details class="post-toc-mobile"><summary>${tocLabel}${chevron}</summary><nav class="post-toc" data-post-toc aria-label="${tocLabel}">${toc}</nav></details>` : ''}
          <div class="article-body prose">${edition.html}</div>
          ${comments ? renderArticleComments(comments, post, isChinese, commentsLabel) : ''}
        </article>
      </div>
    </div>`,
  });
}

export async function buildSite({ quiet = false, discussionToken } = {}) {
  const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));
  if (!config.name || !config.url) throw new Error('site.config.json requires name and url.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email || '')) throw new Error('site.config.json requires a valid email.');
  const assetURLs = Object.fromEntries(await Promise.all(
    ['style.css', 'theme.js', 'site-header.js', 'pythagoras.js', 'typewriter.js', 'reading-language.js', 'post-reading.js', 'post-comments.js'].map(async (file) => {
      const content = await readFile(path.join(root, 'public/assets', file));
      const version = createHash('sha256').update(content).digest('hex').slice(0, 12);
      return [file, `/assets/${file}?v=${version}`];
    }),
  ));
  // Keep the original logo paths as vectors at every display density.
  const logo = (await readFile(path.join(root, 'public/assets/eabo-x-logo.svg'), 'utf8')).trim()
    .replace(/<svg\b[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="32" height="32" aria-hidden="true" focusable="false" shape-rendering="geometricPrecision">');
  const about = marked.parse(await readFile(path.join(root, 'content/about.md'), 'utf8'));
  const posts = await loadPosts();
  const blogPosts = posts.filter((post) => post.category !== 'paper');
  if (discussionToken) {
    const threads = await ensureBlogDiscussions(config.blogComments, blogPosts, config.url, discussionToken);
    config.blogComments.threads = threads;
  }
  const publications = posts.filter((post) => post.category === 'paper');
  const latestPosts = blogCategories.map((category) => blogPosts.find((post) => post.category === category)).filter(Boolean);
  const siteLanguage = config.language || 'en';
  const greetings = [`Hi, I’m ${config.name} 😊`, '👋 Glad to meet you!'];
  const pages = new Map();

  pages.set('index.html', shell(config, logo, assetURLs, {
    title: `${config.name} — About me`, pageClass: 'about-page',
    body: `
      <section class="intro" aria-labelledby="intro-title">
        <h1 id="intro-title" class="typewriter-title" aria-label="${escape(greetings.join(' '))}"><span class="typewriter-reserve" aria-hidden="true">${greetings.map(greeting => `<span>${escape(greeting)}</span>`).join('')}</span><span class="typewriter-display" aria-hidden="true"><span data-typewriter="${escape(JSON.stringify(greetings))}">${escape(greetings[0])}</span><span class="typewriter-cursor"></span></span></h1>
        <div class="socials intro-socials" role="group" aria-label="Social and contact links">${renderSocials(config.socials)}<a class="social-link" href="/contact/" aria-label="Email contact page" title="Email"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6 9 7 9-7"/></svg></a></div>
        <div class="about-copy prose">${about}</div>
      </section>
      ${latestPosts.length ? `<section class="latest-posts" aria-label="Latest posts">${latestPosts.map(renderLatestPost).join('')}</section>` : ''}`,
  }));

  const blogIndexRoutes = [];
  for (const selectedCategory of [null, ...blogCategories]) {
    const visiblePosts = selectedCategory ? blogPosts.filter((post) => post.category === selectedCategory) : blogPosts;
    const alternates = readingAlternates(selectedCategory ? categoryRoute(selectedCategory) : blogRoute);
    for (const { language, route } of alternates) {
      const isChinese = language === 'zh-Hans';
      const indexRoute = isChinese ? blogRoute : englishBlogRoute;
      const navLanguage = isChinese ? ` lang="${escape(siteLanguage)}"` : '';
      const blogTitle = isChinese ? '博客' : 'Blog';
      const categoryNav = `<nav class="category-nav" aria-label="${isChinese ? '文章分类' : 'Post categories'}">${blogCategories.map((category) => `
        <a class="category-link category-${category}" href="${categoryRoute(category, indexRoute)}"${navLanguage}${category === selectedCategory ? ' aria-current="page"' : ''}>
          <span class="category-swatch" aria-hidden="true"></span><span>${category}</span>
        </a>`).join('')}</nav>`;
      const postList = visiblePosts.length ? renderPostList(visiblePosts, selectedCategory, isChinese)
        : `<p class="blog-empty">${isChinese ? '还没有文章。' : 'No posts yet.'}</p>`;
      blogIndexRoutes.push(route);
      pages.set(`${route.slice(1)}index.html`, shell(config, logo, assetURLs, {
        title: `${selectedCategory ? `${selectedCategory} — ` : ''}${blogTitle} — ${config.name}`,
        route, language, alternates, active: 'blog', pageClass: 'blog-page',
        description: isChinese ? `${config.name} 的博客。` : `${selectedCategory ? `${selectedCategory} notes` : 'Notes, ideas, and writing'} by ${config.name}.`,
        body: `<h1 class="sr-only" id="blog-title"${selectedCategory ? navLanguage : ''}>${selectedCategory || blogTitle}</h1>
        <section class="blog-index" aria-labelledby="blog-title">
          ${categoryNav}
          <div class="blog-posts">
            ${selectedCategory ? `<a class="back-link" href="${indexRoute}"${navLanguage}>${arrow}All posts</a>` : ''}
            ${postList}
          </div>
        </section>`,
      }));
    }
  }

  const publicationAlternates = readingAlternates(publicationRoute);
  for (const { language, route } of publicationAlternates) {
    const isChinese = language === 'zh-Hans';
    const headingLanguage = isChinese ? ` lang="${escape(siteLanguage)}"` : '';
    pages.set(`${route.slice(1)}index.html`, shell(config, logo, assetURLs, {
      title: `Publication — ${config.name}`, route, language, alternates: publicationAlternates,
      active: 'publication', pageClass: 'publication-page',
      description: isChinese ? `${config.name} 的研究出版物。` : `Research publications by ${config.name}.`,
      body: `<h1 class="publication-title"${headingLanguage}>Publication</h1>
        ${publications.length ? renderPostList(publications, null, isChinese) : ''}`,
    }));
  }
  pages.set(`${categoryRoute('paper').slice(1)}index.html`, redirectPage(config, publicationRoute, 'Publication'));

  for (const post of posts) {
    pages.set(`${post.route.slice(1)}index.html`, postPage(config, logo, assetURLs, post));
    if (post.zh) {
      const chinesePage = postPage(config, logo, assetURLs, post, post.zh);
      pages.set(`${post.zh.route.slice(1)}index.html`, chinesePage);
      // Keep previously shared Chinese URLs, including their section links.
      pages.set(`${post.zh.route.slice(1)}zh/index.html`, chinesePage);
    }
    if (post.category === 'paper') {
      const defaultEdition = post.zh ?? post;
      pages.set(`blog/${post.slug}/index.html`, redirectPage(config, defaultEdition.route, defaultEdition.title));
    }
  }

  const profileHandle = (url) => url ? `@${new URL(url).pathname.split('/').filter(Boolean)[0]}` : '';
  const contactLinks = [
    { label: 'Email', emoji: '✉️', value: config.email, href: `mailto:${config.email}` },
    { label: 'X', emoji: '💬', value: profileHandle(config.socials?.twitter), href: config.socials?.twitter },
    { label: 'GitHub', emoji: '🐙', value: profileHandle(config.socials?.github), href: config.socials?.github },
  ].filter((link) => link.href);
  pages.set('contact/index.html', shell(config, logo, assetURLs, {
    title: `Contact — ${config.name}`, route: '/contact/', active: '', pageClass: 'contact-page',
    description: `Contact ${config.name} by email.`,
    body: `<section class="contact-intro" aria-labelledby="contact-title">
      <h1 id="contact-title" class="contact-title">let’s talk! <span role="img" aria-label="waving hand">👋</span></h1>
      <p class="contact-description">feel free to reach out through any of these :)</p>
      <dl class="contact-list">${contactLinks.map((link) => `
        <div class="contact-row">
          <dt><span class="contact-emoji" aria-hidden="true">${link.emoji}</span>${link.label}</dt>
          <dd><a href="${escape(link.href)}"${link.href.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escape(link.value)}</a></dd>
        </div>`).join('')}
      </dl>
    </section>`,
  }));

  pages.set('404.html', shell(config, logo, assetURLs, {
    title: `Page not found — ${config.name}`, route: '/404.html', active: '', pageClass: 'not-found-page',
    body: `<p class="eyebrow">404</p><h1>A little off track<span class="accent">.</span></h1><p class="page-description">This page doesn’t seem to be here.</p><a class="text-link" href="/">Back to About me ${arrow}</a>`,
  }));
  pages.set('.nojekyll', '');
  pages.set('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', config.url).href}\n`);
  const postRoutes = posts.flatMap((post) => post.zh ? [post.route, post.zh.route] : [post.route]);
  const publicationIndexRoutes = publicationAlternates.map(({ route }) => route);
  pages.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', ...blogIndexRoutes, ...publicationIndexRoutes, '/contact/', ...postRoutes].map((route) => `<url><loc>${escape(new URL(route, config.url).href)}</loc></url>`).join('')}</urlset>\n`);

  // All content is rendered before replacing dist, so invalid posts fail the build early.
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(path.join(root, 'public'), output, { recursive: true });
  for (const [file, content] of pages) {
    await mkdir(path.dirname(path.join(output, file)), { recursive: true });
    await writeFile(path.join(output, file), content);
  }
  if (!quiet) console.log(`Built About me, Blog, and Publication (${blogPosts.length} blog posts, ${publications.length} publications) → dist/`);
  return { posts: posts.length, pages: pages.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const provisionDiscussions = process.argv.includes('--provision-discussions');
  if (provisionDiscussions && !process.env.GITHUB_TOKEN) {
    throw new Error('Publishing blog discussions requires GITHUB_TOKEN.');
  }
  await buildSite({ discussionToken: provisionDiscussions ? process.env.GITHUB_TOKEN : undefined });
}
