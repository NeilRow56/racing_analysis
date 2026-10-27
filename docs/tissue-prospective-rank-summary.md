# Prospective Tissue Rank 1 / Rank 2 / Top 2

The Research page reads existing files on each server render. This is a reporting projection, not a tracker. Scope begins on 20 October 2026, after each model's actual activation. Membership uses stored Tissue rank exactly 1, exactly 2, or their union; Value rank, edge, caps and market availability never filter primary results. Native ties remain unchanged and no runner is promoted after a withdrawal.

## Best L3 Speed Rank 2–3 research watch

The fixed shadow condition is **Tissue rank 1 or 2 AND Best L3 Speed rank 2 or 3**. It never removes a runner from any summary, racecard, capture, Value rule or settlement. `isTissueTop2SpeedRankWatch` is the shared presentation/reporting predicate. Jump Speed reliability is independent and does not enter it.

Effective data epoch: **20 October 2026**, matching the existing prospective Tissue summary. The earliest admitted primary capture in the implementation snapshot is `2026-10-20T02:29:14.134Z`. The hypothesis was declared on **24 October 2026**. The 20–23 October discovery observations are included as existing prospective context, not independent confirmation. No pre-epoch races or later reconstructed historical inputs are imported. Current raw data are left untouched; no new tracker, capture job, database column or backfill is required.

The books preserve full-field frozen feature vectors, not a uniform separately persisted Speed-rank column. The read-only adapter exposes `bestL3SpeedRank` using the **existing finite descending competition-rank routine moved unchanged from `model-disagreement-forward.ts` into `descending-ranks.ts`**. This is the established Best L3 ranking method, not a new Speed calculation, rating, model input or tie policy. It operates once per captured full field, retaining runners subsequently marked NR. It reads the existing `best_l3_turf_speed` feature for Turf, the same inherited slot containing **AW Speed** in AW v2, and `best_l3_jump_speed` for Hurdle/Chase. Explicit missing flags are respected; a missing vector, invalid flag/value or incomplete frozen-field evidence makes the rank unavailable rather than inferring a rank. No live history, SP, market, Value, TPR or Today's Rating rank enters this projection.

The compact expandable panel directly follows “Tissue Rank 1 & 2 — Prospective”. For Rank 1, Rank 2 and Top 2, it shows the watch and its complement across Turf/AW/Hurdle/Chase/All. Model columns retain each primary book's probabilities and outcomes. Money columns independently select the separate complete-market Value cohort using its **own** frozen Tissue/Speed ranks and canonical captured-price outcomes. NR/void, pending, dead heats and missing-price denominators use the existing summary helper unchanged. The complement includes missing Speed ranks; their capture counts are displayed explicitly, and missing ranks never trigger a badge warning.

The daily racecard and the existing Value-monitoring runner tables use the same projected rank from each Value book. Matching existing Tissue 1/2 badges retain their labels, sizing and dark text with `border-red-200 bg-red-50`; other badges keep their original classes. Tooltip: “Research watch: Tissue top-2 runner with Best L3 Speed rank 2–3. Early prospective results for this subgroup are weaker; no exclusion rule is applied.” No changing numerical A/E is embedded in the tooltip. Probability/Value/market/Speed displays and runner order are unaffected. The daily warning therefore corresponds to the Value capture displayed by that badge, which can differ from the broader primary Tissue book; it never borrows a rank from a different capture.

Implementation snapshot (24 October; not hardcoded into the UI): watch primary settled/winners/A:model is Rank 1 **30/2/0.278**, Rank 2 **38/5/0.792**, Top 2 **68/7/0.518**. Complement is **105/23/0.925**, **93/17/1.154**, **198/40/1.010**, respectively. These data remain part of every existing baseline. Future persisted results appear on the next normal page render; the shadow projection never runs capture or settlement itself.

## Sources and separate denominators

Primary model results use `data/research/tissue-forward-v3.json` (Turf v3), `aw-tissue-forward-v2.json` (AW v2), and `jump-tissue-forward-v1.json` (Jump v1, stored Hurdle/Chase subtypes only). They retain their own frozen probabilities and rank labels. Eligible books must be pre-race, after activation, with unique runner IDs and finite positive probabilities summing to one. Existing exclusion reasons are respected.

