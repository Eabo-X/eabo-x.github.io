const listDiscussions = `query BlogDiscussions($owner: String!, $name: String!, $categoryId: ID!, $after: String) {
  repository(owner: $owner, name: $name) {
    id
    discussions(first: 50, after: $after, categoryId: $categoryId, orderBy: {field: CREATED_AT, direction: ASC}) {
      nodes { number title body }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const createDiscussion = `mutation CreateBlogDiscussion($input: CreateDiscussionInput!) {
  createDiscussion(input: $input) {
    discussion { number }
  }
}`;

async function github(query, variables, token) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  const { data, errors, message } = await response.json();
  if (!response.ok || errors?.length || !data) {
    const detail = errors?.map((error) => error.message).join(', ') || message || response.statusText;
    throw new Error(`GitHub Discussions API returned HTTP ${response.status}. ${detail}`);
  }
  return data;
}

function discussionBody(post, siteUrl) {
  const articleUrl = new URL(post.route, siteUrl).href;
  const links = post.zh
    ? `Read the article in [English](${articleUrl}) or [Chinese](${new URL(post.zh.route, siteUrl).href}).`
    : `[Read the article](${articleUrl}).`;
  return `Comments for this article on Eabo X’s website.\n\n${links}\n\n<!-- eabo-blog-post: ${post.slug} -->`;
}

export async function ensureBlogDiscussions(config, posts, siteUrl, token) {
  if (!config?.repo || !config.repoId || !config.categoryId) {
    throw new Error('Publishing blog discussions requires a GitHub repository and discussion category in site.config.json.');
  }
  const [owner, name] = config.repo.split('/');
  const existingNumbers = new Set();
  const numbersBySlug = new Map();
  let after = null;
  do {
    const { repository } = await github(listDiscussions, { owner, name, categoryId: config.categoryId, after }, token);
    if (repository?.id !== config.repoId) throw new Error(`GitHub repository ID does not match ${config.repo}.`);

    const { nodes, pageInfo } = repository.discussions;
    for (const { number, title, body } of nodes) {
      existingNumbers.add(number);
      // Older Giscus threads can use the original mapping term as their title.
      const slug = body.match(/^<!-- eabo-blog-post: ([a-z0-9-]+) -->$/m)?.[1]
        ?? title.match(/^blog\/([a-z0-9-]+)$/)?.[1];
      if (!slug) continue;
      const numbers = numbersBySlug.get(slug) ?? [];
      numbers.push(number);
      numbersBySlug.set(slug, numbers);
    }
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after);

  const configuredThreads = config.threads ?? {};
  const threads = Object.create(null);
  const assignedNumbers = new Set();
  for (const { slug } of posts) {
    const candidates = Object.hasOwn(configuredThreads, slug)
      ? [configuredThreads[slug]]
      : (numbersBySlug.get(slug) ?? []);
    if (candidates.length > 1) throw new Error(`Multiple GitHub discussions match ${slug}.`);
    if (candidates.length === 0) continue;
    const [number] = candidates;
    if (!existingNumbers.has(number)) {
      throw new Error(`Discussion #${number} for ${slug} is missing from the blog comments category.`);
    }
    if (assignedNumbers.has(number)) throw new Error(`Discussion #${number} is assigned to more than one blog post.`);
    threads[slug] = number;
    assignedNumbers.add(number);
  }

  let created = 0;
  for (const post of posts) {
    if (Object.hasOwn(threads, post.slug)) continue;
    const input = {
      repositoryId: config.repoId,
      categoryId: config.categoryId,
      title: String(post.title),
      body: discussionBody(post, siteUrl),
    };
    const data = await github(createDiscussion, { input }, token);
    const number = data.createDiscussion?.discussion?.number;
    if (!Number.isSafeInteger(number) || number < 1 || existingNumbers.has(number)) {
      throw new Error(`GitHub did not return a new discussion number for ${post.slug}.`);
    }
    threads[post.slug] = number;
    existingNumbers.add(number);
    created++;
    console.log(`Created discussion #${number} for ${post.slug}.`);
  }

  console.log(`GitHub Discussions ready for ${posts.length} published blog posts (${created} created).`);
  return threads;
}
