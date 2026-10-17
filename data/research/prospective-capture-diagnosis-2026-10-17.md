# Prospective tracker diagnosis — 17 October 2026

ROOT CAUSE: Both new trackers required the result-only `actualRunnerCount` before prospective capture; every loaded racecard has this field unset.

The racecard importer explicitly inserts NULL for actual starters and preserves any existing result count (`scraper/sporting_life/importing.py`, `upsert_racecard_race`). It supplies `declaredRunnerCount` from the card's `ride_count`. Both builders compared NULL with active/loaded runner counts and rejected every race before evaluating bookmaker markets or Tissue ranks.

## Loaded universe and date

Both scripts resolve today with `getLocalRacingDate()` in Europe/London: **2026-10-17**. The normal Today's Racing loader returns **60 races / 577 runners**. The scripts use that same `getTodaysRacingData` loader, source reconciliation and runner IDs, filtered to supported families (rank-one) or Hurdles (recency).

| Family | Races | Runners |
|---|---:|---:|
| TURF | 22 | 238 |
| AW | 9 | 90 |
| HURDLE | 18 | 185 |
| CHASE | 8 | 42 |
| NH_FLAT | 3 | 22 |

Three NH Flat races are correctly outside both trackers' family scope. All 60 races have NULL actual starter counts. There is no date-universe mismatch. Scheduled-off instants use the normal loader's canonical race-date plus Sporting Life UTC scheduled time; the examples below show London BST. Every race resolves back to 17 October in London.

## Staged eligibility

The rank and market counts below independently expose available inputs, even though the original field check ran before them.

| Rank-one stage | Races |
|---|---:|
| Today's races | 60 |
| Supported family | 57 |
| Current Tissue ranking available | 57 |
| Rank-one runner available | 57 |
| Complete valid bookmaker market | 53 |
| Epoch/date and pre-off guards passed, among those 53 | 53 |
| Original actual-count field check passed | **0** |
| Already captured before repair | 0 |
| Original final captures | **0** |
| First repaired sync captures | **53** |
| Already captured in subsequent audit | 53 |
| New captures on repeated sync | 0 |

| Hurdle stage | Count |
|---|---:|
| Today's Hurdle races | 18 |
| Runners | 185 |
| Required history/metrics lookup available | 185 |
| Valid complete bookmaker market | 185 |
| Epoch/date and pre-off guards passed | 185 |
| Original actual-count field check passed | **0** |
| Already captured before repair | 0 |
| First repaired sync observations | **185** |
| Captured races | 18 |
| New observations on repeated sync | 0 |

A successful empty history is explicitly eligible; prior starts are not mandatory. The audit records each runner's actual prior-run count. All 185 Hurdle runners are captured, across all market/Tissue ranks.

## Representative races

Every example has a current Tissue ranking, a rank-one runner, valid bookmaker quotes, and a complete normalized market. Before repair every example was rejected for `actualRunnerCount is null; result-only count required before capture`. After repair all four qualify, with no rejection reason.

| Family | Race UUID / source ID | Course | London off | Rank-one horse | Tissue p | Median price | Normalized market p | Market rank |
|---|---|---|---|---|---:|---:|---:|---:|
| TURF | 92208c0f-4c20-4f66-9b69-d15248b913c3 / 944546 | Ascot | 12:55 | Inner City Blues | 0.19647694 | 4.33 | 0.18694522 | 2 |
| AW | 72861c7b-4dce-438b-ad1d-c95b96b3511b / 944020 | Southwell | 17:00 | Wid | 0.22302432 | 3 | 0.26447075 | 1 |
| HURDLE | 1be442b8-9c84-4d48-9415-9859b8435720 / 943984 | Market Rasen | 13:15 | Hold The Throw | 0.27473482 | 2 | 0.39100134 | 1 |
| CHASE | 0dd05376-bd68-4a64-ae59-9a403c215044 / 943986 | Market Rasen | 14:25 | Fringill Dike | 0.18534102 | 3.5 | 0.24018476 | 2 |