The broader primary books do not contain uniform captured-price settlements for both ranks. The distinctly labelled money columns therefore use a **separate complete-market Value cohort**: `turf-tissue-v3-value-forward-v1.json`, `aw-tissue-v2-value-forward-v1.json`, `hurdle-jump-tissue-v1-value-forward-v1.json`, and `chase-jump-tissue-v1-value-forward-v1.json`. Existing validated loaders supply these files. Money membership uses this cohort's own frozen Tissue ranks. No prices, probabilities or money are substituted into the broader model cohort. The standalone Rank 1 ledger is not merged into either cohort.

Price n is the number of settled £1 stakes with a genuine frozen bookmaker price >1 and a stored canonical P/L. P/L sums those persisted outcomes, including existing dead-heat deductions; ROI divides by Price n. No SP, forecast, current price or missing-price loss is substituted. Primary winners/strike/model expectation and money can describe different runner sets; the UI groups and explains the columns accordingly.

## Result evidence

Pending observations count in Captured only. NR/void observations remain captured but are excluded from settled denominators, model expected winners and stakes. Started non-finishers remain settled losses. Each dead-heat winning runner counts as one winner. Model expected sums the primary settled starters' frozen probabilities without renormalization after NRs. All families is descriptive pooling of different models; Top 2 counts correlated runner observations.

AW and Jump books have stored per-runner result statuses. Turf does not: for a settled Turf book, the report joins existing canonical result status by exact family/race ID/runner ID from the Value files and verifies the finishing position agrees. It retains the Turf book's probability and rank, discarding joined money. Without that status evidence, an existing positive numeric Turf finishing position is unambiguous; a null position is left unresolved and a notice is shown. SP never determines result status. No UI settlement job is run.

## Audited identity quarantine

Recovered from `/tmp/tissue-rank-1-2-prospective-summary-audit.md` (23 October 2026). Reporting exclusions are keyed by family, date and source ID; stored tracker records are untouched. They remain excluded until an explicit identity review resolves them.

| Family/date | Source ID | Stored race ID | Reason |
|---|---|---|---|
| AW, 23 October | 945140 | 449726a8-a126-4af3-9de9-647959601857 | Pending Dundalk alternatives 945140/945533 share 11 horses (fields of 14 and 11); neither identity is established as authoritative. |
| AW, 23 October | 945533 | 5dd6bc59-f118-4a32-a5ec-c97a38b67fa2 | Same unresolved Dundalk overlap. |
| Chase, 22 October | 944784 | aad79656-a8dc-4d5c-8867-d019f41fe382 | Pending Ffos Las field contains all nine horses in settled source 945340. Retain settled 945340. |

The audit snapshot has 145 raw/142 valid captured books and 290 raw/284 valid Top-2 observations. These exclusions affect captured/pending counts only. The single shared horse with Dundalk 945142 is not treated as evidence of a duplicate.

## Refresh

No new command is required. Refresh/revisit the dynamic Research page after existing file updates; there is no browser polling or UI settlement.

- `research:live` and `research:after` run primary settlement and `tissue-value:results`, so newly persisted model and captured-price outcomes appear on the next page render.
- `research:settle` updates the family Tissue books, so new primary outcomes appear on the next render. It does **not** settle the separate Value files. Their money and canonical Turf status enrichment update when the existing Value settlement step runs, as it already does in live/after. A Turf null-position result without canonical evidence remains unresolved meanwhile.

## Verified snapshot

Primary pooled captured/settled/winners: Rank 1 142/100/21; Rank 2 142/97/18; Top 2 284/197/39. Model expected: 24.255295, 15.609443, 39.864738. Secondary price n/P&L: Rank 1 93/−£5.69; Rank 2 90/−£3.59; Top 2 183/−£9.28. These are observations from the files during implementation, not hardcoded UI totals.

## Exact going research metadata

