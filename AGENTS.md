<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Rules

- Use Bun for JavaScript and TypeScript package management and scripts. Do not use npm, yarn, or pnpm unless there is a specific technical reason.
- Use Next.js 16 App Router conventions with the `src/app` directory.
- Keep TypeScript strict. Do not loosen `tsconfig.json` strictness to work around errors.
- Keep the Python scraping and ingestion layer separate from the Next.js application. Do not put Python scraper logic inside `src/app`.
- This is a personal horse-racing analysis application. Do not add authentication, billing, organisations, permissions, or multi-user infrastructure unless specifically requested.
- Prefer small, targeted changes that match the existing project structure.
- Inspect relevant existing code and local Next.js docs before editing.
- Avoid unnecessary dependencies and infrastructure. Add packages only when they are genuinely needed for the current task.
- Run targeted validation after changes, such as typecheck, lint, and build when appropriate.
