# Eabo X — Personal website

包含 About me、Blog 和联系页的个人网站，适配电脑与手机。生成的内容是普通 HTML/CSS，不需要后端或第三方 CDN，正文和导航不依赖 JavaScript。

米白色背景上的毕达哥拉斯树由原生 Canvas 绘制，只显示淡灰色的方形分支、细线与节点。分叉角度缓慢变化，每对分支方形的面积之和始终等于父方形的面积。手机减少分支层数；系统设置减少动态效果时保持静止，页面隐藏时暂停动画。背景不会拦截链接点击。

Blog 列表与文章正文使用整页上下滚动，内容较多时会自然延长页面。长网址自动换行，宽代码和表格在各自区域内横向滚动；背景会在横竖屏切换时重新适配尺寸。

Blog 采用日期和标题的简洁列表，标题以淡色区分 `tech`、`paper`、`reflection` 三个分类。电脑上分类在左侧，手机上移到列表上方。点击分类进入对应文章列表，点击顶部 Blog 返回全部文章；分类链接不依赖 JavaScript。

首页打开时立即显示完整的 `Hi, I’m Eabo X 😊`，停留 4 秒后从末尾逐字删除，再打出 `👋 Glad to meet you!`。之后两句话交替循环，每句打完都停留 4 秒再删除。标题预留固定空间，不会带动下方内容跳动；减少动态效果或禁用 JavaScript 时显示完整静态问候。

## 本地预览

需要 Node.js 22 或更新版本。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。修改内容、样式或个人信息后，预览会自动刷新。

## 修改个人信息

- `site.config.json`：姓名、邮箱、站点地址、语言和三个社交链接。
- `content/about.md`：About me 正文，支持 Markdown。
- `public/assets/style.css`：颜色、字体和布局。
- `public/`：图片等静态资源，会原样复制到网站。

首页姓名下方的 GitHub、X/Twitter 和 LinkedIn 图标已配置为个人主页链接，点击后会在新标签页打开。以后可以在 `site.config.json` 中修改地址；留空的链接会显示为待补充状态。

同一行的信封图标打开 `/contact/`，列出 Email、X 和 GitHub；点击邮箱可打开邮件应用。除首页外，每个页面的最下面都有返回首页的 Home 链接。

## 写博客

在 `content/posts/` 新建一个英文小写文件名的 Markdown 文件，例如 `my-first-note.md`：

```md
---
title: "文章标题"
description: "可选的一句话摘要"
date: "2026-11-06"
category: "tech"
draft: false
---

从这里开始写正文。英文、中文都可以。
```

文章会按日期从新到旧排列，地址为 `/blog/my-first-note/`。只有明确标记 `draft: false` 的文章会被生成；其他文章保留为草稿。现有的 `first-post.md` 是写作示例，不会显示在网站里。草稿源文件仍属于仓库内容。

`category` 可填写 `tech`、`paper` 或 `reflection`，省略时默认为 `tech`。构建会检查分类值，并生成各分类的独立页面。

没有正式文章时，首页不显示博客区块。有文章后，会自动显示一个带边框的 **Latest post** 卡片，包含最新文章的标题、简短摘要和文章链接。摘要优先使用文章的 `description`，未填写时会提取正文首段。

Markdown 来自你维护的仓库，允许嵌入 HTML；不接收访客提交的内容。文章的日期、标题和文件名会在构建时校验。

## 构建

```sh
npm run build
```

生成目录是 `dist/`。可以部署到任何静态托管平台。

## GitHub Pages

部署目标为 `Eabo-X/eabo-x.github.io`，网站地址为 `https://eabo-x.github.io`。

1. 创建或使用这个名称的 GitHub 仓库，推送当前源文件。
2. 在仓库的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. `.github/workflows/pages.yml` 会在推送到 `main` 后构建并发布 `dist/`，也支持手动运行。

GitHub Actions 会构建并发布 `dist/`；之后每次推送到 `main` 都会更新网站。
