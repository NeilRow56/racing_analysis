# Rank 1 model observations with optional market data

New captures use `RANK_ONE_MODEL_MARKET_OPTIONAL_V2` from
`2026-10-22T18:51:26.000Z` (22 October 2026, 19:51:26 BST). The capture
builder rejects earlier capture timestamps. Existing same-day, pre-off,
complete-field, result-free and first-capture safeguards remain in force.
The named 14:55 and 16:05 Newmarket races on 22 October cannot be captured.

The additive JSON contract keeps `RANK_ONE_FORWARD_V1`, its original epoch
and `data/research/rank-one-forward-v1.json`. New rows carry `contractVersion`
and `contractEffectiveAt`; old rows need neither. Loading does not normalize,
backfill or rewrite old observations. No database migration is required.
A read-only implementation audit loaded 214 existing observations, all with
non-null market values; 198 lacked modelProbability. These remain valid legacy
records and their missing probabilities are not reconstructed.

Every new observation freezes the selected runner's authoritative
`modelProbability` from a complete, valid model field. Turf v3 uses the existing
Tissue probability and competition rank, Jump uses the existing Hurdle/Chase
predictor probability and rank, and AW v2 preserves its probability, frozen
inputs and feature cutoff. The explicitly supplied legacy AW v1 scorer also
freezes its existing probability. No model calculations change. Existing
family-specific live semantics and cohorts remain separate from this contract.

With a complete genuine bookmaker market, price, normalized probability and
market rank use the existing calculations. With an incomplete market,
`normalizedProbability` and `marketRank` are null. The selected runner's genuine
median price is retained when available and is otherwise null. `fieldPrices`
contains only genuine available prices; it is not a normalized or ranked
partial market. Forecast/current odds never supply missing prices. The first
observation remains frozen even if more quotes subsequently arrive.

Canonical result settlement counts all valid settled model observations in
settled/winner/strike metrics. NR and void observations retain their existing
exclusions; started non-finishers remain losses. Without a captured price,
settlement still records the result but leaves monetary outcomes null.
Qualifying-price ROI includes only settled rows with a finite genuine price
above 1 and a settled monetary return. A/E's numerator and denominator both
use only settled rows with a valid normalized complete-market probability.
UI and CLI expose `pricedSettled` and `aeSettled` separately; missing market
prices and ranks display as an em dash.

The Value monitor and its complete-market guard are unchanged. Morning capture
still runs through the existing workflow; settle/live/after only settle existing
observations. No new command, historical backfill or data rewrite is needed.
Existing research JSON modifications present before this work are user data.
