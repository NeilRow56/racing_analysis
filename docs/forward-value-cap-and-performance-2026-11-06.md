# Forward Value policy cap and Research performance — 6 November 2026

## Value policy

**Before:** `VALUE_RANK_V2`, epoch `2026-11-05T06:37:02.000Z`. Original Value 1 required 5–9 prior career runs only at frozen prices `21.00 <= price < 51.00`; other prices were unchanged.

**After:** Still `VALUE_RANK_V2`, with the additional policy epoch **`2026-11-06T04:00:07.000Z`**. New captures at or after this timestamp use:

| Frozen captured price | Original Value 1 eligibility |
| --- | --- |
| <21.00 | Retained |
| 21.00–<51.00 | Requires 5–9 prior career runs inclusive |
| 51.00–67.00 inclusive | Retained |
| >67.00 | NO VALUE 1 / NO PROMOTION |

Both rejection cases leave Value 2 unchanged. Original rank-1 ties are evaluated individually. T1=V1 reads the frozen active membership. Explicit rejection labels are 0–4 prior runs, 10+ prior runs, missing prior runs, and PRICE ABOVE 67.00. Research monitoring shows the price rejection separately and lists counts for each policy epoch.

The original V2 epoch remains valid in the ledger schema. Capture validation reconstructs the expected policy using the capture timestamp, so older V2 captures retain the experience-only rule, including any legitimate >67 selections. A cap-era policy cannot be attached to a pre-cap capture. Settlement does not rewrite policy metadata.

- Historical selections rewritten: **NO**.
- Backfill performed: **NO**.
- Value model formula changed: **NO**.
- Tissue models changed: **NO**.
- Database schema changed: **NO**.
- Historical data changed by this task: **NO**. Existing uncommitted research data and other work were preserved.

## Measurements and diagnosis

Reproduction command (Bun, with the local PostgreSQL environment):

```sh
bun --env-file=.env.local run scripts/profile-forward-value.tsx
bun --env-file=.env.local run scripts/profile-forward-value.tsx --verify-results
bun --env-file=.env.local run scripts/profile-forward-value.tsx --archive
```

The profiler calls the actual async page and renders its component tree. COLD is the first calculation in a fresh process; WARM is the second call with unchanged sources. These are server calculations plus React rendering, excluding Next compilation/network/browser hydration. Loader timings include shared event-loop scheduling and parallel I/O and must not be summed.

| Stage | Before cold | Before warm | After cold | After warm |
| --- | ---: | ---: | ---: | ---: |
| Full server data/page calculation | 47.882 s | 37.575 s | 2.572 s | 0.123 s |
| Component rendering | 1.216 s | 1.002 s | 0.225 s | 0.162 s |
| **Total** | **49.098 s** | **38.577 s** | **2.797 s** | **0.285 s** |
| Canonical result check | 46.272 s | 35.944 s | 0.340 s | cache hit |
| Historical card reconciliation | 11.706 s | 12.414 s | 0.913 s | cache hit |
| Current prices | 1.855 s | 2.213 s | 0.796 s | cache hit |
| Research files overall | 1.105 s | 1.171 s | 1.071 s | cache hit |
| File modification identity | — | — | 0.010 s | 0.018 s |
| Database modification identity | — | — | 0.128 s | 0.100 s |
| Derived reporting, including Tissue joins | rebuilt | rebuilt | 0.399 s | cache hit |
| Reporting/dashboard/archive diagnostics within derived stage | 0.200 s | 0.162 s | 0.186 s | cache hit |

Before cold individual parallel file stages: Forward Value 0.084 s; Turf Tissue 0.054 s; AW Tissue 1.048 s; Jump Tissue 1.105 s; AW paired 1.026 s; Jump G4 0.561 s; weight 0.719 s; disagreement 0.717 s; reviews 0.561 s; Hurdle pair 0.981 s; Chase pair 0.363 s; Hurdle recency 1.010 s; rank-one 0.907 s; all Value cohorts 0.900 s; Tissue generation 0.444 s. Chase snapshot scan was 0.006 s. These are elapsed parallel stages, not isolated CPU costs.

**Main bottleneck:** the research page used the complete Today racecard query to determine whether historical races had conclusive results. This extracted bookmaker/forecast/surface JSON for every historical runner, then built full race objects. The result check dominated page time. Current-card reconciliation unnecessarily used that same rich racecard loader.

**Additional HTTP bottleneck:** after only query/data caching, the real Next development response still took 24.461 s warm and was 15,530,060 bytes. Collapsed native `<details>` did not defer server rendering or serialization; the active client also received every historical Value runner. The final active response was approximately 225 KB, with observed development HTTP loads of 0.809 s and 2.951 s. These HTTP observations include development/runtime variability and are separate from the controlled cold/warm profiler comparison.

## Optimisation and invalidation