Exact going research metadata has an additive capture contract effective from
**2026-10-25T16:34:47.000Z** (`EXACT_GOING_CAPTURE_EPOCH` in
`src/lib/racing/prospective-going.ts`). This is the earliest eligible capture
timestamp for the new code, not a claim that an actual capture job ran at that
instant. The first new observation created by the updated normal workflow starts
coverage for that race. Existing observations, including ones whose timestamps
are later than this boundary but were created by older code, are never enriched.
Missing source going remains missing; the epoch does not guarantee coverage.

The authoritative available pre-race field is `TodayRace.going`. The Sporting
Life racecard importer reads `props.pageProps.race.race_summary.going` into
`races.going` (`upsert_racecard_race` in `scraper/sporting_life/importing.py`).
`getRacecardRowsWhere` selects `races.going`, and Today's meeting construction
copies `row.going` to `TodayRace.going`. The source is available at capture time
when supplied; it can be null. Importer/test examples include `Good` and `Soft`.
No missing value is inferred from the binary model features, another capture,
a result payload, another race, the course or an external service.

The mutable database column can be revised by later racecard/result imports.
New captures freeze the value in the pre-race object supplied to the existing
capture operation. They do not consult later database going. Existing guards
still reject post-off/result-bearing captures. This records what the application
knew when it captured the race, without claiming a separate upstream publication
timestamp or guaranteeing that source data are complete.

Two optional nullable fields are added to the existing JSON snapshots:

- `goingRaw`: original source string, including punctuation, spacing and mixed
  descriptions. Null means no source text (or AW).
- `goingCanonical`: lexical normalisation of that same string: uppercase,
  runs of punctuation/whitespace replaced with `_`, boundary underscores removed.
  Empty/whitespace-only text yields null, never `GOOD`. Unrecognised nonempty
  wording retains all its words rather than being forced into a known severity.

There is no existing reusable exact-going canonicaliser in the capture path.
The historical going-form parser extracts multiple terms, while private research
scripts use broad/lossy groupings. The new shared `canonicalGoing` helper therefore
performs lexical normalisation only; it does not define a severity taxonomy.
Examples: `Good to Soft` → `GOOD_TO_SOFT`; `Yielding to Soft` →
`YIELDING_TO_SOFT`; `Soft to Heavy` → `SOFT_TO_HEAVY`; `Soft, heavy in places` →
`SOFT_HEAVY_IN_PLACES`; `Good to Soft, Soft in places` →
`GOOD_TO_SOFT_SOFT_IN_PLACES`. Future diagnostics must document any grouping of
mixed descriptions; these are not silently reduced to `SOFT` or `HEAVY`.

Turf and Jump primary ledgers store this race-wide context once on each frozen
race book (including Hurdle and Chase). The separate Value ledgers store it once
on their own race snapshot because their capture time and model cohort can
differ. `buildProspectiveTissueSources` exposes the owning book's fields on
each runner observation, so reports can group directly by `goingCanonical` and
inspect `goingRaw`. The primary cohort never borrows Value going. The separate
runner-level Rank 1 Monitoring ledger stores the same fields for parity.

AW Value and Rank 1 records use null going; primary AW going remains absent and
projects as null. Existing primary AW `surfaceMappingVersion` and
`surfaceFeatureEvidence` remain separate and unchanged. `Standard`, Tapeta and
Polytrack are not treated as turf ground.

The fields are optional without deserialisation defaults: old JSON files still
load, old entries retain their exact structure, and legacy projected observations
show null. Existing JSON/header/model/feature versions are retained because this
is backward-compatible optional context. No persisted historical observations
were backfilled or rewritten. Duplicate capture keeps the original snapshot;
refresh, settlement and `research:after` retain frozen going. The Value file's
existing immutable-capture guard also rejects changing or adding going on an
already stored entry.

`research:morning` requires no changes: it imports racecards, calls
`rank-one:sync` and `tissue-value:sync`, and runs the existing `tissue:sync` and
`jump-tissue:sync` capture paths. Each uses the shared metadata capture helper.
Refreshing a race already captured without going does not fill it in later.

Going is **research metadata only**. The existing `going_soft`/`going_firm`
features, all feature vectors, coefficients, scoring, probabilities, native
Tissue ranks, Value/market calculations, membership, prices, settlement and UI
remain unchanged. Future Soft/Heavy diagnostics are supported for new records
with non-null metadata, with their own sample and coverage checks.
