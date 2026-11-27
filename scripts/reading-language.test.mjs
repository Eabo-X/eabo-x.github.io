import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { root } from './build.mjs';

const attribute = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;
const descendants = (node) => [node, ...(node.childNodes ?? []).flatMap(descendants)];
const textContent = (node) => descendants(node).filter((entry) => entry.nodeName === '#text').map((entry) => entry.value).join('');

test('Project and newly uploaded Publication editions share the reading-language routes', async () => {
  const checkout = await mkdtemp(path.join(tmpdir(), 'eabo-reading-language-'));
  try {
    for (const folder of ['scripts', 'content', 'public']) {
      await cp(path.join(root, folder), path.join(checkout, folder), { recursive: true });
    }
    await cp(path.join(root, 'site.config.json'), path.join(checkout, 'site.config.json'));
    await symlink(path.join(root, 'node_modules'), path.join(checkout, 'node_modules'), 'dir');
    const frontmatter = 'date: "2025-12"\ncategory: "paper"\ndraft: false';
    await writeFile(path.join(checkout, 'content/posts/publication-language-check.md'),
      `---\ntitle: "Publication language check"\n${frontmatter}\n---\n\nEnglish publication text.\n`);
    await writeFile(path.join(checkout, 'content/posts/zh/publication-language-check.md'),
      `---\ntitle: "出版物语言检查"\ndraft: false\n---\n\n中文出版物正文。\n`);
    await writeFile(path.join(checkout, 'content/posts/english-publication-check.md'),
      `---\ntitle: "English publication check"\n${frontmatter}\n---\n\nAn English-only publication.\n`);
    const { buildSite } = await import(pathToFileURL(path.join(checkout, 'scripts/build.mjs')).href);
    await buildSite({ quiet: true });

    const page = async (route) => descendants(parse(await readFile(path.join(checkout, 'dist', route.slice(1), 'index.html'), 'utf8')));
    for (const chinese of [true, false]) {
      const prefix = chinese ? '' : '/en';
      const alternatePrefix = chinese ? '/en' : '';
      const language = chinese ? 'zh-Hans' : 'en';
      const project = await page(`${prefix}/project/`);
      assert.equal(attribute(project.find((node) => node.tagName === 'html'), 'lang'), language);
      const description = project.find((node) => attribute(node, 'class') === 'project-description');
      assert.match(textContent(description), chinese ? /使用 XGBoost 和 LightGBM/u : /An XGBoost and LightGBM ensemble/u);
      const projectToggle = project.find((node) => attribute(node, 'data-reading-language-toggle') !== undefined);
      assert.equal(attribute(projectToggle, 'href'), `${alternatePrefix}/project/`);
      assert.ok(project.some((node) => attribute(node, 'href') === 'https://www.kaggle.com/competitions/hull-tactical-market-prediction/overview'));
      assert.equal(project.some((node) => textContent(node) === 'GitHub (private)'), false);

      const index = await page(`${prefix}/publication/`);
      const publicationTitle = chinese ? '出版物语言检查' : 'Publication language check';
      const publicationLink = index.find((node) => node.tagName === 'a' && textContent(node) === publicationTitle);
      assert.equal(attribute(publicationLink, 'href'), `${prefix}/publication/publication-language-check/`);
      const englishOnly = index.find((node) => node.tagName === 'a' && textContent(node) === 'English publication check');
      assert.equal(attribute(englishOnly, 'href'), '/publication/english-publication-check/');

      const publication = await page(`${prefix}/publication/publication-language-check/`);
      assert.equal(attribute(publication.find((node) => node.tagName === 'html'), 'lang'), language);
      const body = publication.find((node) => attribute(node, 'class') === 'article-body prose');
      assert.match(textContent(body), chinese ? /中文出版物正文/u : /English publication text/u);
      const switches = publication.filter((node) => attribute(node, 'data-reading-language-toggle') !== undefined);
      assert.equal(switches.length, 2);
      for (const link of switches) assert.equal(attribute(link, 'href'), `${alternatePrefix}/publication/publication-language-check/`);
      assert.equal(attribute(publication.find((node) => node.tagName === 'time'), 'datetime'), '2025-12');
      const navigation = publication.find((node) => attribute(node, 'class') === 'main-nav');
      assert.ok(descendants(navigation).some((node) => attribute(node, 'href') === `${prefix}/project/`));
    }
    const sitemap = await readFile(path.join(checkout, 'dist/sitemap.xml'), 'utf8');
    for (const route of ['/project/', '/en/project/', '/publication/publication-language-check/', '/en/publication/publication-language-check/']) {
      assert.ok(sitemap.includes(`https://eabo-x.github.io${route}`));
    }
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
});
