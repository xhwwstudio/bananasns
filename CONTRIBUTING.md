# Contributing to BananaSNS

Thanks for your interest in BananaSNS — a lightweight social network + forum + community app built on Express / better-sqlite3 (server) and React / Vite (client). Contributions of all sizes are welcome, from typo fixes to new features.

## Local development setup

Full instructions live in [`docs/INSTALL.md`](docs/INSTALL.md). The short version:

```bash
npm run install:all   # installs both server/ and client/ dependencies
npm run dev           # runs the Express API and the Vite dev server together
```

`npm run dev` starts the server (default port `4000`) and the client dev server side by side with hot reload. No external database is needed — an SQLite file is created automatically on first run. To populate demo data, see the seeding scripts in [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md).

## Project layout

The repo is a two-package monorepo: `server/` (Express API) and `client/` (React app).

**Server (`server/`)**

- `server/src/index.js` — app entry point; mounts middleware and registers every route module.
- `server/src/routes/*.js` — Express route modules (one per feature area, e.g. `posts.js`, `users.js`, `forum.js`). Each exports a router that is imported and mounted in `index.js`.
- `server/src/db.js` — SQLite connection, schema bootstrap (`schema.sql`), and lightweight in-code migrations.
- `server/src/middleware/*` — auth and other Express middleware.
- `server/src/helpers.js`, `server/src/sensitive.js` — shared utilities and the content filter.

**Client (`client/`)**

- `client/src/pages/*.jsx` — top-level pages, routed in `client/src/App.jsx`.
- `client/src/components/*` — shared components (e.g. `LeftRail.jsx`, `PostCard.jsx`, `Icon.jsx`).
- `client/src/styles/*.css` — global styles and design tokens, used alongside Tailwind / HeroUI.
- `client/src/api/*`, `client/src/context/*`, `client/src/hooks/*` — API client, React context, and hooks.

## How to add a new API route

1. Create a route module under `server/src/routes/`, e.g. `widgets.js`, exporting an Express router (`export default router`).
2. Import it in `server/src/index.js` and mount it with a unique prefix:
   ```js
   import widgetRoutes from './routes/widgets.js';
   // ...
   app.use('/api/widgets', widgetRoutes);
   ```
3. If the feature needs new tables/columns, add them in `server/src/db.js` (and/or `schema.sql`) so they are created on startup.
4. Protect endpoints with the auth middleware (`requireAuth` / `requireAdmin`) where appropriate, and run user-supplied text through the content filter (see `server/src/sensitive.js`).

## How to add a new page

1. Create the page component under `client/src/pages/`, e.g. `Widgets.jsx`.
2. Import it and add a `<Route>` in `client/src/App.jsx`:
   ```jsx
   import Widgets from './pages/Widgets';
   // ...
   <Route path="/widgets" element={<Widgets />} />
   ```
3. Add a navigation entry in `client/src/components/LeftRail.jsx` so users can reach the page.

## Code style

- **ES modules** throughout (server uses `"type": "module"`; client is Vite/ESM).
- **2-space indentation**, no tabs.
- **Match the surrounding code** — naming, structure, and patterns of the file you are editing take priority over personal preference.
- Use **real SVG icons** (via the `Icon` component / icon set), not emoji, in UI.
- **Icon inline with text?** Wrap it in an `inline-flex` container (see `.pc`, `.ui-badge`, `.composer-saved`). Tailwind's preflight sets `svg { display: block }`, so a bare inline `<span><Icon/> text</span>` pushes the icon onto its own line on narrow screens.
- Keep route handlers thin; put shared logic in `helpers.js` or a small module.

## UI text & copy

Consistent user-facing copy matters. A lightweight lint (`npm run lint:copy`, also run in CI) guards the two rules most prone to regressing; please also follow the conventions below for any new copy.

**Enforced by `npm run lint:copy`:**

- **No native browser dialogs.** Never use `window.confirm` / `window.prompt` in `client/src`. Use the branded `confirmDialog()` / `promptDialog()` / `reportDialog()` (from `components/confirm|prompt|report`).
- **No CJK button spacing.** Write 「登录」, not 「登 录」 — use CSS `letter-spacing` if you need visual width, never literal spaces.

**Conventions (please follow):**

- **Full-width punctuation** in Chinese text: `？！。，、`, not half-width `?!,`.
- **Emoji sparingly** — only 🎉, and only for celebratory moments (publish success, recharge, milestone).
- **Consistent terms**: 会话 (not 对话); 删除 (not 移除/清除); 动态 / 帖子 / 文章 / 问题 / 回答 are distinct content types — don't mix them.
- **Buttons are verbs**: 发布 / 保存修改 / 删除 — never 确定 / 提交 / OK.
- **Errors help, don't blame** — "what's wrong + what to do", e.g. 「积分不足，先去签到赚积分吧」.

## Commit & pull request flow

1. **Fork** the repository and clone your fork.
2. Create a **feature branch**: `git checkout -b feature/short-description`.
3. Make focused commits with clear messages.
4. Open a **pull request** against the upstream repo with a description of *what* changed and *why*. Reference any related issue.
5. Keep PRs reasonably small and self-contained; large changes are easier to review when split up.

## Reporting bugs

Please open a **GitHub issue**. Include:

- What you did and what you expected to happen.
- What actually happened (error messages, screenshots, logs).
- Your environment (OS, Node version) and steps to reproduce.

When reporting a security issue, do **not** include real secrets, passwords, tokens, or server addresses in the report.
