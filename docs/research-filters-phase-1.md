# Research Filters Phase 1 — model performance workspace

Implemented on the existing `/racing/research` page. The new comparison workspace is read-only. Existing 2025 filters, saved/frozen rules, historical holdout snapshots, stability, time-slice and price sensitivity panels remain in Advanced Filters. New comparison parameters do not enter saved rule identity or actions. Source reads reuse the existing bounded research cache with per-request filesystem identity checks, so source changes invalidate derived results.

## Functionality

- Explicit stored model/version selection and native versus matched runner populations.
- Two configurable historical periods: 2025 development and 2026 exploratory / previously used evidence by default; overlapping periods are identified.
- Full-book normalization and stored tissue ranking reuse the existing Value metric helpers (`normalizeCompleteMarket`, `valueCompetitionRanks`).
- Full-field rating ranks and normalized SP probabilities are computed before matching or selection filters. Missing model values are excluded rather than treated as zero; competition ranks preserve ties.
- £1 actual SP settlement reuses `settleSelection`, including the existing dead-heat policy. No price caps apply to headline comparison results.
- Summary and breakdowns show qualifying runners, distinct races, settled runners, wins, strike rate, actual SP P/L and ROI, market expected winners, A/E and missing settlement/benchmark coverage. A/E actual winners and expected winners use the same covered subset; actual winners use dead-heat shares.
- Fixed breakdowns cover calendar quarter, handicap status, jump subtype, actual field size, decimal SP bands, model rank, and tissue probability edge where supported. Edge versus SP is explicitly retrospective, not an available pre-race betting signal.
- Nearby rank threshold sensitivity retains the eligible population and other criteria. Winner concentration reuses existing outlier diagnostics. Original rule stability and time-slice infrastructure remains accessible in Advanced Filters.
- Optional application of the current advanced rule reuses its evaluator on a copy, with comparison dates replacing development dates. Unmatched feature records are excluded. Trainer cohort rules remain in their existing year-specific workflow; cross-family/cohort comparison requests return no selections with an explanation.

## Supported stored sources

Six cached metric views: Latest Speed, Latest Performance, Latest Today's Rating, Best L3 Speed, Best L3 Performance and Best L3 Today's Rating. Version labels come from compatible cache manifests: `backtest_features_v4`, `historical_target_metrics_v4`, family speed versions, `weight_performance_v1`, and `todays_rating_v1`.

The seventh source is stored Turf Tissue V3: `tissue_model_v3 / TURF_TISSUE_V3_PRERACE`. It reads the existing ledger and model provenance metadata, never the scorer. Records must match artifact version/checksum, have a pre-race capture and feature cutoff, occur after fitting and training, and have valid stored probability fields. Duplicate race snapshots are excluded, rather than choosing one retrospectively. Stored final outcomes cannot alter model probabilities/ranks.

Historical rating markets require all actual starters, a consistent known actual runner count and valid SP/results for each runner. The V3 capture contract stores the complete active declaration field; its ledger market is used only when every captured runner has a valid final result and SP. Otherwise a complete historical cached market is used where available; absent coverage stays missing. No price is synthesized. The workspace does not read pre-race bookmaker quote collections and does not label result SP or stored market-implied result probabilities as captured quotes.

## Coverage audited on 11 November 2026

Counts describe current compatible sources, before rank/period selection. They can change as existing collection processes run; the UI reports current source coverage.

| Family/source | Cached rows or stored predictions | Actual dates | Latest Speed native runners / races |
| --- | ---: | --- | ---: |
| Jumps compatible cache | 47,506 | 1 Jan–31 Dec 2025 | 35,998 / 4,832 |
| All-weather compatible caches | 49,698 | 1 Jan 2025–21 Sep 2026 | 39,440 / 5,040 |
| Turf compatible caches | 89,559 | 3 Feb 2025–19 Sep 2026 | 71,597 / 8,737 |
| Turf Tissue V3 ledger | 1,861 | 20 Oct–4 Nov 2026 | 1,861 / 152 (tissue, not Speed) |

