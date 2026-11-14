# GitHub warnings investigation — 12 November 2026

## Outcome

Corrective action is justified, but no dependency fix is retained: the armed prospective epochs hash-pin both `bun.lock` and `package.json`. Even a lint-only lockfile change causes `assertEpochSources()` to fail before capture. Preserving collection takes precedence over applying that otherwise low-risk patch. No pins were resealed, no epochs restarted, and no monitor or research code changed.

Confirmed by independent audits: **19 unique JavaScript advisories across seven package names**, plus **six unique Python advisories across two installed packages**. These are genuine current advisory matches, not verified repository Dependabot alert records. All retrieved GitHub advisories have no withdrawal date. Conditional/unreachable issues are distinguished below; they are not dismissed as outdated.

## A — Repository and GitHub warning visibility

- Repository: `NeilRow56/racing_analysis`, public, origin `git@github.com:NeilRow56/racing_analysis.git`.
- Starting branch: `main`; HEAD `6f02bea3e1090eb89004b6a4eee50583396dd25e` (`Updated reseach work`). Starting working tree: clean, including untracked files.
- Remote `main` status API returned the same SHA. No commit, push, deployment or GitHub configuration mutation was performed.
- GitHub connector access succeeds and reports repository admin access, but exposes no Dependabot/code-scanning/secret-scanning/configuration tools. `gh` is not installed. Browser fallback returned exactly `The browser access host is unavailable`.
- Unauthenticated security API requests to `/dependabot/alerts`, `/code-scanning/alerts`, `/secret-scanning/alerts`, `/vulnerability-alerts` and `/branches/main/protection` returned HTTP 401, exactly `Requires authentication`. Their current alert counts, exact repository alert messages/numbers, dismissal/fixed status and protection settings **cannot be verified**. Connector permissions do not provide a usable token to these endpoints.
- Public GitHub Actions API: zero workflows and zero runs. Current main: zero check runs, zero commit statuses. Combined status says `pending` with `total_count: 0`; that is an absence of submitted statuses, not evidence of a failed/pending job. No Actions failure or annotation was returned.
- No `.github` directory locally; no open pull requests (including Dependabot PRs) returned; public rulesets API returned `[]`. Classic branch protection remains unverified. `security_and_analysis` was not returned: dependency graph, Dependabot alerts/updates, code scanning, secret scanning and push protection settings remain unverified.
- No tracked `.env*`, `.pem` or `.key` file paths were returned by the targeted filename check. This is not a comprehensive secret scan or a substitute for the inaccessible GitHub secret-scanning alerts.

## B/C — Exact dependency advisory messages, severity and relevance

Versions are taken from `bun.lock`; messages below are the exact titles returned by `bun audit --json`. Bun uses `moderate` where GitHub calls the same severity `medium`. Duplicate vulnerable-range records for the same advisory are consolidated, not counted as separate issues. Affected JavaScript manifest: `bun.lock`; Next/Zod also appear directly in `package.json`.

