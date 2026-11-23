import { createHash } from 'node:crypto';
import { defaultTreeAdapter as tree, parseFragment, serialize } from 'parse5';

const htmlNamespace = 'http://www.w3.org/1999/xhtml';
const referenceHeading = /^(?:references|bibliography|sources|参考文献|参考资料|参考)$/iu;
const literalElements = new Set(['pre', 'code', 'script', 'style', 'textarea', 'math', 'svg', 'template']);

function* descendants(node) {
  yield node;
  for (const child of node.childNodes ?? []) yield* descendants(child);
}

function textContent(node) {
  return [...descendants(node)].filter((child) => child.nodeName === '#text').map((child) => child.value).join('');
}

function attribute(node, name) {
  return node.attrs?.find((entry) => entry.name === name)?.value;
}

function setAttribute(node, name, value) {
  const entry = node.attrs.find((entry) => entry.name === name);
  if (entry) entry.value = value;
  else node.attrs.push({ name, value });
}

function referenceUrl(value) {
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  url.hash = '';
  const arxiv = url.pathname.match(/^\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?\/?$/u);
  if (/^(?:www\.)?arxiv\.org$/u.test(url.hostname) && arxiv) return `https://arxiv.org/abs/${arxiv[1]}`;
  return url.href.replace(/\/$/u, '');
}

function aliasesFor(reference) {
  const title = reference.title.replace(/\s*\([^()]*\)\s*$/u, '').trim();
  const aliases = [reference.title, title, title.split(/[:：]/u)[0], ...title.split(/\s+\/\s+/u)];
  for (const group of reference.title.matchAll(/\(([^()]*)\)/gu)) {
    aliases.push(...group[1].split(/[,，]/u).map((part) => part.trim()).filter((part) => /^[A-Za-z][A-Za-z0-9.-]+$/u.test(part)));
  }
  for (const author of reference.title.matchAll(/([\p{L}'’.-]+) et al\./gu)) {
    aliases.push(`${author[1]} et al.`, `${author[1]} 等`);
  }
  const author = reference.title.match(/\(([\p{L}'’.-]+) et al\.,?\s*(?:([A-Za-z-]+)\s+)?(\d{4})\)/u);
  if (author) {
    const [, name, venue, year] = author;
    for (const date of new Set([year, [venue, year].filter(Boolean).join(' ')])) {
      aliases.push(`${name} et al., ${date}`, `${name} et al. (${date})`, `${name} 等（${date}）`, `${name} 等，${date}`);
    }
  }
  const arxiv = reference.url.match(/^https:\/\/arxiv\.org\/abs\/(.+)$/u);
  if (arxiv) aliases.push(`arXiv:${arxiv[1]}`, `arXiv: ${arxiv[1]}`);
  return aliases;
}

function citationAttributes(reference) {
  return [
    { name: 'href', value: `#${reference.id}` },
    { name: 'class', value: 'reference-link' },
    { name: 'role', value: 'doc-biblioref' },
    { name: 'title', value: reference.title },
  ];
}

export function linkBlogReferences(html, citationAliases = {}, file = 'blog post') {
  const document = parseFragment(html);
  const referenceNodes = new Set();
  const references = new Map();
  const entries = new Map();
  const usedIds = new Set([...descendants(document)].map((node) => attribute(node, 'id')).filter(Boolean));
  let referenceDepth = 0;

  for (const node of document.childNodes) {
    const depth = /^h[1-6]$/u.test(node.tagName) ? Number(node.tagName[1]) : 0;
    if (depth && referenceHeading.test(textContent(node).trim())) referenceDepth = depth;
    else if (depth && depth <= referenceDepth) referenceDepth = 0;
    if (!referenceDepth) continue;
    referenceNodes.add(node);
    for (const link of descendants(node)) {
      if (link.tagName !== 'a') continue;
      const url = referenceUrl(attribute(link, 'href'));
      if (!url) continue;
      let entry = link;
      for (let parent = link.parentNode; parent && parent !== document; parent = parent.parentNode) {
        if (parent.tagName === 'li' || parent.tagName === 'p') entry = parent;
        if (parent.tagName === 'li') break;
      }
      if (!entries.has(entry)) {
        const existingId = attribute(entry, 'id');
        const base = `reference-${createHash('sha256').update(url).digest('hex').slice(0, 12)}`;
        let id = existingId || base;
        for (let suffix = 2; !existingId && usedIds.has(id); suffix++) id = `${base}-${suffix}`;
        usedIds.add(id);
        const title = textContent(entry).replace(/\s+/gu, ' ').trim();
        entries.set(entry, { id, title, url });
        setAttribute(entry, 'id', id);
        setAttribute(entry, 'tabindex', '-1');
        setAttribute(entry, 'class', [attribute(entry, 'class'), 'reference-entry'].filter(Boolean).join(' '));
      }
      if (!references.has(url)) references.set(url, entries.get(entry));
    }
  }

  if (!references.size) return html;
  const aliases = new Map();
  const aliasKey = (alias) => alias.replace(/\s+/gu, ' ').trim().toLowerCase();
  const registerAlias = (alias, reference) => {
    const key = aliasKey(alias);
    if (key.length < 2) return;
    // Ambiguous names require an explicit per-post alias.
    if (aliases.has(key) && aliases.get(key)?.id !== reference.id) aliases.set(key, null);
    else aliases.set(key, reference);
  };
  for (const [index, reference] of [...entries.values()].entries()) {
    for (const alias of aliasesFor(reference)) registerAlias(alias, reference);
    registerAlias(`[${index + 1}]`, reference);
  }
  for (const [alias, url] of Object.entries(citationAliases)) {
    const reference = references.get(referenceUrl(url));
    if (!reference) throw new Error(`${file}: citation alias "${alias}" has no matching reference.`);
    aliases.set(aliasKey(alias), reference);
  }
  const names = [...aliases.keys()].filter((name) => aliases.get(name)).sort((a, b) => b.length - a.length);
  const pattern = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/ /gu, '\\s+')).join('|');
  const citations = new RegExp(`(?<![A-Za-z0-9_])(?:${pattern})(?![A-Za-z0-9_])`, 'giu');

  function linkText(node) {
    let cursor = 0;
    for (const match of node.value.matchAll(citations)) {
      tree.insertTextBefore(node.parentNode, node.value.slice(cursor, match.index), node);
      const reference = aliases.get(aliasKey(match[0]));
      const link = tree.createElement('a', htmlNamespace, citationAttributes(reference));
      tree.insertText(link, match[0]);
      tree.insertBefore(node.parentNode, link, node);
      cursor = match.index + match[0].length;
    }
    if (cursor) {
      tree.insertTextBefore(node.parentNode, node.value.slice(cursor), node);
      tree.detachNode(node);
    }
  }

  function linkCitations(node) {
    if (node.nodeName === '#text') {
      linkText(node);
      return;
    }
    if (literalElements.has(node.tagName)) return;
    if (node.tagName === 'a') {
      const reference = references.get(referenceUrl(attribute(node, 'href')));
      if (reference) {
        for (const { name, value } of citationAttributes(reference)) {
          setAttribute(node, name, name === 'class' ? [attribute(node, 'class'), value].filter(Boolean).join(' ') : value);
        }
        node.attrs = node.attrs.filter(({ name }) => name !== 'target' && name !== 'download');
      }
      return;
    }
    for (const child of [...(node.childNodes ?? [])]) linkCitations(child);
  }
  for (const node of document.childNodes) {
    if (!referenceNodes.has(node)) linkCitations(node);
  }
  return serialize(document);
}
