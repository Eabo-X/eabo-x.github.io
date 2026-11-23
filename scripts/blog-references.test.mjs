import assert from 'node:assert/strict';
import test from 'node:test';
import { marked } from 'marked';
import { parseFragment, serialize } from 'parse5';
import { linkBlogReferences } from './blog-references.mjs';

function nodes(html) {
  const result = [];
  function visit(node) {
    result.push(node);
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(parseFragment(html));
  return result;
}

const attr = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;
const citations = (html) => nodes(html).filter((node) => attr(node, 'role') === 'doc-biblioref');
const text = (html) => nodes(html).filter((node) => node.nodeName === '#text').map((node) => node.value).join('');
const referenceList = `<h2>References</h2><ul><li><a href="https://arxiv.org/abs/2401.12345">SampleNet: A Study (Smith et al., ICML 2024)</a></li></ul>`;

test('new Markdown posts link paper names, author citations and numbered citations automatically', () => {
  const html = marked.parse(`SampleNet follows Smith et al. (ICML 2024). See [1].

## References

- [SampleNet: A Study (Smith et al., ICML 2024)](https://arxiv.org/abs/2401.12345)`);
  const output = linkBlogReferences(html);
  const links = citations(output);
  assert.equal(links.length, 3);
  assert.equal(new Set(links.map((node) => attr(node, 'href'))).size, 1);
  const target = nodes(output).find((node) => attr(node, 'id') === attr(links[0], 'href').slice(1));
  assert.equal(target.tagName, 'li');
  assert.equal(attr(target, 'tabindex'), '-1');
  assert.equal(text(output), text(html));
});

test('HTML posts preserve formatting, code, attributes and unrelated links without nested anchors', () => {
  const html = `<p><strong>SampleNet</strong> SampleNetwork <a href="https://example.org">SampleNet</a>
<a href="https://arxiv.org/pdf/2401.12345v2.pdf" target="_blank">original citation</a></p>
<pre><code>SampleNet [1]</code></pre><img alt="SampleNet > example" src="/SampleNet.png">${referenceList}`;
  const output = linkBlogReferences(html);
  assert.equal(citations(output).length, 2);
  assert.match(output, /<strong><a[^>]*>SampleNet<\/a><\/strong>/u);
  assert.match(output, /<pre><code>SampleNet \[1\]<\/code><\/pre>/u);
  assert.equal(attr(nodes(output).find((node) => node.tagName === 'img'), 'alt'), 'SampleNet > example');
  assert.match(output, /<a href="https:\/\/example.org">SampleNet<\/a>/u);
  assert.equal(attr(citations(output)[1], 'target'), undefined);
  assert.equal(nodes(output).some((node) => node.tagName === 'a' && node.parentNode?.tagName === 'a'), false);
  assert.equal(text(output), text(html));
});

test('Chinese text and English text use the same reference IDs across arXiv URL formats', () => {
  const english = linkBlogReferences(`<p>arXiv:2401.12345; Smith et al., 2024</p>${referenceList}`);
  const chinese = linkBlogReferences(`<p>SampleNet的结果，Smith 等（ICML 2024）。</p>${referenceList.replace('References', '参考资料').replace('/abs/2401.12345', '/html/2401.12345v2')}`);
  assert.equal(citations(english).length, 2);
  assert.equal(citations(chinese).length, 2);
  assert.equal(attr(citations(english)[0], 'href'), attr(citations(chinese)[0], 'href'));
});

test('ambiguous paper names require an explicit alias and do not pick an unrelated reference', () => {
  const html = '<p>SampleNet</p><h2>References</h2><ul><li><a href="https://example.org/a">SampleNet: One</a></li><li><a href="https://example.org/b">SampleNet: Two</a></li></ul>';
  assert.equal(citations(linkBlogReferences(html)).length, 0);
  const output = linkBlogReferences(html, { SampleNet: 'https://example.org/b' });
  const target = nodes(output).find((node) => attr(node, 'id') === attr(citations(output)[0], 'href').slice(1));
  assert.match(serialize(target), /https:\/\/example.org\/b/u);
});

test('reference IDs survive reordering and duplicate entries receive distinct IDs', () => {
  const before = linkBlogReferences(`<p>SampleNet</p>${referenceList}`);
  const after = linkBlogReferences(`<p>SampleNet</p>${referenceList.replace('<ul>', '<ul><li><a href="https://example.org/other">Other Paper</a></li>').replace('</ul>', '<li><a href="https://arxiv.org/pdf/2401.12345">Duplicate</a></li></ul>')}`);
  assert.equal(attr(citations(before)[0], 'href'), attr(citations(after)[0], 'href'));
  const ids = nodes(after).map((node) => attr(node, 'id')).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
});

test('posts without a bibliography retain their HTML and invalid explicit aliases are reported', () => {
  const html = '<p>SampleNet and <a href="https://example.org">an external link</a>.</p>';
  assert.equal(linkBlogReferences(html), html);
  assert.throws(() => linkBlogReferences(referenceList, { Missing: 'https://example.org/missing' }, 'post.md'), /post\.md: citation alias "Missing" has no matching reference/u);
});
