import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Marked, marked } from 'marked';
import matter from 'gray-matter';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const output = path.join(root, 'dist');

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const icons = {
  github: '<path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.08c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.73 1.16 1.73 1.16 1.01 1.72 2.65 1.22 3.3.93.1-.73.4-1.22.72-1.5-2.5-.29-5.13-1.25-5.13-5.57 0-1.23.44-2.24 1.16-3.03-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.55.23 2.7.12 2.98.72.79 1.15 1.8 1.15 3.03 0 4.33-2.63 5.28-5.14 5.56.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.78.54A11.2 11.2 0 0 0 12 .8Z"/>',
  twitter: '<path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.5 5.5 22H2.3l8.2-9.4L.8 2h6.5l4.5 6.9L18.9 2Zm-1.1 18h1.7L6.4 3.9H4.6L17.8 20Z"/>',
  linkedin: '<path d="M5.37 24H.4V7.98h4.97V24ZM2.88 5.8a2.89 2.89 0 1 1 0-5.78 2.89 2.89 0 0 1 0 5.78ZM24 24h-4.97v-7.79c0-1.85-.04-4.23-2.58-4.23-2.58 0-2.98 2.02-2.98 4.1V24H8.5V7.98h4.77v2.19h.07c.66-1.26 2.29-2.59 4.7-2.59C23.08 7.58 24 10.9 24 15.21V24Z"/>',
};
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
const globe = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>';
const chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const blogRoute = '/blog/';
const publicationRoute = '/publication/';
const blogCategories = ['tech', 'reflection'];
const categoryRoute = (category) => `${blogRoute}category/${category}/`;

function renderSocials(socials = {}) {
  const labels = { github: 'GitHub', twitter: 'X / Twitter', linkedin: 'LinkedIn' };
  return Object.entries(labels).map(([key, label]) => {
    const icon = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${icons[key]}</svg>`;
    const url = socials[key];
    if (!url) return `<span class="social-link is-pending" role="img" aria-label="${label}: link coming soon" title="${label} · Link coming soon">${icon}</span>`;
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error(`${label} must use an https:// URL.`);
    return `<a class="social-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer" aria-label="${label} (opens in a new tab)" title="${label}">${icon}</a>`;
  }).join('');
}

function shell(config, logo, assetURLs, { title, description, route = '/', active = 'about', body, pageClass = '', language = config.language || 'en', alternates = [], readingTools = false, commentBacklink = '' }) {
  const canonical = new URL(route, config.url).href;
  const siteLanguage = config.language || 'en';
  const chromeLanguage = language === siteLanguage ? '' : ` lang="${escape(siteLanguage)}"`;
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
  <script type="module" src="${assetURLs['pythagoras.js']}"></script>
  ${pageClass === 'about-page' ? `<script type="module" src="${assetURLs['typewriter.js']}"></script>` : ''}
  ${readingTools ? `<script type="module" src="${assetURLs['post-reading.js']}"></script>` : ''}
  ${commentBacklink ? `<script type="module" src="${assetURLs['post-comments.js']}"></script>` : ''}
</head>
<body>
  <canvas id="pythagoras-background" class="geometry-background" aria-hidden="true"></canvas>
  <a class="skip-link" href="#main"${chromeLanguage}>Skip to content</a>
  <div class="site-shell">
    <header class="site-header"${chromeLanguage}>
      <div class="site-brand">
        <a class="wordmark" href="/" aria-label="${escape(config.name)} home"><span class="wordmark-logo" aria-hidden="true">${logo}</span><span>${escape(config.name)}</span></a>
        <button class="theme-toggle" type="button" data-theme-toggle aria-label="Dark mode" aria-pressed="false" title="Switch to dark mode" hidden>
          <svg class="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>
          <svg class="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 14.1A8.7 8.7 0 0 1 9.9 3.2 8.7 8.7 0 1 0 20.8 14.1Z"/></svg>
        </button>
      </div>
      <nav class="main-nav" aria-label="Main navigation">
        <a href="/"${active === 'about' ? ' aria-current="page"' : ''}>About me</a>
        <a href="${blogRoute}"${active === 'blog' ? ' aria-current="page"' : ''}>Blog</a>
        <a href="${publicationRoute}"${active === 'publication' ? ' aria-current="page"' : ''}>Publication</a>
      </nav>
    </header>
    <main id="main" class="${pageClass}${readingTools ? ' has-toc' : ''}" tabindex="-1">${body}</main>
    ${route === '/' ? '' : `<nav class="page-home" aria-label="Return to homepage"${chromeLanguage}><a class="home-link" href="/"><span aria-hidden="true">←</span>Home</a></nav>`}
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

function renderPostList(posts, selectedCategory = null) {
  return `<ol class="post-list">${posts.map((post) => `
    <li class="post-row category-${post.category}">
      ${post.category === 'paper' ? '' : `<a class="post-category" href="${categoryRoute(post.category)}"${post.category === selectedCategory ? ' aria-current="page"' : ''}><span class="post-category-name">${post.category}</span></a>`}
      <time datetime="${post.date}">${post.date.length === 7 ? escape(formatDate(post.date)) : post.date}</time>
      <a class="post-link" href="${post.route}"><span class="post-title">${escape(post.title)}</span></a>
    </li>`).join('')}</ol>`;
}

function inlineText(tokens) {
  return tokens.map((token) => {
    if (token.tokens) return inlineText(token.tokens);
    if (token.type === 'html') return '';
    if (token.type === 'br') return ' ';
    return token.text || '';
  }).join('');
}

function renderBlogMarkdown(content, file, originalSections = null) {
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
  return { html: parser.parser(tokens), sections };
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
    title: data.title, description: data.description || '', summary: data.description || postExcerpt(content),
    route: `${post.route}zh/`,
    ...renderBlogMarkdown(content, `zh/${file}`, post.sections),
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
    const date = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date ?? '');
    if (!data.title || !isPostDate(date)) {
      throw new Error(`${file}: a title and a valid date (YYYY-MM or YYYY-MM-DD) are required.`);
    }
    if (!content.trim()) throw new Error(`${file}: the post is empty.`);
    const category = data.category ?? 'tech';
    if (!blogCategories.includes(category) && category !== 'paper') {
      throw new Error(`${file}: category must be tech, paper, or reflection.`);
    }
    const post = {
      title: data.title, description: data.description || '', date, category,
      summary: data.description || postExcerpt(content),
      slug, route: `${category === 'paper' ? publicationRoute : blogRoute}${slug}/`,
      ...(category === 'paper' ? { html: marked.parse(content), sections: [] } : renderBlogMarkdown(content, file)),
    };
    post.zh = category === 'paper' ? null : await loadChinesePost(folder, file, post);
    posts.push(post);
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

function postExcerpt(content) {
  const paragraph = marked.lexer(content).find((token) => token.type === 'paragraph');
  const characters = Array.from(inlineText(paragraph?.tokens || []).replace(/\s+/g, ' ').trim());
  if (!characters.length) return 'Read the full post.';
  return characters.length > 160 ? `${characters.slice(0, 160).join('').trimEnd()}…` : characters.join('');
}

function parsePostDate(date) {
  const calendarDate = date.length === 7 ? `${date}-01` : date;
  return new Date(`${calendarDate}T12:00:00Z`);
}

function isPostDate(date) {
  if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(date)) return false;
  const parsed = parsePostDate(date);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, date.length) === date;
}

