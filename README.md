# Racing Analysis

Personal horse-racing analysis application for importing and studying UK racing data.

The project is intentionally small at this stage. It establishes the application foundation only: Next.js, TypeScript, Tailwind CSS, PostgreSQL schema scaffolding, Drizzle configuration, and a placeholder for the future Python ingestion layer.

## Architecture

- `src/app` contains the Next.js App Router UI.
- `src/components` is reserved for reusable React components.
- `src/db` contains Drizzle schema and database access code.
- `src/lib` contains shared TypeScript utilities.
- `drizzle` is the Drizzle migrations output directory.
- `scraper` is reserved for the separate Python scraping and ingestion layer.
- `scripts` is reserved for project scripts.
- `data` is reserved for local data files that may be useful during import experiments.

## Next.js and Bun

Use Bun for JavaScript and TypeScript package management and scripts.

```bash
bun install
bun dev
```

Run validation with:

```bash
bun run typecheck
bun run lint
bun run build
```

## PostgreSQL and Drizzle

Database configuration expects a PostgreSQL connection string:

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE
```

Copy `.env.example` to `.env.local` when a real local or hosted database has been chosen. Do not commit credentials.

Useful database commands:

```bash
bun run db:generate
bun run db:migrate
bun run db:push
bun run db:studio
```

The initial schema covers courses, horses, trainers, jockeys, races, and race runners/results. Imported entity tables include optional `source` and `source_id` fields because historical racing data may contain repeated or inconsistently formatted names. Display names alone should not be treated as permanent identifiers.

## Future Python Ingestion

The scraping and ingestion layer will be Python-based and kept separate from the Next.js application. The open-source `rpscrape` project may be investigated later, but it has not been installed or integrated yet.

Before implementing ingestion, inspect real source output and decide how raw imported records should map into the normalized PostgreSQL tables.
