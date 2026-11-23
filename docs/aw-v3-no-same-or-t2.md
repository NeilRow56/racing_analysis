# AW V3 without the same-OR Speed term

`AW_V3_NO_SAME_OR_T2`, revision **1**, is a locally executable All Weather Tissue Rank 2 selector for shadow review. In the matched November sample it moved T2 from 27 to 28 winners across 120 settled races and raised £1 final-SP returns from **+£2.16 (+1.80%)** to **+£13.54 (+11.28%)**. It fell to **−£2.46** after excluding its largest winning race, and the wider 2025 and early 2026 replays underperformed the original AW formula on SP returns. The evidence supports prospective comparison. Live activation remains pending review. [Matched results and robustness checks](profitability-first-model-research.md#f-revised-aw-t2-equal-race-comparison)

## Fixed calculation

Revision 1 uses the [frozen AW V3 artifact](../data/research/tissue-generation-2026-11-aw.json), identified by semantic SHA-256 `c8f75faa0aeacc88ba76f100e7d154a872bc9b2ee31a5a42d18e611e3e64f9a5`. The implementation verifies this checksum and changes one coefficient in memory. For each runner, add the unchanged base score and the three standardized adjustment contributions. Each contribution is `weight × (value − mean) / scale`.

| Feature | Mean | Scale | Frozen AW V3 weight | Revision 1 weight |
| --- | ---: | ---: | ---: | ---: |
| `speed_rank_2_3` | 0.1856594110115237 | 0.38883157551101727 | 0.06536723816051147 | 0.06536723816051147 |
| `speed_rank_missing` | 0.33290653008962867 | 0.4712534056251637 | 0.14536653750881404 | 0.14536653750881404 |
| `same_or_speed_gap` | 1.2793863279931382e−18 | 0.5228380954857 | −0.17415188659050265 | 0 |

The two retained Speed indicators use the original Best L3 Speed and missing flags. All 95 ordered base values, base weights and standardization come from the pinned artifact. Apply the existing stable softmax across the complete field. Order runners by descending probability, breaking ties by runner ID, and select the second runner. The same-OR feature is still calculated to validate the frozen input. Its contribution to the new score is zero. Revision 1 uses one selection per eligible race regardless of price. [Implementation](../src/lib/racing/aw-v3-no-same-or-t2.ts) · [Frozen scorer](../src/lib/racing/tissue-generation-model.ts) · [Feature definitions](../src/lib/racing/tissue-generation-features.ts)

## Required inputs and decisions

Use one full AW V3 `GenerationRace` from the existing pre-off capture path, together with the pinned AW model. The book includes race ID, racing date, scheduled off, capture and feature cutoff times, model version and checksum, ordered feature names, and the original active field with runner IDs, horse names, numeric base vectors and missing flags. The original context features, ranks and probabilities are also required for validation. The original AW V3 calculation must reproduce those values before revision 1 runs. Market metadata follows the existing book schema, which allows missing quote coverage. Captured odds, final SP and outcomes have no role in scoring.

- `predictAwV3NoSameOrT2(model, book)` returns `selection` with the candidate T2, original T2, full revised rankings and capture timestamps. This function supports historical replay, including a selection that was withdrawn after capture.
- `selectAwV3NoSameOrT2ForToday(model, book, context)` also requires the matching current race ID, scheduled off, active runner IDs, observation time and closed-race indicator. It abstains when the race is closed, the capture was still in the future, the off time differs, or the field has changed. Use a newly valid full book after a field change.
- Invalid vectors, mismatched source model or frozen calculation, and unsupported families produce `no-selection` with a reason. The CLI returns `no-matching-capture` when it cannot find a book.

## Run locally

From the repository root with Bun and the project dependencies installed:

```sh
bun scripts/preview-aw-v3-no-same-or-t2.ts --race-id 760cb413-2815-416c-9b1b-656c490530da
bun scripts/preview-aw-v3-no-same-or-t2.ts --date 2026-11-13
bun test src/lib/racing/aw-v3-no-same-or-t2.test.ts
```

The CLI reads the existing frozen ledger and prints JSON. Pass `--ledger <path>` to use another snapshot with the same schema. The first command returns **The Hare Rail** at **20.1251%**, replacing Hitched. The Hare Rail lost at 2/1. The [historical fixtures](../scripts/fixtures/aw-v3-no-same-or-t2.json) also cover Xirivella’s unchanged 9/1 winner, Union Island with incomplete market coverage, and Roosike’s later withdrawal. The four books come from the ledger snapshot identified in the fixture file. Expected decisions and probabilities come from variant C in the [isolated adjustment evidence](aw-v3-isolated-adjustment-evidence.json). A separate replay reproduced both leading ranks on all **123** November books, with maximum absolute probability error of **1.11 × 10⁻¹⁶**.

## Today’s Racing integration after review

1. In the [Today’s Racing server page](../src/app/racing/today/page.tsx#L159), use the generation ledger already loaded for the racecard. Filter it to the requested day’s AW captures available by the observation time, then use [`latestPreOffCaptures`](../src/lib/racing/frozen-capture-selection.ts) to choose one whole book per race. Load the pinned model once for the request.
2. For each matched book, call `selectAwV3NoSameOrT2ForToday` with the live card’s `raceId`, `raceDateTime` as `scheduledOff`, and `runnerId` values excluding `resultStatus === "non_runner"`. Set `asOf` to the observation time. For `raceClosed`, use the same pre-race stage and result checks as [Today’s price overlay](../src/lib/racing/current-price-overlay.ts#L22). A missing validated book leaves the shadow selection blank.
3. Pass the decision to the card as separate shadow data and render the revised T2 alongside the existing active T2 for comparison. Keep the live `activeTissue` field as the source for current selections. Use the model ID, revision, race ID and capture time to identify each shadow decision.
4. If prospective logging is approved, record each decision and its capture identity before the off in a separate shadow record. Compare it with frozen T2 on identical eligible races using final SP and canonical settlement v3. Record abstentions and field changes so coverage is auditable.

This delivery adds the selector, replay command, fixtures and tests. Today’s Racing continues to use its existing live selections and collection paths.