function formatDate(date, locale = 'en-GB') {
  const options = { month: 'long', year: 'numeric', timeZone: 'UTC' };
  if (date.length === 10) options.day = 'numeric';
  return new Intl.DateTimeFormat(locale, options).format(parsePostDate(date));
}

function renderArticleComments(config, post, isChinese, label) {
  const { repo, repoId, category, categoryId, threads } = config;
  const number = threads?.[post.slug];
  const discussion = `https://github.com/${repo}/discussions${number ? `/${number}` : ''}`;
  return `<section class="article-comments" aria-labelledby="comments">
    <h2 id="comments" tabindex="-1" data-post-section>${label}</h2>
    <p>${isChinese ? '使用 GitHub 账号留言。' : 'Sign in with GitHub to leave a comment.'} <a href="${escape(discussion)}">${isChinese ? '在 GitHub 查看讨论' : 'View on GitHub'}</a></p>
    <div class="giscus" data-comment-widget data-repo="${escape(repo)}" data-repo-id="${escape(repoId)}" data-category="${escape(category)}" data-category-id="${escape(categoryId)}" data-lang="${isChinese ? 'zh-CN' : 'en'}" data-mapping="${number ? 'number' : 'specific'}" data-term="${escape(number || `blog/${post.slug}`)}"></div>
  </section>`;
}