The raw 2025 and partial 2026 feature counts exactly match the confirmed diagnostic figures: jumps 47,506 / 4,862 races and 33,004 / 3,368; turf 48,657 / 4,740 and 40,902 / 4,059; AW 30,633 / 3,104 and 19,065 / 2,008. However, the 2026 jump cache declares `jump_winning_time_guard_v1`, while the current loader requires `jump_winning_time_guard_v2_missing_minute`. Its 33,004 rows are excluded from this workspace by the existing compatibility policy. They remain on disk unchanged. The lower native model counts above reflect missing model values/void runners, rather than missing source records. Turf 2025 coverage ends 8 November; turf 2026 coverage starts 15 February. Native date ranges do not imply continuous coverage on every date.

All 152 stored V3 races passed provenance validation in this audit. Of 1,861 predictions, 1,554 have usable settlement. Complete ledger SP fields cover 722 runner observations in 68 races. The remaining 307 settlements and 1,139 market benchmark observations are missing/excluded; these are separate overlapping coverage diagnostics.

There are **zero matched runners between current cached turf ratings and stored V3 predictions**, because their dates do not overlap. Matched mode reports an empty comparison. Native mode permits separate descriptions, with explicit population warnings. No historical predictions were reconstructed to bridge the gap.

## Files

- `src/app/racing/research/page.tsx`: existing page integration and Advanced Filters container.
- `src/app/racing/research/model-performance-workspace.tsx`: controls, summary, breakdown and robustness rendering.
- `src/lib/racing/research-model-sources.ts`: read-only cache/ledger readers and source metadata.
- `src/lib/racing/research-model-comparison.ts`: model adapters, coverage, matching, markets, summaries and breakdowns.
- `src/lib/racing/research-price-sensitivity.ts`: exports existing winner concentration helper with a minimal structural input type; calculation unchanged.
- `src/lib/racing/research-model-comparison.test.ts` and `src/app/racing/research/model-performance-workspace.test.tsx`: focused calculation, coverage, provenance and interface regressions.
- `docs/research-filters-phase-1.md`: this implementation and coverage report.
- `src/lib/racing/research-holdout.test.ts`: synthetic manifests now include the current jump winning-time guard version required by the existing cache loader. No production snapshot or loader behavior changed.

## Validation

Targeted regression suite: 233 tests passed across 13 files, covering source/model coverage, identical eligible populations, ties, normalized SP, incomplete/invalid/duplicate fields, withdrawals, missing prices, period boundaries, breakdown partitions, native stored tissue, provenance/future cutoff rejection, isolation of frozen rules and stability/settlement regressions.

TypeScript and ESLint on all changed TypeScript files pass. A render of the native turf comparison using current stored data confirms the expected ledger coverage and evidence labels, with no invalid numeric output.

Repository-wide lint reports an unrelated existing explicit `any` error in `scripts/diagnose-long-price-winner-rate-by-family.ts:300` and an unused variable warning in `src/lib/racing/jump-tissue-forward.test.ts:42`.

The documented Webpack production build (`bun run build --webpack`) passed. The default Turbopack build was stopped after remaining in compilation without output; no project build configuration was changed.

## Limitations and next investigation

The strategic diagnostic was produced in an earlier session without a saved repository artifact. The user supplied its confirmed conclusions during implementation; this implementation follows those conclusions and treats the repository as authoritative for current code and data details. The overlapping Value ledger is not treated as an independent model or evidence sample.

Only currently compatible cache versions and the existing stored V3 semantics are selectable. Old incompatible caches are not silently promoted, rewritten or backfilled. Ratings are not calibrated probabilities and have no predicted-edge filter. Missing outcomes in the V3 ledger are not inferred as defeats. Historical SP is not an achievable pre-race execution quote. Trainer-cohort comparisons require the retained year-specific workflow. This release does not establish a fresh independent holdout.

Suggested investigation: compare Latest Speed with Latest Today's Rating on the matched all-weather population, first on 2025 development and then on previously used 2026 evidence. Inspect broad handicap and field-size breakdowns, A/E coverage and winner concentration before narrowing filters. Treat rejection or failure to replicate as useful findings; avoid searching for the highest ROI subset.

No database records, cached research data, frozen artifacts, prospective monitors, live tissue calculations, Today's Racing logic or collection/settlement write paths were changed by this implementation. Existing unrelated working-tree data/script changes were left untouched.
