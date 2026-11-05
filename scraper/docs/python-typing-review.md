# Python / Pylance review

Reviewed 5 November 2026. No Python static checker, `pyproject.toml`,
`pyrightconfig.json`, or workspace VS Code settings existed before this work.
The package scripts only configured TypeScript checking. User-level VS Code
settings selected Pylance `basic` mode, workspace-wide diagnostics, automatic
search paths and library-code typing; they enabled pytest despite this suite
using unittest. Installed Pylance: 2026.4.1. Scraper interpreter: Python 3.14.3;
Psycopg / psycopg-binary: 3.3.5; lxml: 6.1.2.

## Findings

- **Total before: 48 errors, 0 warnings**, reproduced outside VS Code with
  Pyright 1.1.414 using the scraper interpreter and no project configuration
  (`bunx pyright --pythonpath scraper/.venv/bin/python --outputjson`).
- An additional baseline of the original tracked Python files in a temporary
  directory, explicitly using basic mode and the scraper search path, reproduced
  the same 46 first-party errors. The symlinked vendor directory was not scanned
  in that baseline; the original full-workspace run reported its other 2 errors.
- **Genuine runtime bugs found: none** among these diagnostics. None of the
  reported paths fails in the existing 51-test scraper suite.
- **Type-only issues: 42**: 24 row/date narrowing diagnostics, 11 test-double
  mismatches, 4 SQL query annotations, and 3 payload/weight annotations.
- **Import-path/editor issues: 4**: both test importer modules and both capture
  wrappers' `utils.network` imports. Runtime code already adds the correct
  directories to `sys.path`; Pyright cannot infer those mutations. Modules exist.
- **Vendor-only issues: 2**: lxml's extension `etree` is a valid runtime import
  with incomplete inferred typing; `Callable[[str, bool], TextIO]` does not
  describe the named `append` parameter accepted by both writer implementations.
  The actual call is valid. Vendor source is untouched; diagnostics are scoped
  out with both `exclude` (workspace discovery) and `ignore` (also imported/open
  files). The vendor search path remains available for capture-wrapper imports.
- **Stale/obsolete warnings: none established.** The problems reproduce outside
  the editor. A newer checker/driver can expose these annotation gaps, especially
  Psycopg's `LiteralString` query contract, but there is no older-version baseline
  proving that a Pylance upgrade caused them. Strict checking was not enabled.

## Changes and runtime scope

`TextClient` describes only the positional `get_text` operation used by extraction
and import orchestration. `ImportCursor` describes positional execution with
literal SQL and tuple parameters plus row retrieval. Psycopg's real cursor and
the existing offline fakes satisfy it without inheritance, casts, ignores or
real network/database clients in tests. The real driver's execute overloads
accept the existing tuple/list parameters. Restricting entity table annotations
to the three already allowed literals and declaring report queries LiteralString
retains the actual SQL verbatim.

The shared `fetch_required_row` asserts the invariant of unconditional
`INSERT ... ON CONFLICT DO UPDATE ... RETURNING id` and ungrouped aggregate
queries. These SQL forms return a row, including aggregate queries over empty
input. It adds no fallback values. An unexpected missing row now raises an
explicit AssertionError instead of the previous subscript/unpack TypeError;
successful ingestion/reporting behaviour is unchanged.

Racecards already support list-shaped API responses at runtime; annotations now
allow that shape through raw JSON writing and source-import persistence. The
weight observation dictionary already accepts None keys at runtime. Date tests
now explicitly narrow before attribute access while preserving expected values
and missing/invalid-input checks.

Changed files:

- `pyrightconfig.json`, `.vscode/settings.json`: shared basic checks, import paths,
  local environment and unittest discovery.
- `scraper/db_typing.py`: cursor interfaces and required-row assertion.
- `scraper/sporting_life/client.py`, `scraper/sporting_life/extract.py`: client
  interface and racecard payload annotation.
