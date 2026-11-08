# Today racecard refresh

## Live status only

```sh
bun run today:status-refresh
# Optional date: must be today's Europe/London date.
bun run today:status-refresh YYYY-MM-DD
```

This command fetches current Sporting Life racecards for locally stored UK/Ireland
races and changes **only `race_runners.result_status`** for existing runners with
an explicit `RUNNER` or recognised NR/withdrawn status. `RUNNER` can restore a
pre-off NR to active. Unknown statuses, missing rides and new runners are left
unchanged. An omitted runner is never automatically declared NR.

It does not run a card import, update prices, run models, append captures, write
source payloads or modify any research ledger. It is separate from the full
`today:refresh` command below, which can append new pre-off captures.

Only today’s future races with recognised pre-race stages are eligible. The
detail payload is checked again after fetching. Canonical completed/resulted
races, runners with a finishing position, and legitimate result statuses are
protected. Already-off/unknown stages are reported as deferred; use the existing
`research:live` results workflow for settlement, not historical status backfills.
Request failures stop reconciliation; prior successfully committed status updates
remain, and the command can be rerun idempotently.

Current-day morning, late and live workflows invoke this command once after
their import stage. It adds no Tissue/Value capture step or force-refresh flag.
Morning’s existing acquisition-failure fallback skips this extra network step
and warns that live statuses may be stale.

Today retains NR rows with the existing label/strike-through. Their ranks remain
visible as muted **Frozen Tissue / Frozen Value / Frozen Mkt** text, without
active Top2, agreement, Value or watch-list emphasis. NR eligibility never changes
the frozen rank or promotes another runner. Both current and legacy daily watch
lists exclude canonical NRs. Historical research summaries and settlement retain
their underlying observations.

Today shows the canonical non-NR runner count separately from the declared count
at the last full import. Neither figure rewrites a captured field size; the
imported count is not labelled “originally declared”, because Sporting Life may
already have reduced it for withdrawals.

Offline regression coverage includes the six 7 November audit examples,
explicit RUNNER/NR transitions, unknown/absent rides, completion guards,
capture/ledger immutability, UI eligibility and workflow routing. The SQL guard
tests use an isolated SQLite database (without PostgreSQL row-lock syntax);
they do not access or update the production database.

## Full racecard and prospective capture refresh

Diagnosis before this change:

- `sl:import-racecards` already re-fetched existing detail pages by default. Only the explicit `--skip-existing-racecards` resume option (used at night) skipped a recorded source import. Completed full results also skipped detail acquisition.
- Canonical imports upsert `source_imports` (including `fetched_at`), races and runners. Reimporting canonical cards did not replace a frozen model book.
- `track-tissue-value-forward.ts` and `syncTissueGeneration` excluded known race IDs before scoring. Their append/load/mutation guards enforced one book per race. This was the principal reason a 05:36 Value book with `JUMP_TISSUE_V1` survived a later card import.
- Today rendering reads canonical cards and frozen Value ledgers, then runs an idempotent Tissue sync. The existing Refresh results button imports results, not racecards. No racecard reload UI exists.
- The new Tissue generation and independent Value selection use separate model books by design. `JUMP_TISSUE_V1` remains the independent Value model identity; it is not the active new Tissue model. Value probability/model identities must not be relabelled as Chase/Hurdle V2.

Run the explicit end-to-end manual refresh:

```sh
bun run today:refresh
# Optional explicit date, restricted to today's Europe/London date:
bun run today:refresh 2026-11-05
```

This uses the existing Sporting Life importer with `--force-refresh`, followed by the existing Value and Tissue sync commands with `--force-refresh`. Source failures stop the command. Only source IDs successfully fetched/upserted in that run are passed to capture, with no fallback to stale morning prices.

The importer skips elapsed scheduled offs and completed results, rejects unknown or already-started detail stages, and checks the deadline again before upserting. Sporting Life's timezone-less source clock is UTC, as in the existing importer. Builders and append guards independently reject captures at/after scheduled off. A race crossing its deadline during the operation gets no new prospective observation. Unknown schedule/stage is conservatively preserved.

Normal automated sync still accepts only the first book per race. Explicit refresh can append distinct later books. Existing JSON record shapes and database schema are unchanged; ledger identity is now race ID plus capture timestamp. Unchanged latest source/model state (excluding capture/history clocks and settlement outcomes) is a no-op; duplicate capture identities are rejected. Locks and atomic writes continue to protect concurrent operations and immutable existing fields.

Today selects the newest valid pre-off **whole book** per race, independent of file order. Early records remain accessible through the research loaders and timestamped Value history tables. Research aggregates count preserved observations, so repeated captures are correlated observations, not extra independent races. New-generation Tissue uses TURF_TISSUE_V4, AW_TISSUE_V3, HURDLE_TISSUE_V2 and CHASE_TISSUE_V2. Independent Value books freeze VALUE_RANK_V2 after its epoch, including the 21–<51 price-band gate on original Value 1 (5–9 prior career runs), no rank-2 promotion, and original V1 shadow decisions.

The command reports source cards refreshed, already-off cards preserved, and the latest valid Tissue capture in London time. A refreshed source card may still fail capture completeness/market/model guards; source-card counts are not a promise of new model observations. An unchanged refresh retains the prior valid timestamp.

Old 05:36 captures deleted: **NO**. Historical Tissue/Value capture fields rewritten: **NO**. Retrospective post-off captures: **NO**. Database schema changed: **NO**. No historical backfill or rewrite. Existing result settlement may still fill previously pending outcomes under the established immutable-capture rules.