1. Canonical results now read only race ID, winning time, finish position, result status and starting-price decimal. The existing Today conclusive-result predicate is preserved, including NR and incomplete-result handling. The original and projected queries matched exactly across **1,424 conclusive races** in a read-only database parity check.
2. Current-card reconciliation reads only its identity/field columns with the same source/import filters, ordering and reconciliation algorithm. It avoids bookmaker JSON extraction.
3. A bounded process-local cache keeps the parsed/validated research snapshot. Each request checks root ledger JSON and chase snapshot file identity: path, inode, size, nanosecond modification/change times. Atomic replacement, additions, deletions and same-size edits invalidate it. Large nested holdout/diagnostic directories are not scanned or parsed.
4. Database reporting snapshots and derived reporting use file identity, London racing date, database identity, and relevant filter identity. Database identity reads counts and full-precision maximum `updated_at` from races, runners and source imports. Existing importers update those timestamps for card/price/result/NR changes. A 30-second maximum lifetime additionally bounds DB/derived cache reuse. Failures are not cached; concurrent reads coalesce.
5. Active client family views receive precomputed calibration/Value-policy summaries and totals, rather than all historical runners. The server projection is cached by the immutable source snapshot object, so new file snapshots also invalidate this projection.
6. The server archive loads explicitly through `?archive=1`. Its link disables prefetch. Original frozen runner tables also require loading the archive. All historical data remains available, but normal navigation omits the archive component tree and detailed client payloads.

`force-dynamic` remains intentional: the route checks source identities on navigation and does not become a stale full-page cache. React's existing `cache()` on the cohort reader was only per render and did not prevent work on later visits. No user needs to restart Next to observe a changed source. Morning/live/after/late writes and settlements invalidate through their existing file/DB writes; no additional workflow hook is required.

A request concurrent with an in-progress workflow may observe that workflow's current partial state, as before. Subsequent requests see changed identities. The cache does not create a new transaction boundary across independent workflow files.

## Files changed by this task

- `src/lib/racing/value-rank-v2.ts`
- `src/lib/racing/tissue-value-forward.ts`
- `src/lib/racing/todays-racing.ts`
- `src/lib/racing/research-cache.ts` (new)
- `src/lib/racing/research-profile.ts` (new)
- `src/lib/racing/research-result-status.ts` (new)
- `src/lib/racing/research-cache.test.ts` (new)
- `src/lib/racing/value-rank-v2.test.tsx`
- `src/lib/racing/active-value-performance.test.tsx`
- `src/app/racing/research/forward-value/forward-value-page.tsx`
- `src/app/racing/research/forward-value/active-value-performance.tsx`
- `src/app/racing/research/forward-value/research-page-layout.tsx`
- `src/app/racing/research/forward-value/research-page-layout.test.tsx`
- `src/app/racing/research/forward-value/tissue-value-monitoring.tsx`
- `src/app/racing/research/forward-value/tissue-value-monitoring-client.tsx`
- `src/app/racing/research/forward-value/value-rank-v2-monitoring.tsx`
- `scripts/profile-forward-value.tsx` (new)
- This report (new).

Some listed files already had uncommitted changes before this task; those changes were retained.

## Validation

- Value policy tests: 34 passing, including all families, 67.00/67.01/101/251 boundaries, unchanged experience bands, no promotion, T1=V1 and pre-cap validation/persistence.
- Cache/projection tests: 5 passing, including unchanged cached/uncached summaries, captures, settlement, NR, same-size edits, atomic writes, deletion, DB-key changes, failed-read retry, active payload parity and retained archive data.
- Today/racecard tests: 54 passing.
- All-family Value tests: 18 passing.
- Research layout tests: 8 passing, including explicit server archive loading.
- Tissue generation tests: 12 passing.
- Forward Value tests: 41 passing.
- Active-performance tests: 3 passing. The unsettled-only P/L expectation was corrected to the established `null` contract; settlement logic was unchanged.
- Tests run in separate Bun invocations: this installed Bun version reports `node:test` nesting errors when these async test files are combined in one invocation.
- Query parity: exact match across 1,424 conclusive races.

- Total targeted tests: **175 passing**, run in isolated invocations (30-second timeout for the data-heavy active-performance suite during concurrent build load).
- Strict TypeScript: passed (`bun run typecheck`).
- Targeted ESLint: passed.
- Production build: passed (`bun run build --webpack`). The default Turbopack build could not bind its internal worker port in this environment, including the broader execution attempt; the supported Webpack build completed successfully.
- Normal and requested-archive HTTP responses: 200. The archive retains its large detailed payload; one measured archive request took 78.584 seconds while the production build and tests were competing for resources. This work defers that reference-only cost rather than claiming the full archive is fast.

Final production HTTP verification used a fresh temporary `next start --port 3101` process from the successful build, then stopped that server:

| Production HTTP | Status | Total | Response bytes |
| --- | --- | ---: | ---: |
| First request / cold | 200 | **2.999 s** | 197,510 |
| Second request / warm | 200 | **0.210 s** | 197,510 |

The original development server on port 3000 was left running.