- `scraper/sporting_life/importing.py`, `scraper/racing_post/importing.py`: cursor
  interfaces, guaranteed-row narrowing and literal table annotations.
- `scraper/scripts/import_sporting_life_day.py`,
  `scraper/scripts/import_sporting_life_racecards.py`: client annotations.
- `scraper/scripts/import_results_day.py`: optional weight-key annotation.
- `scraper/scripts/sporting_life_import_status.py`,
  `scraper/scripts/sporting_life_racecard_status.py`: guaranteed aggregate rows and
  literal SQL annotations; the first also uses the shared scraper import path.
- `scraper/tests/test_sporting_life_importing.py`: explicit datetime narrowing.
- `scraper/README.md`, this review: repeatable checks and findings.

## Validation

- `bunx pyright` (1.1.414), final shared basic configuration: **0 errors,
  0 warnings, 30 Python files analyzed**. No broad diagnostic suppression for
  first-party code and no type-ignore comments were introduced.
- Actual live VS Code Problems count was not read. Pylance should use the shared
  configuration after reload; select the scraper interpreter if VS Code has
  remembered another one. CLI results do not prove the live editor count.
- `scraper/.venv/bin/python -m unittest discover -s scraper/tests -v`:
  **51 tests pass** before and after. Tests use fake connections and temporary
  output directories. The baseline also passed with `PYTHONPATH=scraper`.
- Targeted downstream research tests: **57 pass, 0 fail across 9 files**:
  `jump-winning-time-production`, `jump-winning-time-integrity`,
  `jump-missing-minute-integrity`, `jump-speed-rating`, `jump-performance-rating`,
  `aw-speed-rating`, `turf-speed-rating`, `prospective-going` (all under
  `src/lib/racing/`) and `scripts/research-racecard-fallback.test.ts`.
