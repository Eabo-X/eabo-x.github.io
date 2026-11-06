import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
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
const categories = ['tech', 'paper', 'reflection'];
const categoryRoute = (category) => `/blog/category/${category}/`;

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

function shell(config, logo, { title, description, route = '/', active = 'about', body, pageClass = '' }) {
  const canonical = new URL(route, config.url).href;
  return `<!doctype html>
<html lang="${escape(config.language || 'en')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escape(title)}</title>
  <meta name="description" content="${escape(description || config.description)}">
  <link rel="canonical" href="${escape(canonical)}">
  <meta property="og:type" content="${pageClass === 'post-page' ? 'article' : 'website'}">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description || config.description)}">
  <meta property="og:url" content="${escape(canonical)}">
  <meta property="og:site_name" content="${escape(config.name)}">
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48 64x64">
  <link rel="icon" href="/assets/favicon-96.png" type="image/png" sizes="96x96">
  <link rel="icon" href="/assets/favicon.svg?v=2" type="image/svg+xml" sizes="any">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
  <link rel="stylesheet" href="/assets/style.css">
  <script type="module" src="/assets/pythagoras.js"></script>
  ${pageClass === 'about-page' ? '<script type="module" src="/assets/typewriter.js"></script>' : ''}
</head>
<body>
  <canvas id="pythagoras-background" class="geometry-background" aria-hidden="true"></canvas>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="site-shell">
    <header class="site-header">
      <a class="wordmark" href="/" aria-label="${escape(config.name)} home"><span class="wordmark-logo" aria-hidden="true">${logo}</span><span>${escape(config.name)}</span></a>
      <nav class="main-nav" aria-label="Main navigation">
        <a href="/"${active === 'about' ? ' aria-current="page"' : ''}>About me</a>
        <a href="/blog/"${active === 'blog' ? ' aria-current="page"' : ''}>Blog</a>
      </nav>
    </header>
    <main id="main" class="${pageClass}" tabindex="-1">${body}</main>
    ${route === '/' ? '' : '<nav class="page-home" aria-label="Return to homepage"><a class="home-link" href="/"><span aria-hidden="true">←</span>Home</a></nav>'}
  </div>
</body>
</html>
`;
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
    if (!data.title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      throw new Error(`${file}: a title and a valid date (YYYY-MM-DD) are required.`);
    }
    if (!content.trim()) throw new Error(`${file}: the post is empty.`);
    const category = data.category ?? 'tech';
    if (!categories.includes(category)) {
      throw new Error(`${file}: category must be tech, paper, or reflection.`);
    }
    posts.push({
      title: data.title, description: data.description || '', date, category,
      summary: data.description || postExcerpt(content),
      slug, route: `/blog/${slug}/`, html: marked.parse(content),
      minutes: Math.max(1, Math.ceil((content.match(/[\u3400-\u9FFF]|[\p{L}\p{N}]+/gu) || []).length / 220)),
    });
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

function postExcerpt(content) {
  const paragraph = marked.lexer(content).find((token) => token.type === 'paragraph');
  const text = (tokens) => tokens.map((token) => {
    if (token.tokens) return text(token.tokens);
    if (token.type === 'html') return '';
    if (token.type === 'br') return ' ';
    return token.text || '';
  }).join('');
  const characters = Array.from(text(paragraph?.tokens || []).replace(/\s+/g, ' ').trim());
  if (!characters.length) return 'Read the full post.';
  return characters.length > 160 ? `${characters.slice(0, 160).join('').trimEnd()}…` : characters.join('');
}

const formatDate = (date, options = { month: 'long', day: 'numeric', year: 'numeric' }) =>
  new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

export async function buildSite({ quiet = false } = {}) {
  const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));
  if (!config.name || !config.url) throw new Error('site.config.json requires name and url.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email || '')) throw new Error('site.config.json requires a valid email.');
  // Keep the original logo paths as vectors at every display density.
  const logo = (await readFile(path.join(root, 'public/assets/eabo-x-logo.svg'), 'utf8')).trim()
    .replace(/<svg\b[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="32" height="32" aria-hidden="true" focusable="false" shape-rendering="geometricPrecision">');
  const about = marked.parse(await readFile(path.join(root, 'content/about.md'), 'utf8'));
  const posts = await loadPosts();
  const latestPost = posts[0];
  const greetings = [`Hi, I’m ${config.name} 😊`, '👋 Glad to meet you!'];
  const pages = new Map();

  pages.set('index.html', shell(config, logo, {
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

  for (const selectedCategory of [null, ...categories]) {
    const route = selectedCategory ? categoryRoute(selectedCategory) : '/blog/';
    const visiblePosts = selectedCategory ? posts.filter((post) => post.category === selectedCategory) : posts;
    const categoryNav = `<nav class="category-nav" aria-label="Post categories">${categories.map((category) => `
      <a class="category-link category-${category}" href="${categoryRoute(category)}"${category === selectedCategory ? ' aria-current="page"' : ''}>
        <span class="category-swatch" aria-hidden="true"></span><span>${category}</span>
      </a>`).join('')}</nav>`;
    const postList = visiblePosts.length ? `<ol class="post-list">${visiblePosts.map((post) => `
      <li><a class="post-link category-${post.category}" href="${post.route}">
        <time datetime="${post.date}">${post.date}</time>
        <span class="post-title">${escape(post.title)}</span>
      </a></li>`).join('')}</ol>` : '<p class="blog-empty">No posts yet.</p>';
    pages.set(`${route.slice(1)}index.html`, shell(config, logo, {
      title: `${selectedCategory ? `${selectedCategory} — Blog` : 'Blog'} — ${config.name}`,
      route, active: 'blog', pageClass: 'blog-page',
      description: `${selectedCategory ? `${selectedCategory} notes` : 'Notes, ideas, and writing'} by ${config.name}.`,
      body: `<h1 class="sr-only" id="blog-title">${selectedCategory || 'Blog'}</h1>
      <section class="blog-index" aria-labelledby="blog-title">
        ${categoryNav}
        <div class="blog-posts">${postList}</div>
      </section>`,
    }));
  }

  for (const post of posts) {
    pages.set(`blog/${post.slug}/index.html`, shell(config, logo, {
      title: `${post.title} — ${config.name}`, description: post.description,
      route: post.route, active: 'blog', pageClass: 'post-page',
      body: `<a class="back-link" href="/blog/">${arrow}All posts</a>
      <article>
        <header class="article-header">
          <div class="post-meta"><time datetime="${post.date}">${escape(formatDate(post.date))}</time><span aria-hidden="true">·</span><span>${post.minutes} min read</span></div>
          <h1>${escape(post.title)}</h1>
          ${post.description ? `<p class="page-description">${escape(post.description)}</p>` : ''}
        </header>
        <div class="article-body prose">${post.html}</div>
      </article>`,
    }));
  }

  const profileHandle = (url) => url ? `@${new URL(url).pathname.split('/').filter(Boolean)[0]}` : '';
  const contactLinks = [
    { label: 'Email', emoji: '✉️', value: config.email, href: `mailto:${config.email}` },
    { label: 'X', emoji: '💬', value: profileHandle(config.socials?.twitter), href: config.socials?.twitter },
    { label: 'GitHub', emoji: '🐙', value: profileHandle(config.socials?.github), href: config.socials?.github },
  ].filter((link) => link.href);
  pages.set('contact/index.html', shell(config, logo, {
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

  pages.set('404.html', shell(config, logo, {
    title: `Page not found — ${config.name}`, route: '/404.html', active: '', pageClass: 'not-found-page',
    body: `<p class="eyebrow">404</p><h1>A little off track<span class="accent">.</span></h1><p class="page-description">This page doesn’t seem to be here.</p><a class="text-link" href="/">Back to About me ${arrow}</a>`,
  }));
  pages.set('.nojekyll', '');
  pages.set('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', config.url).href}\n`);
  pages.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/blog/', '/contact/', ...categories.map(categoryRoute), ...posts.map((post) => post.route)].map((route) => `<url><loc>${escape(new URL(route, config.url).href)}</loc></url>`).join('')}</urlset>\n`);

  // All content is rendered before replacing dist, so invalid posts fail the build early.
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(path.join(root, 'public'), output, { recursive: true });
  for (const [file, content] of pages) {
    await mkdir(path.dirname(path.join(output, file)), { recursive: true });
    await writeFile(path.join(output, file), content);
  }
  if (!quiet) console.log(`Built About me, Blog, and ${posts.length} published post${posts.length === 1 ? '' : 's'} → dist/`);
  return { posts: posts.length, pages: pages.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSite();
}