The full JSON audit contains all 60 races and every Hurdle runner, with exact original and current rejection reasons, IDs, times, prices, probabilities and history availability.

## Remaining market exclusions

All **60** races have at least one bookmaker quote and at least one valid median. **56** have a complete active bookmaker market; **4** do not. Three of the 56 complete markets are NH Flat, leaving **53** supported captures. These four races remain correctly excluded:

| Race UUID | Course / London off | Family | Unpriced active horse |
|---|---|---|---|
| 1a478366-ed7f-4cb0-ac6c-443f2aabe143 | Ascot 16:35 | TURF | Crown Of Oaks |
| d73ce814-eabe-41d3-9a11-0e9cd10f65ac | Southwell 16:23 | AW | Desiderata |
| b78d4a72-7574-4d7d-9a3a-d9207d5e5d93 | Southwell 19:00 | AW | Dance Fantasy |
| 3185d2d0-bfb7-45cc-93a0-a14c4e612466 | Southwell 20:00 | AW | Crystal Jet |

The new trackers reuse `summarizeBookmakerMarket`, as the existing forward price trackers do. The existing jump/AW trackers can capture a selected runner's median without a fully priced field. These two new trackers intentionally need the complete field to normalize market probabilities for expected winners and market-rank comparisons. That requirement is stricter, but it explains only four exclusions, not the original zero, and has been preserved. Forecast odds and SP are never used as substitutes.

## Authoritative Tissue comparison

The existing and new paths use the same reconciled Sporting Life race source and family helpers. Turf uses `buildTissueForwardRace` with `TISSUE_V2_CONFIG` and the frozen Turf V2 artifact; Hurdle/Chase use `predictJumpTissue` and `loadJumpTissueModel`; AW uses `predictAwTissue` and `loadAwTissueModel`. Prior comments and AW prior starts are loaded using the existing helpers. The current rank-one wrapper selects the existing rank 1, using stable runner ID only for an exact Turf tie. No second scoring/ranking implementation was added. All four authoritative-source equivalence tests pass.

## Epoch and prospective semantics

Rank-one epoch: **2026-10-16T15:37:02.000Z**. Hurdle epoch: **2026-10-16T12:59:12.000Z**. Capture is checked against the actual current capture time, today's London date, scheduled off and result absence. Neither builder uses racecard creation, import time or snapshot age as its epoch input. Every newly stored capture is on 17 October, after its epoch and strictly before scheduled off. No earlier date was added.

## Repair

A shared `hasCompleteProspectiveField` helper validates unique runner IDs and the complete active/loaded field against `actualRunnerCount ?? declaredRunnerCount`. Missing or inconsistent counts still fail; a present inconsistent actual count does not fall back to declarations. Declared non-runners may be included in or excluded from the source count. Both prospective builders use this helper. Actual starter counts remain mandatory in settlement, with settlement code unchanged.

No model, ranking, value logic, price cap, market normalization, forecast-price rule, epoch or no-backfill behavior changed.

## Verification

- `bun run rank-one:sync`: Turf 21; Hurdle 18; Chase 8; AW 6 (53 total).
- `bun run hurdle-recency:sync`: 18 races; 185 observations.
- Repeated actual syncs: persisted file hashes unchanged.
- Focused tracker/current-day tests: **52 passed, 0 failed**, including declaration-only cards, all-runner capture, authoritative Tissue rank reuse, complete real bookmaker markets, BST midnight resolution, post/pre-epoch guards, pre-off-only capture, duplicates and repeated sync.
- `bun run typecheck`: passed.
- Targeted ESLint: passed without warnings.
- `git diff --check`: passed.
- Refreshed live Research HTML: Hurdle **185 observations**, rank-one **Turf 21 / Hurdle 18 / Chase 8 / AW 6**, with today's captured runner rows rendered.