- Broader command `DATABASE_URL='' TMPDIR=/private/tmp bun test src/lib/racing
  scripts/research-racecard-fallback.test.ts`: **834 pass, 31 fail, 20 errors**.
  It exposes an unchanged Timewise expected-object mismatch (`activeRunnerCount:
  undefined`), ten missing/incompatible holdout-cache failures, and 20 Bun
  `node:test` inter-suite errors ("test()/describe() inside another test() is not
  yet implemented"). Isolating the Timewise and holdout suites reproduces
  **20 pass / 11 fail**. No TypeScript or research files were edited to address
  these separate failures, and no holdout cache was built.
- AST comparison against HEAD confirms every SQL `execute` call and its parameter
  expressions in changed files are identical.
- `git diff --check` passes.

## Data safety

No database connection, live scraping/import, migration, model fitting or
settlement job was run. Database, schema, racing models, research calculations,
settlement logic and Tissue/Value ranking code were not changed.

All **185 tracked data files** were hashed before edits and verified unchanged
following validation. The 18 research JSON files already modified when this task
started were preserved exactly, including prospective observations and settlement
records. Runtime behaviour changed: **NO for successful inputs**; only the
explicit invariant-failure error described above differs. Database changed: **NO**.
Research data changed: **NO**. Models changed: **NO**.

## Original diagnostic inventory

Line numbers below refer to the pre-change files. All 48 diagnostics are accounted
for, including the less-visible Racing Post and status-script problems.

| Original location | Classification | Resolution |
| --- | --- | --- |
| `scraper/capture_racing_post_full_result_samples.py:43` | Import-path/editor | Search paths matching existing runtime path setup |
| `scraper/capture_rpscrape_sample.py:79` | Import-path/editor | Search paths matching existing runtime path setup |
| `scraper/racing_post/importing.py:91` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/racing_post/importing.py:112` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/racing_post/importing.py:175` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/racing_post/importing.py:296` | SQL annotation | Literal table names / LiteralString query parameters |
| `scraper/racing_post/importing.py:308` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/scripts/import_results_day.py:232` | Annotation mismatch | Allow existing list payloads or None weight keys |
| `scraper/scripts/sporting_life_import_status.py:93` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/scripts/sporting_life_import_status.py:128` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/scripts/sporting_life_import_status.py:146` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/scripts/sporting_life_import_status.py:186` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/scripts/sporting_life_import_status.py:282` | SQL annotation | Literal table names / LiteralString query parameters |
| `scraper/scripts/sporting_life_import_status.py:283` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/scripts/sporting_life_import_status.py:287` | SQL annotation | Literal table names / LiteralString query parameters |
| `scraper/scripts/sporting_life_import_status.py:288` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/scripts/sporting_life_racecard_status.py:92` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/scripts/sporting_life_racecard_status.py:104` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/scripts/sporting_life_racecard_status.py:141` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/sporting_life/extract.py:175` | Annotation mismatch | Allow existing list payloads or None weight keys |
| `scraper/sporting_life/importing.py:155` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/sporting_life/importing.py:179` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/sporting_life/importing.py:203` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/sporting_life/importing.py:270` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/sporting_life/importing.py:341` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/sporting_life/importing.py:626` | SQL annotation | Literal table names / LiteralString query parameters |
| `scraper/sporting_life/importing.py:638` | SQL row narrowing | Assert the INSERT RETURNING / ungrouped aggregate row exists |
| `scraper/tests/test_sporting_life_day_import.py:16` | Import-path/editor | Search paths matching existing runtime path setup |
| `scraper/tests/test_sporting_life_importing.py:19` | Test narrowing | Explicit non-None assertions; expectations retained |
| `scraper/tests/test_sporting_life_importing.py:25` | Test narrowing | Explicit non-None assertions; expectations retained |
| `scraper/tests/test_sporting_life_importing.py:35` | Test narrowing | Explicit non-None assertions; expectations retained |
| `scraper/tests/test_sporting_life_importing.py:39` | Test narrowing | Explicit non-None assertions; expectations retained |
| `scraper/tests/test_sporting_life_importing.py:43` | Test narrowing | Explicit non-None assertions; expectations retained |
| `scraper/tests/test_sporting_life_racecard_day_import.py:19` | Import-path/editor | Search paths matching existing runtime path setup |
| `scraper/tests/test_sporting_life_racecards.py:99` | Annotation mismatch | Allow existing list payloads or None weight keys |
| `scraper/tests/test_sporting_life_racecards.py:193` | Test-double typing | Structural client/cursor protocol |
| `scraper/tests/test_sporting_life_racecards.py:202` | Test-double typing | Structural client/cursor protocol |
| `scraper/tests/test_sporting_life_racecards.py:210` | Test-double typing | Structural client/cursor protocol |
| `scraper/tests/test_sporting_life_racecards.py:216` | Test-double typing | Structural client/cursor protocol |
| `scraper/tests/test_sporting_life_racecards.py:228` | Test-double typing | Structural client/cursor protocol |
| `scraper/tests/test_sporting_life_racecards.py:261` | Test-double typing | Structural client/cursor protocol |
| `scraper/tests/test_sporting_life_racecards.py:270` | Test-double typing | Structural client/cursor protocol |
| `scraper/tests/test_sporting_life_racecards.py:281` | Test-double typing | Structural client/cursor protocol |
| `scraper/tests/test_sporting_life_racecards.py:300` | Test-double typing | Structural client/cursor protocol |
| `scraper/tests/test_sporting_life_racecards.py:301` | Test-double typing | Structural client/cursor protocol |
| `scraper/tests/test_winning_time_corrections.py:40` | Test-double typing | Structural client/cursor protocol |
| `scraper/vendor/rpscrape/scripts/racecards.py:13` | Vendor typing | Scoped vendor exclusion/ignore; no vendor edits |
| `scraper/vendor/rpscrape/scripts/rpscrape.py:202` | Vendor typing | Scoped vendor exclusion/ignore; no vendor edits |