| Package / locked version | Severity | Exact warning message | Advisory |
| --- | --- | --- | --- |
| brace-expansion 1.1.18; 5.0.9 | high | brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) |
| brace-expansion 1.1.18; 5.0.9 | high | brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) |
| brace-expansion 1.1.18; 5.0.9 | moderate | brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) |
| esbuild 0.18.20 (nested) | moderate | esbuild enables any website to send any requests to the development server and read the response | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) |
| minimatch 10.2.6 (nested) | moderate | minimatch has potential denial of service via globparts amplification | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) |
| next 16.3.4 | high | Next.js has Server-Side Request Forgery in Image Optimization | [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) |
| next 16.3.4 | critical | Next.js: Remote Code Execution in next/og ImageResponse | [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) |
| next 16.3.4 | moderate | Next.js has information disclosure in App Router metadata image routes via dynamicParams bypass | [GHSA-f87g-xv8r-7p7x](https://github.com/advisories/GHSA-f87g-xv8r-7p7x) |
| next 16.3.4 | moderate | Next.js has cache poisoning in SSG/ISR rendering that leads to cross-user content substitution and persistent denial of service | [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) |
| next 16.3.4 | moderate | Next.js: Pending `use cache` fill can leak Draft Mode content into regular responses and persisted pages | [GHSA-3w37-wq28-93x7](https://github.com/advisories/GHSA-3w37-wq28-93x7) |
| next 16.3.4 | moderate | Next.js has cache poisoning of SSG and ISR pages in self-hosted applications | [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) |
| next 16.3.4 | low | Next.js has information disclosure in development server's Model Context Protocol endpoint | [GHSA-39w2-rjm5-chcv](https://github.com/advisories/GHSA-39w2-rjm5-chcv) |
| next 16.3.4 | moderate | next.js cache leak across root param values in nested 'use cache' functions | [GHSA-h694-7cp9-m8p3](https://github.com/advisories/GHSA-h694-7cp9-m8p3) |
| next 16.3.4 | high | Next.js: Denial of Service in App Router using Server Actions | [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) |
| next 16.3.4 | critical | Next.js: Unauthenticated Remote Code Execution in Image Optimization API when SVG files are used | [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) |
| next 16.3.4 | critical | Next.js: Unauthenticated Remote Code Execution in `use cache` functions returning typed arrays | [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr) |
| sharp 0.35.4 | high | sharp : Vulnerability in librsvg dependency CVE-2026-96889 | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) |
| source-map-js 1.2.1 | high | source-map-js allows event-loop denial of service through indexed source-map section offsets | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| zod 4.5.4 | high | Zod can exhaust memory while validating oversized constrained collections | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |

### Project impact and smallest proposed corrections

- **GHSA-2464-fhr4-w9xw:** Conditional RCE in SVG image optimization on glibc Linux. This checkout runs on macOS and has no next/image usage; no SVG opt-in found. Still present in the dependency graph; same root cause as the Sharp advisory. Smallest proposed correction: Next 16.4.1 (with matching eslint-config-next; retain React unless separately required).
- **GHSA-39w2-rjm5-chcv:** Relevant to the running next dev workflow: malicious websites visited by a developer may read development endpoint information. allowedDevOrigins is configured, but the advisory identifies missing origin checks in the MCP endpoint; do not assume that setting mitigates it. Smallest proposed correction: Next 16.4.1 (with matching eslint-config-next; retain React unless separately required).
- **GHSA-3w37-wq28-93x7:** Requires Cache Components/useCache and Draft Mode dependent cache fills. None found. Smallest proposed correction: Next 16.4.1 (with matching eslint-config-next; retain React unless separately required).
- **GHSA-4jqv-mc3x-m676:** Requires self-hosted Pages Router SSG/ISR. Project uses src/app App Router; no src/pages tree. Smallest proposed correction: Next 16.4.1 (with matching eslint-config-next; retain React unless separately required).
- **GHSA-673q-mjm6-r5xr:** Requires Cache Components and a use cache function returning multiple typed arrays. Neither is configured/used here; dependency remains affected. Smallest proposed correction: Next 16.4.1 (with matching eslint-config-next; retain React unless separately required).
- **GHSA-67mh-4wv8-2f99:** Only nested esbuild 0.18.20 is affected: drizzle-kit -> @esbuild-kit/esm-loader -> core-utils -> esbuild. Root esbuild 0.25.12 and tsx/esbuild 0.28.2 are outside the affected range. Requires esbuild serve; no project serve invocation found. Database migration/studio tooling only, not postgres or drizzle-orm query execution. Smallest proposed correction: Upstream loader/Drizzle Kit change removing esbuild 0.18.20; avoid a forced incompatible override.
- **GHSA-68fv-2mgg-jv7q:** source-map-js 1.2.1 via Tailwind/PostCSS and Next PostCSS. Malicious indexed source maps can block the parser. Build/debug tooling; no application endpoint accepting indexed source maps found. Shared framework/build dependency, so defer its parser change along with the pinned lockfile. Smallest proposed correction: source-map-js 1.2.2 (same-major patch) after lockfile pin approval.
- **GHSA-6j4f-fj2g-mc7p:** brace-expansion 1.1.18 and 5.0.9 in ESLint/minimatch dependencies. Malicious glob patterns can exhaust the stack. Development lint tooling only; no model/database/capture/settlement import path. Smallest proposed correction: brace-expansion 1.1.22 and 5.0.13, same-major patches tested in isolation; not retained in working tree.
- **GHSA-cjq9-62q9-8jv4:** Requires allow-listed remote image URLs. No images.remotePatterns configuration or next/image usage exists, so the documented prerequisite is absent. Smallest proposed correction: Next 16.4.1 (with matching eslint-config-next; retain React unless separately required).
- **GHSA-f87g-xv8r-7p7x:** Requires webpack-generated metadata image routes and excluded dynamic params. No opengraph-image/twitter-image or generateImageMetadata routes found. Smallest proposed correction: Next 16.4.1 (with matching eslint-config-next; retain React unless separately required).
- **GHSA-g3hv-75wg-m249:** minimatch 10.2.6 via @typescript-eslint/typescript-estree; root minimatch 3.1.5 is outside the reported range. Requires attacker-controlled patterns and optimizationLevel >= 2. Local lint configuration provides patterns; no application/research input path found. Smallest proposed correction: Upstream tooling adoption of minimatch >=11.0.1; major transitive upgrade needs review.
- **GHSA-h694-7cp9-m8p3:** Requires nested use cache with root params and Cache Components. None found. Smallest proposed correction: Next 16.4.1 (with matching eslint-config-next; retain React unless separately required).
- **GHSA-mcj8-r9mp-w47p:** Requires a root catch-all route plus SSG/ISR. No root catch-all route found; research pages use force-dynamic. Smallest proposed correction: Next 16.4.1 (with matching eslint-config-next; retain React unless separately required).
- **GHSA-mrhx-c7xc-m3w5:** Zod 4.5.4 parses local frozen ledgers, candidate research data, prospective epoch manifests and DB environment configuration. Large invalid collections can exhaust memory. No public arbitrary-array validation endpoint found; changing validation can affect capture acceptance/reproducibility. Smallest proposed correction: Zod 4.6.6; validate ledger/capture parsing before adoption.
- **GHSA-p3m5-59mp-jv5r:** Relevant: App Router and Server Actions are present in src/app/racing/today/actions.ts, research/actions.ts and research/forward-value/actions.ts. Crafted reachable HTTP requests can stall the Next server. Network exposure beyond the observed local process was not verified. Smallest proposed correction: Next 16.4.1 (with matching eslint-config-next; retain React unless separately required).
- **GHSA-q2hr-2g5m-vwhr:** Same lint-only brace-expansion versions; quadratic brace rewriting can consume CPU. No untrusted glob entry point identified. Smallest proposed correction: brace-expansion 1.1.22 and 5.0.13, same-major patches tested in isolation; not retained in working tree.
- **GHSA-qhr7-859c-m2p7:** Same lint-only brace-expansion versions; nested group recursion denial of service. No untrusted glob entry point identified. Smallest proposed correction: brace-expansion 1.1.22 and 5.0.13, same-major patches tested in isolation; not retained in working tree.
- **GHSA-vcvr-r3jv-pc5j:** Requires attacker-controlled SVG values passed to Node ImageResponse. No next/og or ImageResponse usage found; affected feature is not used. Smallest proposed correction: Next 16.4.1 (with matching eslint-config-next; retain React unless separately required).
- **GHSA-wq5f-xc86-pv6w:** Sharp 0.35.4, optional dependency of Next. Conditional librsvg RCE on glibc Linux; no direct Sharp/SVG processing in project source. Shares the SVG image optimization root cause above. Smallest proposed correction: Sharp >=0.35.5, preferably resolved by the approved Next update.

### Installed Python environment

The established `scraper/.venv/bin/python` environment contains 15 installed packages. OSV querybatch found the following six unique GitHub advisories. Additional PYSEC IDs in the raw response describe duplicate advisory records and are not treated as extra unique vulnerabilities. Requirements files are `scraper/requirements-rpscrape.txt` (lower bounds, no lockfile) and `scraper/requirements-hurdle-v3.txt` (`numpy==2.4.6`). Installed state is local and may differ from other machines; it is not proof of GitHub alerts for those packages.

| Installed package | Severity | Exact warning message | Advisory |
| --- | --- | --- | --- |
| certifi 2026.7.22 | critical | certifi bundles emSign root CAs with compromised intermediate CA keys | [GHSA-6q48-6c7w-9gw2](https://github.com/advisories/GHSA-6q48-6c7w-9gw2) |
| pip 25.3 | medium | pip has an interpretation conflict due to handling both concatenated tar and ZIP files as ZIP files | [GHSA-58qw-9mgm-455v](https://github.com/advisories/GHSA-58qw-9mgm-455v) |
| pip 25.3 | low | pip Path Traversal vulnerability | [GHSA-6vgw-5pg2-w6jp](https://github.com/advisories/GHSA-6vgw-5pg2-w6jp) |
| pip 25.3 | medium | pip Vulnerable to Inclusion of Functionality from Untrusted Control Sphere | [GHSA-jp4c-xjxw-mgf9](https://github.com/advisories/GHSA-jp4c-xjxw-mgf9) |
| pip 25.3 | medium | pip would incorrectly handle doubly-encoded package URLs from indexes | [GHSA-qwm4-qh6w-59xr](https://github.com/advisories/GHSA-qwm4-qh6w-59xr) |
| pip 25.3 | medium | pip: Path traversal in console_scripts/gui_scripts entry point names allows installing scripts outside of target directory | [GHSA-wf93-45jw-7689](https://github.com/advisories/GHSA-wf93-45jw-7689) |

- **Certifi:** compromised intermediate CA keys create an on-path TLS interception risk. `scraper/racing_post/client.py` uses `curl_cffi.requests`; installed `curl_cffi/curl.py` defaults to `certifi.where()` unless a CA bundle override is supplied. This can affect future scraped source inputs and therefore prospective ingestion integrity, without proving any past corruption. Sporting Life uses Python urllib/system TLS instead. Advisory first fixed version is 2026.10.18; it recommends **2026.10.19 or later** to retain unaffected roots. Changing the shared trust store could affect scraper connectivity and needs approval. Do not rewrite historical evidence.
- **pip:** five installation-time issues involving archive interpretation, wheel extraction, deferred self-update imports, malicious-index URLs and script entry point paths. No role in executing model calculations, collection or settlement. Proposed approved tooling correction: pip **26.2.0** covers all listed fixed versions (26.0, 26.1, 26.1.2, 26.2.0). This crosses a major version and was not implemented.
- No advisory match returned for the other 13 installed Python packages, including the pinned NumPy environment. This is limited to the OSV database response at investigation time, not a universal guarantee.

### Dependency use across project functions

| Function | Affected dependencies and actual relationship |
| --- | --- |
| Next.js application | Next/Sharp provide framework/image internals. Next Server Actions DoS is relevant. Zod validates environment/local research inputs. |
| Historical research calculations | Calculations and ranking rules unchanged. Zod loads candidate/ledger inputs; no affected lint glob/source-map code used in model scoring. |
| Tissue model generation | Frozen artifacts and checksums unchanged. No model rebuild/refit/training was run. |
| Prospective collection | Zod validates ledgers/manifests; Certifi can affect Racing Post HTTPS. Exact manifest/lockfile/source pins must remain valid. |
| Settlement | Existing Zod-backed ledger readers may be involved; settlement formulas and recorded results unchanged. No settlement/backfill process was run. |
| Database access | postgres 3.4.9 / drizzle-orm 0.45.2 are not matched by the JS audit. Nested vulnerable esbuild belongs to drizzle-kit development tooling, not runtime DB queries. Python psycopg had no OSV match. No DB commands/connections were deliberately run. |
| Development/build tooling | brace-expansion/minimatch for lint; source-map-js for PostCSS/Tailwind; esbuild for migration tooling; pip for installation. |

## D/E — Corrections and separate authorisation

No production correction is retained. A temporary, same-major lint-only proposal was validated: brace-expansion **1.1.18 → 1.1.22** and **5.0.9 → 5.0.13**. Only two package records/integrity hashes changed; manifest and all other locked versions stayed identical. Records came from Bun resolution; `bun install --frozen-lockfile --ignore-scripts` installed exactly two packages in the isolated copy. Audit then dropped from 19 to 16 unique JS advisories and reported no brace-expansion findings.

The patch was briefly copied to the working-tree lockfile, then restored byte-for-byte upon verifying its armed epoch pin. Installed dependencies in the live checkout were never updated. The retained proposal is `/private/tmp/racing-github-warnings-2026-11-12/proposed-lint-only.patch`; it is **not applied**.

Authorisation is required for:
1. A maintenance approach that permits dependency updates while preserving existing frozen epoch provenance and continuous prospective collection. Do not silently regenerate source hashes, restart epochs, bypass validation or rewrite historical ledgers. The current task does not authorise those changes.
2. Next **16.4.1** plus matching eslint-config-next and resolved Sharp **>=0.35.5**, with runtime validation. This is a minor Next upgrade, not a major upgrade; 16.3.8 alone does not fix all currently reported Next advisories.
3. Zod **4.6.6**, with validation of frozen/invalid ledger acceptance and prospective capture semantics.
4. Certifi **>=2026.10.19** in the shared scraper environment, with connectivity and interpreter checks; pip **26.2.0** as a separate installer upgrade.
5. The lint patches above and source-map-js **1.2.2**, once the lockfile/provenance constraint has an approved resolution. Upstream fixes for minimatch/esbuild should be assessed separately; no blanket overrides or major upgrades.

## F — Files modified

Only this report is added: `docs/github-warnings-investigation-2026-11-12.md`. `bun.lock` and `package.json` finish byte-identical to their starting state. No application, Python, model, data, database, workflow, configuration or installed dependency changes are retained.

## G — Validation and evidence preservation

- Validation ran in an APFS copy under `/private/tmp/racing-github-warnings-2026-11-12/validation`, with independent data/node_modules and no copied `.env.local` or database credentials. The live `.next` and running Next process were not rebuilt/restarted.
- Read-only SHA-256 comparison checked **43,345 protected files**, including **42,668 data files / 16,142,751,546 data bytes**: no changes. Coverage includes frozen tissue artifacts, historical caches/raw data, ledgers, captured bookmaker prices, settlement evidence, source files/pins and model checksums. The comparison completed before restoring the temporary lockfile proposal; final lockfile equality was separately confirmed against the starting SHA-256.
- Starting protected-file manifest SHA-256: `400c396c52c7f06b332d7db99d06a82c74a34740dbb08f793c5acba71ac9ce10`.
- Final read-only project integrity functions: **141 armed source pins PASS; eight frozen model versions/checksums PASS**. Activation remains `2026-11-11T16:39:41.798Z`. The original lock hash is `074d40051423a95cc476090637d43483c4dabcb74485bbeb4799e0b7cb9368a4`.
- Strict TypeScript: initial isolated copy lacked generated `LayoutProps`; `bun run next typegen` generated route types, then **`bun run typecheck` passed** without changing strictness.
- `bun run lint`: **one existing error** (`scripts/diagnose-long-price-winner-rate-by-family.ts:300`, `@typescript-eslint/no-explicit-any`) and **one existing warning** (`src/lib/racing/jump-tissue-forward.test.ts:42`, unused `_horseId`). Left unchanged as outside this maintenance scope.
- `bun test` as one process: 878 pass, 88 fail, 87 errors. An old preservation assertion failure cascades into Bun 1.3.5 `NotImplementedError: describe() inside another test() is not yet implemented` errors.
- Test files rerun in separate Bun processes to avoid that cascade: **165 files; 162 pass, three fail; 1,874 passing tests and three failing tests**. Two failures (`capture-pin-compatibility.test.ts`, `prospective-epochs.test.ts`) compare current ledgers with older 11 November preservation snapshots. Both fail first at `data/research/chase-jump-tissue-v1-value-forward-v1.json`; the actual hash `ca2f3cf5a73a43fd0f68bf3b3ba140609ff78b610852ab4fd4faebbbb464e3a3` was already present in this investigation's starting manifest, so this is not a change introduced here. No snapshot was rewritten.
- Third individual failure: `race-result-surface.test.ts` executes despite its `node:test` skip option under Bun and fails on missing `DATABASE_URL`. No credentials were supplied to make that DB integration test run.
- Python source was not edited; no Python training/diagnostic script was created and no Pyright run was needed.
- Default `bun run build` (Turbopack) stalled at compilation and was stopped after approximately three minutes in isolation. Supported webpack fallback result is recorded below.
- **`bun run build --webpack` passed**, including compilation, TypeScript, static page generation and trace collection. Both builds and all tests used the isolated lint-patch proposal; application/runtime versions were identical to the restored checkout. No build was deployed.

## H — Remaining warnings and limits

All **19 JS advisory matches** remain in the unchanged project lockfile. All **six unique Python advisory matches** remain in the unchanged local interpreter environment. Several have absent feature prerequisites; Server Actions, development MCP exposure and Certifi deserve priority. No evidence found establishes exploitation or corrupted research.

Repository-specific Dependabot, code-scanning, secret-scanning, dismissed/fixed alert state, branch protection and security feature configuration remain **unverified**, not clean. No Actions runs/workflows exist in the public API response. Existing lint/test failures above remain. Monitor source/model integrity is confirmed at completion; scheduler execution and future external-service availability are not established by these read-only checks.

Raw audit JSON, primary advisory descriptions, GitHub API responses, Python inventory, individual test logs, build/typecheck/lint logs, preservation manifests and the unapplied proposal are retained locally in `/private/tmp/racing-github-warnings-2026-11-12/`. That temporary directory is not committed and may be cleaned by the operating system.
