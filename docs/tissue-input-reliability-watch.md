# Tissue Input Reliability — Research Watch

Added 27 October 2026. Reporting only; no selection, model, Value, capture, settlement or tracker change.

The source definition is the **Sparse Data** section of `/tmp/tissue-overlay-driver-family-diagnostic.md`, supported by its frozen vectors and actual Turf v3, AW v2 and Jump v1 feature encoding. The diagnostic’s sparse-input weakness did not persist across both chronological halves. This watch tests reliability descriptively; it does not assume a successful exclusion condition.

`getTissueInputReliability` returns:

- **CAUTION:** any existing numeric `*_missing` flag is 1, or the exact frozen log prior-start count decodes to zero.
- **GOOD:** complete compatible frozen metadata, all numeric missing flags zero, and a nonzero frozen prior-start count.
- **UNKNOWN:** absent, incomplete, nonfinite, incompatible or internally inconsistent frozen metadata. This is never treated as GOOD.

Turf/AW use `log_prior_runs`; Hurdle/Chase use `log_prior_jump_starts`. The current numeric value/flag blocks and family-specific schema markers are checked before classification. The 43 prior-comment terms do not have numeric missingness flags. AW’s explicit surface-history missing flags count, but an observed zero exposure or zero performance delta is not missing. Small trainer/jockey sample counts do not themselves cause CAUTION. No sample cutoff, latest-figure age threshold, usable-L3 count, current metric or outcome is inferred.

Concise reasons distinguish unavailable family performance, unavailable AW surface inputs, missing connection inputs, zero recorded prior starts and other missing numeric inputs. They do not assert that every incomplete AW surface contrast is thin history. GOOD certifies neither recent figures nor adequate underlying samples. Old usable Turf figures can still yield GOOD.

## Populations and placement

The collapsed Research watch immediately follows **Tissue Rank 1 & 2 — Prospective**. It covers **all existing prospective Tissue Top-2 observations**, across all market ratios, rather than restricting the UI to the earlier diagnostic’s ≥1.50 overlay population. Rank 1, Rank 2 and Top 2 each show Turf, AW, Hurdle, Chase and All families. GOOD, CAUTION and UNKNOWN remain visible.

Model results use the existing primary family books and their unchanged identity/date/pre-off guards. Each runner’s reliability comes from that book’s own frozen vector. The Value columns use the separate complete-market Value cohort’s **own** frozen inputs, ranks, capture clocks and probabilities. There is no reliability or price substitution between cohorts. Actual/model is the primary comparison; captured-price returns are secondary and do not describe every runner in the model columns.

Pending only contributes to captured counts. Model expected sums stored probabilities for settled starters. NR/void and canonical dead-heat outcomes use the existing `tissueProspectiveMetrics`; price n requires a valid frozen bookmaker price and a stored finite P/L. Missing prices create neither a stake nor a loss.

The Speed-watch interaction shows the four GOOD/CAUTION × WATCH/NON-WATCH cells, plus explicit UNKNOWN cells, for each Tissue rank and racing family. Unknown Speed ranks remain NON-WATCH under existing Speed-watch semantics; input UNKNOWN is distinct.

Chronology uses the median timestamp of distinct prospective race captures, independently for primary and Value cohorts. It never uses settlement order or outcomes. Whole books/equal clocks remain together, and the boundary updates as observations accumulate. Missing race identity or capture clocks go to UNKNOWN CAPTURE TIME. Earlier data are discovery context, not independent confirmation; later follow-up may be incomplete. No split is optimized.

## Daily display and capture

Today’s frozen Top-2 Tissue badges get a small separate amber-outline **Data** indicator only for CAUTION. Its tooltip says “Research watch: this Tissue estimate uses materially sparse or incomplete pre-race inputs. No exclusion rule is applied.” Concise supported reasons follow. GOOD/UNKNOWN get no warning. The existing pale-red Best L3 watch badge, Value badge, rank/probability text and daily shortlist condition are unchanged. Either flag, both or neither can occur.

The Today indicator uses the existing frozen Value rank projection. It does not synthesize a badge when that capture is absent. Classification is still available in primary Research summaries independently of market coverage. Molly Valentine’s frozen input class is CAUTION, but her Tissue rank 9 is outside the Top-2 indicator’s scope. Power Of Prayer, Glitter Code, Ten Cuidado and Midnight Lir have GOOD input classes in the forensic captures. No horse names appear in classification code.

Current captures already freeze the vectors, model versions and schema metadata required to derive reliability. No new tracker, persistent field, migration, historical backfill, capture job or settlement job is required. Refresh the existing Research page after ordinary tracker updates; this watch itself only projects stored observations.
