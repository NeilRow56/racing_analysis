# Chase Speed Reliability — Research Watch

CHASE SPEED RELIABILITY SHADOW EPOCH: **2026-10-28T09:35:43.000Z**

CHASE SPEED RELIABILITY HYPOTHESIS DECLARED: **2026-10-28T09:35:43.000Z** (UTC; London was on GMT).

Fixed primary hypothesis: compare **HIGH vs MEDIUM/LOW** Jump Speed reliability for Chase Tissue Rank 1 and Rank 2, separately and combined. Actual/model expected is primary; captured-price ROI is secondary. HIGH is never pooled with another level. MEDIUM and LOW are also reported individually. No exclusions or live rule.

The existing `assessJumpSpeedReliability` helper is unchanged. The capture records its existing assessment from the same `HorseMetrics` used by the card/scorer: HIGH = three usable Jump figures in the eligible all-code L3 window; MEDIUM = two; LOW = zero or one, including a genuinely empty loaded history. An absent metrics/assessment object is **unclassified**, not assumed LOW. There is no outcome-based tuning or Hurdle comparison.

## Provenance and epoch

The existing primary Jump book and separate Value book retain frozen Speed summaries, not the L3 figure-availability counts or entire L3 window. Neither `log_prior_jump_starts` nor `best_l3_jump_speed_missing` can recover this classification exactly. The earlier diagnostic queried/reused historical evidence after capture. That reconstruction is discovery context, not frozen pre-race reliability and not independent confirmation.

Consequently, no earlier date can be claimed as a consistent frozen-reliability epoch. The implementation declaration is the earliest eligible epoch; the first actual frozen sample will start at the next newly accepted pre-race Chase capture. Existing observations, including already-captured pending races, are never retroactively classified. On implementation there are **zero post-declaration observations**. All 98 existing primary Chase Top 2 captures have no frozen classification.

A minimal separate ledger is necessary: `data/research/chase-speed-reliability-shadow-v1/<identity-sha256>.json`. It contains only capture metadata, runner identities, existing reliability assessments and context state. It does not duplicate probabilities, ranks, prices or settlements into another outcome tracker. No file or historical entry is seeded by implementation.

Primary capture runs inside the existing Jump sync lock, only for new Chase books. Value capture runs inside its existing cohort lock, only for accepted new Chase books. Snapshot identity includes **cohort + race ID + exact capturedAt**, and attachment additionally requires runner ID. A current later card cannot reclassify an earlier book. Snapshots are atomically published, first-write retained on retry, and only accepted from declaration onwards, before off, within 60 seconds of book capture. Slow/late captures remain visibly unclassified rather than being backfilled. Temporary files are ignored. Weekly backups include all published snapshot files with existing checksum verification.

The monitor reads these annotations and the unchanged authoritative prospective source adapter. Primary model results and separate complete-market Value results retain their own ranks, probabilities, reliability and clocks. Their populations can differ: Value ROI must not be presented as the return on every primary runner. Pending counts only as captured; NR/void do not enter settled metrics. Expected winners sum frozen probabilities of settled starters; mean probability uses that same sample. P/L uses stored canonical settlement, including dead heats, and existing genuine captured-price eligibility rules.

## Display and fixed context

The research panel beside the existing Tissue prospective summaries shows Rank 1, Rank 2 and Top 2 for POST-declaration confirmation and PRE-declaration discovery separately. Unknown clocks have their own section. Unclassified-state counts are explicit; they remain in the baseline prospective summaries.

Each reliability row shows captured, settled, winners, strike, mean Tissue probability, model expected, Actual/model, separate Value price n/P/L/ROI and settled sample label. Labels: <50 TOO EARLY, 50–149 EARLY, 150–299 DEVELOPING, 300+ MEANINGFUL.

Expandable descriptive Top 2 tables compare HIGH vs MEDIUM/LOW by:

- Existing Best L3 watch/non-watch, with missing Speed rank separate.
- Handicap/non-handicap, using existing classifier on **structured raceType/raceTypeCode only**, with raceName explicitly omitted. Ambiguous/absent metadata stays missing. This is deliberately narrower evidence than the prior diagnostic's title-assisted frozen handicap feature; no inference from titles or generic `chase` is made.
- Full captured-field competition OR ranks: 1, 2–3, 4+, missing. Subsequent NRs and non-Top-2 runners still participate in the frozen rank calculation.
- Market ranks: 1–2, 3–5, 6–10, 11+, missing. Available for Value only; no model-book market reconstruction.
- Tissue probability: <10%, 10–<15%, 15–<20%, 20–<30%, 30%+.
- Existing `VALUE_RATIO_BANDS` and `valueRatioBand`, plus missing. Available for Value only.

Every context reports primary and separate Value settled/winners/Actual-model. Context is not combined into a selection rule. Daily racecard visuals, pale-red watch, Data caution, daily shortlist, Jump model, Speed, Tissue/Value scores/ranks and settlement are unchanged.

Read-only current report (no database needed):