function postPage(config, logo, assetURLs, post, edition = post) {
  const isPublication = post.category === 'paper';
  const isChinese = edition === post.zh;
  const siteLanguage = config.language || 'en';
  const language = isChinese ? 'zh-Hans' : siteLanguage;
  const navLanguage = isChinese ? ` lang="${escape(siteLanguage)}"` : '';
  const alternates = post.zh ? [{ language: siteLanguage, route: post.route }, { language: 'zh-Hans', route: post.zh.route }] : [];
  const other = post.zh ? alternates[isChinese ? 0 : 1] : null;
  const indexRoute = isPublication ? publicationRoute : blogRoute;
  const backLabel = isPublication ? 'All publications' : 'All posts';
  const tocLabel = isChinese ? '本文目录' : 'On this page';
  const comments = !isPublication && config.blogComments?.categoryId ? config.blogComments : null;
  const commentsLabel = isChinese ? '评论' : 'Comments';
  const sections = comments && edition.sections.length ? [...edition.sections, { id: 'comments', label: commentsLabel, depth: 2 }] : edition.sections;
  const toc = sections.length ? renderToc(sections) : '';
  const switchLabel = isChinese ? 'Read in English' : '阅读中文版';
  const switchLink = other ? `<a class="article-language" data-post-language href="${other.route}" hreflang="${other.language}" lang="${other.language}"><span>${globe}${switchLabel}</span></a>` : '';
  return shell(config, logo, assetURLs, {
    title: `${edition.title} — ${config.name}`, description: edition.description || edition.summary,
    route: edition.route, active: isPublication ? 'publication' : 'blog', pageClass: 'post-page',
    language, alternates, readingTools: Boolean(toc),
    commentBacklink: comments ? post.route : '',
    body: `<div class="post-reading">
      ${toc ? `<nav class="post-toc post-toc-desktop" data-post-toc aria-label="${tocLabel}"><p class="post-toc-label" aria-hidden="true">${tocLabel}</p>${toc}</nav>` : ''}
      <div class="post-reading-main">
        <a class="back-link" href="${indexRoute}"${navLanguage}>${arrow}${backLabel}</a>
        <article>
          <header class="article-header">
            <div class="post-meta"><a href="${isPublication ? publicationRoute : categoryRoute(post.category)}"${navLanguage}>${isPublication ? 'Publication' : post.category}</a><span aria-hidden="true">·</span><time datetime="${post.date}">${escape(formatDate(post.date, isChinese ? 'zh-CN' : 'en-GB'))}</time></div>
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

export async function buildSite({ quiet = false } = {}) {
  const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));
  if (!config.name || !config.url) throw new Error('site.config.json requires name and url.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email || '')) throw new Error('site.config.json requires a valid email.');
  const assetURLs = Object.fromEntries(await Promise.all(
    ['style.css', 'theme.js', 'pythagoras.js', 'typewriter.js', 'post-reading.js', 'post-comments.js'].map(async (file) => {
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
  const publications = posts.filter((post) => post.category === 'paper');
  const latestPost = blogPosts[0];
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
      ${latestPost ? `<a class="latest-post-card" href="${latestPost.route}">
        <span class="eyebrow">Latest post</span>
        <h2>${escape(latestPost.title)}</h2>
        <p>${escape(latestPost.summary)}</p>
        <span class="latest-post-read">Read post ${arrow}</span>
      </a>` : ''}`,
  }));

  for (const selectedCategory of [null, ...blogCategories]) {
    const route = selectedCategory ? categoryRoute(selectedCategory) : blogRoute;
    const visiblePosts = selectedCategory ? blogPosts.filter((post) => post.category === selectedCategory) : blogPosts;
    const categoryNav = `<nav class="category-nav" aria-label="Post categories">${blogCategories.map((category) => `
      <a class="category-link category-${category}" href="${categoryRoute(category)}"${category === selectedCategory ? ' aria-current="page"' : ''}>
        <span class="category-swatch" aria-hidden="true"></span><span>${category}</span>
      </a>`).join('')}</nav>`;
    const postList = visiblePosts.length ? renderPostList(visiblePosts, selectedCategory) : '<p class="blog-empty">No posts yet.</p>';
    pages.set(`${route.slice(1)}index.html`, shell(config, logo, assetURLs, {
      title: `${selectedCategory ? `${selectedCategory} — Blog` : 'Blog'} — ${config.name}`,
      route, active: 'blog', pageClass: 'blog-page',
      description: `${selectedCategory ? `${selectedCategory} notes` : 'Notes, ideas, and writing'} by ${config.name}.`,
      body: `<h1 class="sr-only" id="blog-title">${selectedCategory || 'Blog'}</h1>
      <section class="blog-index" aria-labelledby="blog-title">
        ${categoryNav}
        <div class="blog-posts">${selectedCategory ? `<a class="back-link" href="${blogRoute}">${arrow}All posts</a>` : ''}${postList}</div>
      </section>`,
    }));
  }

  pages.set(`${publicationRoute.slice(1)}index.html`, shell(config, logo, assetURLs, {
    title: `Publication — ${config.name}`, route: publicationRoute, active: 'publication', pageClass: 'publication-page',
    description: `Research publications by ${config.name}.`,
    body: `<h1 class="publication-title">Publication</h1>
      ${publications.length ? renderPostList(publications) : '<p class="page-description">No publications yet.</p>'}`,
  }));
  pages.set(`${categoryRoute('paper').slice(1)}index.html`, redirectPage(config, publicationRoute, 'Publication'));

  for (const post of posts) {
    pages.set(`${post.route.slice(1)}index.html`, postPage(config, logo, assetURLs, post));
    if (post.zh) pages.set(`${post.zh.route.slice(1)}index.html`, postPage(config, logo, assetURLs, post, post.zh));
    if (post.category === 'paper') pages.set(`blog/${post.slug}/index.html`, redirectPage(config, post.route, post.title));
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
  pages.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', blogRoute, publicationRoute, '/contact/', ...blogCategories.map(categoryRoute), ...postRoutes].map((route) => `<url><loc>${escape(new URL(route, config.url).href)}</loc></url>`).join('')}</urlset>\n`);

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
  await buildSite();
}