```sh
bun run scripts/report-chase-speed-reliability-shadow.ts
```

## Current reconstructed discovery evidence

Source: the existing 28 October diagnostic `/tmp/chase-underperformance-annotated.json` and `/tmp/chase-underperformance-vs-other-models-diagnostic.md`. This table records the motivating diagnostic; it is not imported into the prospective ledger or UI, and is not a claim of frozen classification. All groups are TOO EARLY.

| Top 2 reliability | Primary settled | Winners | Actual/model | Value price n | Value ROI |
|---|---:|---:|---:|---:|---:|
| HIGH | 40 | 10 | 0.997 | 37 | -22.08% |
| MEDIUM | 21 | 3 | 0.591 | 21 | -67.48% |
| LOW | 9 | 0 | 0.000 | 9 | -100.00% |
| MEDIUM/LOW | 30 | 3 | 0.446 | 30 | -77.23% |

| Rank | HIGH settled/winners/A-model/Value ROI | MEDIUM/LOW settled/winners/A-model/Value ROI |
|---|---|---|
| 1 | 20 / 5 / 0.873 / -1.79% | 16 / 3 / 0.662 / -57.31% |
| 2 | 20 / 5 / 1.160 / -43.50% | 14 / 0 / 0.000 / -100.00% |

Watch interaction (primary settled/winners/Actual-model): HIGH non-watch **20/6/1.284**, HIGH watch **20/4/0.746**; MEDIUM/LOW non-watch **20/2/0.472**, MEDIUM/LOW watch **9/1/0.417**. One MEDIUM/LOW runner has missing Speed rank (1/0/0.000), not silently assigned non-watch.

The earlier diagnostic's broad handicap interaction: HIGH **33/7/0.880**, MEDIUM/LOW **22/0/0.000**. Those prior figures used its frozen title-assisted handicap feature; they do **not** establish coverage for the new structured-only handicap split. Its remaining categories also separated novices, so they must not be relabelled collectively as non-handicap.

OR rank 2–3: HIGH **16/2/0.492**, MEDIUM/LOW **6/0/0.000**. These overlapping small samples are descriptive only.

## Implementation audit

CHASE SPEED RELIABILITY SHADOW: YES. PRIMARY COMPARISON: HIGH vs MEDIUM/LOW. NEW TRACKER REQUIRED: YES, minimal immutable annotation ledger because exact reliability is not recoverable from frozen existing books. HISTORICAL BACKFILL: NO. RACECARD VISUAL CHANGED: NO. TISSUE MODEL CHANGED: NO. SPEED CALCULATION CHANGED: NO. TISSUE RANK CHANGED: NO. VALUE LOGIC CHANGED: NO. SELECTIONS EXCLUDED: NO. DATABASE CHANGED: NO.

No sync, settlement or database command was run during implementation. Existing research/model files had pre-existing user changes; implementation verification compares their bytes against the start-of-task hashes rather than against Git HEAD.

Files changed:

- `src/lib/racing/chase-speed-reliability-shadow.ts` — declaration, scope, fixed summaries and contexts.
- `src/lib/racing/chase-speed-reliability-capture.ts` — separate immutable capture annotations and exact-identity attachment.
- `src/lib/racing/chase-speed-reliability-shadow.test.tsx` — focused scope, metrics, context, chronology, ledger and rendered-UI tests.
- `src/lib/racing/jump-tissue-sync.ts` — annotation hook for new primary Chase captures.
- `src/lib/racing/tissue-prospective-summary.ts` — optional runner identity in the reporting type.
- `src/lib/racing/tissue-prospective-sources.ts` — expose existing runner identities for exact attachment.
- `src/app/racing/research/forward-value/chase-speed-reliability-shadow.tsx` — compact research panel.
- `src/app/racing/research/forward-value/forward-value-page.tsx` — load annotations and place panel alongside prospective summaries.
- `scripts/track-tissue-value-forward.ts` — annotation hook for accepted new Value Chase captures.
- `scripts/report-chase-speed-reliability-shadow.ts` — read-only JSON report.
- `scripts/backup-weekly.ts` — include published annotation files in verified backups.
- `scripts/backup-weekly.test.ts` — verify nested annotations survive archive/extraction and incomplete files are ignored.
- `docs/chase-speed-reliability-shadow.md` — frozen hypothesis, provenance, epoch, evidence and audit.

Validation: 75 tests across the focused shadow, Jump Speed reliability, Tissue prospective sources/summary, Best L3 watch, Chase challenger, Jump Tissue and all-family Tissue/Value suites passed. All 13 weekly-backup tests also passed. Targeted ESLint and `git diff --check` passed. All 75 pre-existing research/model files matched their start-of-task SHA-256 hashes; no historical records were written.

Final standalone `bun run typecheck` passed after the production build completed. `bun run build --webpack` passed, including compilation, TypeScript, static page generation and build traces. Typecheck was run sequentially after build to avoid Next regenerating `.next/types` while standalone TypeScript reads them.
