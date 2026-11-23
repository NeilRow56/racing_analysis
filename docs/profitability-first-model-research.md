# Profitability-first Tissue research

**None of the three profitability policies demonstrated a sustainable improvement over frozen Tissue 2 across Chase, Hurdle, All Weather and Turf.** On 332 matched November pre-off books, A made 59 bets for **−£8.50 (−14.41%)**. Original T2 returned **−£3.33 (−1.00%)** across those books. B and C made **zero bets** at genuine captured prices. C returned **+£4.41** in the previously explored 2026 final-SP simulation, from 29 bets in underround books, and fell to **−£3.09** without its two largest winning races. The [frozen original baseline](tissue-t2-profit-baseline-v1.json) reconciles **380 matched races, 83 winners and −£16.99 (−4.47%)**. All three policies have a [local prediction entry point](#k-local-models-and-todays-racing-handoff).

## A. Frozen baseline and source integrity

The [immutable baseline artifact](tissue-t2-profit-baseline-v1.json) records **all 413 original current-generation T2 records**, with **392** having audited final-SP returns and **380** belonging to the exact reference where original T1 also settled at final SP. It includes race and runner IDs, horse names, versions and hashes, original rank and probability, frozen time and feature cutoff, capture price when present, settlement status/date, final SP, win credit and £1 return. The latter twelve individually priced T2 records remain in the inventory outside the 380 matched metric. An unavailable price or an excluded result is retained as null. Its content SHA-256 is `16834242dc50c60bbfb9d803b49825ef218b9b8b350478a139a6020d97571a7a`. The frozen artifact can be verified or identically regenerated, and the script refuses to replace it with different bytes.

| Family | Original production model | Frozen source base | Ranking |
| --- | --- | --- | --- |
| Turf | `TURF_TISSUE_V4` | `tissue_model_v3` | Descending probability, competition ties |
| AW | `AW_TISSUE_V3` | `AW_TISSUE_V2` | Descending probability, then ascending runner ID |
| Hurdle | `HURDLE_TISSUE_V2` | `JUMP_TISSUE_V1` | Same deterministic runner-ID tie rule |
| Chase | `CHASE_TISSUE_V2` | `CHASE_SHADOW_V1` | Same deterministic runner-ID tie rule |

Original rank 2 is taken from a valid complete pre-off primary book, with the original active runners and one identity per race. All books in this snapshot have unique T1 and T2. Each family uses frozen logits and full-field softmax. The baseline uses neither capture price nor final SP to choose T2, and a later withdrawal does not promote anyone. The model manifests and hashes are pinned by family. The matching process checked every T1/T2 identity, all 413 T2 probabilities and settlement availability against the original diagnostic, and independently recalculated money from the terminal Sporting Life ride evidence. The 380 reconstructed results reproduce **−£16.993958818958816** and **−0.044720944260417936** before rounding. [Previous diagnostic](tissue-rank1-vs-rank2-diagnostic.md) · [Original generation ledger](../data/research/tissue-generation-forward-2026-11.json) · [Model manifest](../data/research/tissue-generation-2026-11-manifest.json)

## B. Data and pricing

- **November, genuine pre-off inputs.** 5–20 November 2026. The 380-race reference has **332** complete captured bookmaker books. All three experimental policies can be evaluated on the same 332 opportunities, then compared on the exact races where each policy placed a settled bet. The 48 other reference races have no complete quote book for this analysis. Their original T2 and final SP remain in the reference. A captured price is an auditable median bookmaker quote, with no evidence here about executable stakes or later availability.
- **2025 discovery and 2026 previously explored replay.** The existing audit-proved historical exports supplied **12,377** full 2025 races and **9,226** early 2026 races. All joined by exact race and starter IDs to the independent terminal audit and passed the subsequent result-credit and price checks. The upstream export already excluded unproved and incomplete fields. Past form is as-of historical reconstruction, with latest and Best L3 values gated by prior date. Some declarations and provider publication times are not certified, and within-field transforms use terminal starter rosters. Models B and C use their own race's final SP on these historical books because there is no equivalent pre-off price history. Those selections are explicitly **retrospective SP simulations**. The AW auxiliary replay has distinct evidence and coverage.
- **Settlement.** Every price return is an uncapped £1 win stake using **canonical settlement v3**. November and audited AW auxiliary results use original fractional final SP. The broad historical simulations use exact numeric SP from the terminal result audit, reconciled to the cache price within its rounding tolerance. Studied race IDs are unique within each population. Non-runners, voids and unresolved results contribute no stake. Started non-finishers lose £1. Dead heats split gross win return and A/E credit. The model's win count and strike count winning runner records. Market expectations use normalized `1 / final decimal SP` over the actual starters. The SP favourite is a retrospective control, chosen on the shortest final price with exact ties broken by runner ID.

The [prior market study](retrospective-market-beating-models-2026.md) documents the upstream feature and field eligibility, and the [independent result audit](racing-2025-2026-data-market-trainer-audit.md) documents terminal reconciliation. The new machine evaluation pins both exports, the underlying cache hashes and the retained audit source. [Canonical v3](settlement-v3.md)

| Population | Family | Races | Distinct racing dates | Covered months |
| --- | --- | --- | --- | --- |
| 2025 | ALL | 12377 | 362 | 2025-01, 2025-02, 2025-03, 2025-04, 2025-05, 2025-06, 2025-07, 2025-08, 2025-09, 2025-10, 2025-11, 2025-12 |
| 2025 | TURF | 4720 | 219 | 2025-02, 2025-03, 2025-04, 2025-05, 2025-06, 2025-07, 2025-08, 2025-09, 2025-10, 2025-11 |
| 2025 | AW | 3078 | 259 | 2025-01, 2025-02, 2025-03, 2025-04, 2025-05, 2025-06, 2025-07, 2025-08, 2025-09, 2025-10, 2025-11, 2025-12 |
| 2025 | HURDLE | 2891 | 321 | 2025-01, 2025-02, 2025-03, 2025-04, 2025-05, 2025-06, 2025-07, 2025-08, 2025-09, 2025-10, 2025-11, 2025-12 |
| 2025 | CHASE | 1688 | 314 | 2025-01, 2025-02, 2025-03, 2025-04, 2025-05, 2025-06, 2025-07, 2025-08, 2025-09, 2025-10, 2025-11, 2025-12 |
| 2026 | ALL | 9226 | 285 | 2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06, 2026-07, 2026-08, 2026-09, 2026-10 |
| 2026 | TURF | 4048 | 174 | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06, 2026-07, 2026-08, 2026-09 |
| 2026 | AW | 1990 | 178 | 2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06, 2026-07, 2026-08, 2026-09 |
| 2026 | HURDLE | 2031 | 246 | 2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06, 2026-07, 2026-08, 2026-09, 2026-10 |
| 2026 | CHASE | 1157 | 238 | 2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06, 2026-07, 2026-08, 2026-09, 2026-10 |
| November reference | ALL | 380 | 16 | 2026-11 |
| November reference | TURF | 8 | 1 | 2026-11 |
| November reference | AW | 121 | 10 | 2026-11 |
| November reference | HURDLE | 164 | 15 | 2026-11 |
| November reference | CHASE | 87 | 15 | 2026-11 |
| November pre-off common | ALL | 332 | 15 | 2026-11 |
| November pre-off common | TURF | 7 | 1 | 2026-11 |
| November pre-off common | AW | 116 | 10 | 2026-11 |
| November pre-off common | HURDLE | 136 | 14 | 2026-11 |
| November pre-off common | CHASE | 73 | 14 | 2026-11 |

## C. Research designs and chronological freeze

| Policy | Fixed method | Where evaluated |
| --- | --- | --- |
| **A · `T2_RELIABILITY_BLEND_V1`** | Look only at original T2. Set `p = M + w(TissueP − M)` where M is capture-market probability and `w = k·n/(n+3)`. n is the frozen eligible history count, k is 0.5 with observed Best L3 and 0.25 otherwise. Bet only when `p × offered decimal − 1 ≥ 3%`. | Captured November quotes. No original 2025 T2 books exist for this generation, so A is a fixed research rule with no fitted parameters or earlier T2 proxy. |
| **B · `MARKET_FORM_TILT_V1`** | Race softmax on `ln(M) + β·x`. Three bounded features are the lower of latest and Best L3 Speed midranks scaled by historical depth, official rating midrank, and centred history coverage. Use a single pooled L2 fit and take the highest projected net return above 3%, with one selection per race across all ranks. | Broad 2025/early 2026 on final SP, separately on November pre-off quotes. |
| **C · `MARKET_FORM_LOG_UTILITY_V1`** | Use B's forecast and 3% eligibility. Among qualifiers choose the largest positive `p·ln(1+0.01·(odds−1)) + (1−p)·ln(0.99)`. The 1% reference fraction shapes ranking only. Actual return remains £1 per stake. | Same fields and price regimes as B. |

The form ranks are centred within each field in `[-1,1]`, with tied observations sharing a midrank and missing ranks zero. History coverage saturates at six eligible runs. The Speed term is zero if either observed Speed figure is missing, and unknown history coverage contributes zero in the standalone coverage term. The lower form rank requires the latest and best evidence to agree before giving the biggest uplift. This replaces the previous broad threshold and tree search with an explicit form-persistence feature and a test of the price decision. A weights the frozen Tissue/market disagreement conservatively, while keeping a missing-Speed outsider eligible on other supported evidence. For its probability diagnostics only, the probability mass outside T2 is distributed in proportion to the capture market.

The B coefficients are **+0.007733, −0.019468, +0.037171** in feature order. They were fitted on the first **9,304** eligible races through **30 September 2025**, using L2 **0.035**, 160 fixed steps and step size 0.4. October–December's **3,073** races form the chronological validation. The script wrote the versioned model definitions before opening the 2026 replay. It used the same coefficients and thresholds for the later 2025 validation, 2026 replay and November. The fitting-period results are included as diagnostics. No hyperparameter search, feature elimination, alternate cutoffs or 2026 refit was run. C uses B's fixed probabilities without additional fitting. The 3% buffer and reference fraction were selected as design constants ahead of evaluation. The buffer is a projected percentage of stake and includes no fee or slippage deduction in the resulting backtest.

Expected log growth gives diminishing value to large payouts and balances them with the probability of loss. It reduces the incentive to chase a rare high nominal return. No price ceiling enters A, B or C, and the fit does not regress on uncapped realised payouts. Each runner can be skipped and each experiment takes at most one bet per race. The frozen [machine definitions](profitability-first-model-definitions-v1.json) record the complete attempted specifications, feature and parameter choices and source pins.

### Dedicated AW candidate

**`AW_V3_NO_SAME_OR_T2`** zeros only the `same_or_speed_gap` weight, applies the original full-field scoring and softmax, then chooses rank two. The original AW V2 base, missing-Speed-rank bonus, rank-2/3 bonus and tie rules are retained. The calculation reproduces the earlier isolated diagnostic's term-removed variant, including T2 identities and probabilities for all 123 November AW books. The published candidate comparison uses the same 120 settled matched AW races as that earlier diagnostic.

October uses 144 matched pre-off archived AW V2 vectors with the AW V3 formula replayed over them. Earlier 2025 and early 2026 use the prior audited **3,028 and 1,947** AW starter fields. Those retain the required frozen numeric inputs and saved base probabilities, so the base score up to a race-wide constant is `ln(base probability)`. They are exact for the saved replay, with the historical inputs and starter-roster caveats described there. These older original-formula replays are not original current-generation T2 selections. The histories stay separate from the original November baseline. [AW sign and removal replay](aw-v3-reversed-speed-adjustment.md) · [AW isolated comparison evidence](aw-v3-isolated-adjustment-evidence.json)

## D. 2025 discovery and fixed 2026 SP replay

The 2026 column is **PREVIOUSLY EXPLORED REPLAY**. AW and Turf reach September, while Hurdle and Chase reach 14 October. There is no comparable full-year 2026 inference. Final SP serves both as input and payout in this section, so any apparent edge requires independent confirmation at actual pre-off offers. Win prices and mean final SP are decimal. A dash for ROI means no stake was placed.

| Scope / family | Policy | Races | Selections / stakes | Wins | Strike | Mean final SP | Market E | A/E | £1 P/L | ROI | Mean / median winning SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 Jan–Sep fit period | B · Market tilt | 9304 | 44 / 44 | 7 | 15.9% | 20.01 | 7.07 | 0.99 | +£61.00 | 138.6% | 15.00 / 7.50 |
| 2025 Jan–Sep fit period | C · Return ranking | 9304 | 43 / 43 | 11 | 25.6% | 4.93 | 12.02 | 0.91 | +£8.67 | 20.2% | 4.70 / 4.50 |
| 2025 Jan–Sep fit period | SP favourite | 9304 | 9304 / 9304 | 3237 | 34.8% | 3.01 | 3024.69 | 1.07 | −£780.69 | -8.4% | 2.64 / 2.50 |
| 2025 Oct–Dec chronological validation | B · Market tilt | 3073 | 8 / 8 | 1 | 12.5% | 17.15 | 1.19 | 0.84 | £0.00 | 0.0% | 8.00 / 8.00 |
| 2025 Oct–Dec chronological validation | C · Return ranking | 3073 | 8 / 8 | 2 | 25.0% | 3.93 | 2.73 | 0.73 | +£0.08 | 1.0% | 4.04 / 4.04 |
| 2025 Oct–Dec chronological validation | SP favourite | 3073 | 3073 / 3073 | 1082 | 35.2% | 2.93 | 1015.87 | 1.06 | −£365.92 | -11.9% | 2.50 / 2.25 |
| 2025 full-year retrospective | B · Market tilt | 12377 | 52 / 52 | 8 | 15.4% | 19.57 | 8.26 | 0.97 | +£61.00 | 117.3% | 14.13 / 7.75 |
| 2025 full-year retrospective | C · Return ranking | 12377 | 51 / 51 | 13 | 25.5% | 4.78 | 14.76 | 0.88 | +£8.75 | 17.2% | 4.60 / 4.50 |
| 2025 full-year retrospective | SP favourite | 12377 | 12377 / 12377 | 4319 | 34.9% | 2.99 | 4040.57 | 1.07 | −£1146.61 | -9.3% | 2.60 / 2.38 |
| 2026 previously explored SP replay | B · Market tilt | 9226 | 31 / 31 | 5 | 16.1% | 23.58 | 5.93 | 0.84 | −£15.57 | -50.2% | 3.09 / 2.50 |
| 2026 previously explored SP replay | C · Return ranking | 9226 | 29 / 29 | 11 | 37.9% | 3.63 | 10.56 | 1.04 | +£4.41 | 15.2% | 3.04 / 2.50 |
| 2026 previously explored SP replay | SP favourite | 9226 | 9226 / 9226 | 3233 | 35.0% | 2.95 | 3043.50 | 1.06 | −£968.69 | -10.5% | 2.56 / 2.38 |

<details>
<summary>2025 chronological validation and previously explored 2026 by family</summary>

| Scope / family | Policy | Races | Selections / stakes | Wins | Strike | Mean final SP | Market E | A/E | £1 P/L | ROI | Mean / median winning SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 Oct–Dec chronological validation | B · Market tilt | 3073 | 8 / 8 | 1 | 12.5% | 17.15 | 1.19 | 0.84 | £0.00 | 0.0% | 8.00 / 8.00 |
| 2025 Oct–Dec chronological validation | C · Return ranking | 3073 | 8 / 8 | 2 | 25.0% | 3.93 | 2.73 | 0.73 | +£0.08 | 1.0% | 4.04 / 4.04 |
| 2025 Oct–Dec chronological validation | SP favourite | 3073 | 3073 / 3073 | 1082 | 35.2% | 2.93 | 1015.87 | 1.06 | −£365.92 | -11.9% | 2.50 / 2.25 |
| TURF | B · Market tilt | 481 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| TURF | C · Return ranking | 481 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| TURF | SP favourite | 481 | 481 / 481 | 141 | 29.3% | 3.27 | 140.39 | 1.00 | −£100.98 | -21.0% | 2.70 / 2.50 |
| AW | B · Market tilt | 1041 | 7 / 7 | 1 | 14.3% | 17.17 | 1.12 | 0.89 | +£1.00 | 14.3% | 8.00 / 8.00 |
| AW | C · Return ranking | 1041 | 7 / 7 | 1 | 14.3% | 3.87 | 2.47 | 0.40 | −£3.25 | -46.4% | 3.75 / 3.75 |
| AW | SP favourite | 1041 | 1041 / 1041 | 352 | 33.8% | 3.00 | 327.92 | 1.07 | −£125.39 | -12.0% | 2.61 / 2.38 |
| HURDLE | B · Market tilt | 976 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| HURDLE | C · Return ranking | 976 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| HURDLE | SP favourite | 976 | 976 / 976 | 392 | 40.2% | 2.69 | 352.21 | 1.11 | −£70.19 | -7.2% | 2.31 / 2.10 |
| CHASE | B · Market tilt | 575 | 1 / 1 | 0 | 0.0% | 17.00 | 0.07 | 0.00 | −£1.00 | -100.0% | — / — |
| CHASE | C · Return ranking | 575 | 1 / 1 | 1 | 100.0% | 4.33 | 0.26 | 3.82 | +£3.33 | 333.3% | 4.33 / 4.33 |
| CHASE | SP favourite | 575 | 575 / 575 | 197 | 34.3% | 2.92 | 195.36 | 1.01 | −£69.35 | -12.1% | 2.57 / 2.38 |

| Scope / family | Policy | Races | Selections / stakes | Wins | Strike | Mean final SP | Market E | A/E | £1 P/L | ROI | Mean / median winning SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026 previously explored SP replay | B · Market tilt | 9226 | 31 / 31 | 5 | 16.1% | 23.58 | 5.93 | 0.84 | −£15.57 | -50.2% | 3.09 / 2.50 |
| 2026 previously explored SP replay | C · Return ranking | 9226 | 29 / 29 | 11 | 37.9% | 3.63 | 10.56 | 1.04 | +£4.41 | 15.2% | 3.04 / 2.50 |
| 2026 previously explored SP replay | SP favourite | 9226 | 9226 / 9226 | 3233 | 35.0% | 2.95 | 3043.50 | 1.06 | −£968.69 | -10.5% | 2.56 / 2.38 |
| TURF | B · Market tilt | 4048 | 15 / 15 | 1 | 6.7% | 24.05 | 2.11 | 0.47 | −£13.17 | -87.8% | 1.83 / 1.83 |
| TURF | C · Return ranking | 4048 | 13 / 13 | 6 | 46.2% | 3.52 | 5.05 | 1.19 | +£3.93 | 30.3% | 2.82 / 2.17 |
| TURF | SP favourite | 4048 | 4048 / 4048 | 1386 | 34.2% | 3.01 | 1311.33 | 1.06 | −£443.64 | -11.0% | 2.60 / 2.50 |
| AW | B · Market tilt | 1990 | 7 / 7 | 2 | 28.6% | 44.05 | 1.56 | 1.29 | £0.00 | 0.0% | 3.50 / 3.50 |
| AW | C · Return ranking | 1990 | 7 / 7 | 3 | 42.9% | 3.39 | 2.72 | 1.10 | +£2.88 | 41.1% | 3.29 / 2.88 |
| AW | SP favourite | 1990 | 1990 / 1990 | 704 | 35.4% | 2.92 | 650.60 | 1.08 | −£177.74 | -8.9% | 2.58 / 2.50 |
| HURDLE | B · Market tilt | 2031 | 6 / 6 | 1 | 16.7% | 7.92 | 1.31 | 0.76 | −£1.50 | -25.0% | 4.50 / 4.50 |
| HURDLE | C · Return ranking | 2031 | 6 / 6 | 1 | 16.7% | 4.54 | 1.63 | 0.61 | −£1.50 | -25.0% | 4.50 / 4.50 |
| HURDLE | SP favourite | 2031 | 2031 / 2031 | 717 | 35.3% | 2.87 | 689.51 | 1.04 | −£296.95 | -14.6% | 2.42 / 2.20 |
| CHASE | B · Market tilt | 1157 | 3 / 3 | 1 | 33.3% | 4.78 | 0.96 | 1.04 | −£0.90 | -30.0% | 2.10 / 2.10 |
| CHASE | C · Return ranking | 1157 | 3 / 3 | 1 | 33.3% | 2.87 | 1.16 | 0.86 | −£0.90 | -30.0% | 2.10 / 2.10 |
| CHASE | SP favourite | 1157 | 1157 / 1157 | 426 | 36.8% | 2.90 | 392.05 | 1.09 | −£50.36 | -4.4% | 2.60 / 2.50 |

</details>

<details>
<summary>Full-year 2025 by family</summary>

| Scope / family | Policy | Races | Selections / stakes | Wins | Strike | Mean final SP | Market E | A/E | £1 P/L | ROI | Mean / median winning SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 full-year retrospective | B · Market tilt | 12377 | 52 / 52 | 8 | 15.4% | 19.57 | 8.26 | 0.97 | +£61.00 | 117.3% | 14.13 / 7.75 |
| 2025 full-year retrospective | C · Return ranking | 12377 | 51 / 51 | 13 | 25.5% | 4.78 | 14.76 | 0.88 | +£8.75 | 17.2% | 4.60 / 4.50 |
| 2025 full-year retrospective | SP favourite | 12377 | 12377 / 12377 | 4319 | 34.9% | 2.99 | 4040.57 | 1.07 | −£1146.61 | -9.3% | 2.60 / 2.38 |
| TURF | B · Market tilt | 4720 | 27 / 27 | 4 | 14.8% | 17.36 | 4.28 | 0.93 | +£25.00 | 92.6% | 13.00 / 10.75 |
| TURF | C · Return ranking | 4720 | 26 / 26 | 8 | 30.8% | 4.96 | 7.44 | 1.07 | +£11.17 | 42.9% | 4.65 / 4.50 |
| TURF | SP favourite | 4720 | 4720 / 4720 | 1529 | 32.4% | 3.10 | 1480.73 | 1.03 | −£575.01 | -12.2% | 2.71 / 2.50 |
| AW | B · Market tilt | 3078 | 20 / 20 | 4 | 20.0% | 25.60 | 2.90 | 1.38 | +£41.00 | 205.0% | 15.25 / 7.75 |
| AW | C · Return ranking | 3078 | 20 / 20 | 4 | 20.0% | 4.53 | 6.04 | 0.66 | −£1.75 | -8.8% | 4.56 / 4.13 |
| AW | SP favourite | 3078 | 3078 / 3078 | 1095 | 35.6% | 3.01 | 980.39 | 1.11 | −£180.86 | -5.9% | 2.65 / 2.50 |
| HURDLE | B · Market tilt | 2891 | 4 / 4 | 0 | 0.0% | 4.94 | 1.01 | 0.00 | −£4.00 | -100.0% | — / — |
| HURDLE | C · Return ranking | 2891 | 4 / 4 | 0 | 0.0% | 4.94 | 1.01 | 0.00 | −£4.00 | -100.0% | — / — |
| HURDLE | SP favourite | 2891 | 2891 / 2891 | 1131 | 39.1% | 2.81 | 1015.50 | 1.11 | −£189.37 | -6.6% | 2.39 / 2.20 |
| CHASE | B · Market tilt | 1688 | 1 / 1 | 0 | 0.0% | 17.00 | 0.07 | 0.00 | −£1.00 | -100.0% | — / — |
| CHASE | C · Return ranking | 1688 | 1 / 1 | 1 | 100.0% | 4.33 | 0.26 | 3.82 | +£3.33 | 333.3% | 4.33 / 4.33 |
| CHASE | SP favourite | 1688 | 1688 / 1688 | 564 | 33.4% | 2.96 | 563.95 | 1.00 | −£201.36 | -11.9% | 2.64 / 2.50 |

</details>

| Scope / family | Policy | Races | Selections / stakes | Wins | Strike | Mean final SP | Market E | A/E | £1 P/L | ROI | Mean / median winning SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026, B bet races | B · Market tilt | 31 | 31 / 31 | 5 | 16.1% | 23.58 | 5.93 | 0.84 | −£15.57 | -50.2% | 3.09 / 2.50 |
| 2026, B bet races | SP favourite | 31 | 31 / 31 | 12 | 38.7% | 3.19 | 12.40 | 0.97 | +£2.41 | 7.8% | 2.78 / 2.38 |
| 2026, C bet races | C · Return ranking | 29 | 29 / 29 | 11 | 37.9% | 3.63 | 10.56 | 1.04 | +£4.41 | 15.2% | 3.04 / 2.50 |
| 2026, C bet races | SP favourite | 29 | 29 / 29 | 11 | 37.9% | 3.18 | 11.72 | 0.94 | +£2.16 | 7.4% | 2.83 / 2.50 |

**B failed to transfer.** Its full-year 2025 profit of £61 included £61 in the fitted period and £0 in chronological validation. It lost £15.57 from 31 stakes in the fixed 2026 replay, and the SP favourite made £2.41 on those same 31 races. Removing the two largest 2025 winning races turned B from +£61 to **−£4**. One 40/1 winner supplied £40 net.

**C is the strongest of the three new policies on the retrospective 2026 headline.** It returned +£4.41 from 29 stakes, versus +£2.16 for the SP favourite on those exact races. Its 95% date-cluster ROI interval covers a loss of about 40% and a gain of about 75%. The two biggest winning races remove £7.50 of net return and leave **−£3.09**. It took a bet on only **0.31%** of replay races. The year-end 2025 validation was **+£0.08** from eight stakes, while the full-year +£8.75 includes the fit period and also becomes negative without its two largest winners.

Every B and C selection in 2025 and early 2026 occurred in a final-SP **underround**, where the sum of the field's raw reciprocals was less than one. The small learned coefficients rarely offset a positive book margin and the 3% buffer. On underrounds, normalization alone can create apparent positive expected return. The audited result fields establish correct SP settlement, with no evidence that all historical prices were simultaneously available to bet. The experiment therefore fails to show that form created a repeatable edge. On the complete pre-off books B and C each produced zero qualifying bets. That failed transfer is reported as observed under the frozen parameters.

The zero November bets were implied by the fitted coefficients and quotes. Let `S = Σ(1/decimal price)` and `t = |β₁| + |β₂| + |β₃|/2 = 0.0457864`. The features bound each runner’s logit shift to `[−t,t]`, so its projected gross return `p × decimal price` is at most `exp(2t)/S`. The 3% buffer is therefore unreachable at `S > 1.0639773`. The lowest of the 332 complete captured books was **1.0749929**, which caps the projected edge at **+1.94%** even before accounting for actual feature values. C shares this eligibility constraint. This is a measured blocker for these fixed policies on the available pre-off books.

## E. November original T2 comparison

The first table preserves the full original-reference denominator. The second includes only complete pre-off books and accounts for all opportunities where each experiment could bet. The third compares the controls on the identical races on which each candidate actually settled a bet. An entry of zero selections means a fully evaluated policy abstained.

| Scope / family | Policy | Races | Selections / stakes | Wins | Strike | Mean final SP | Market E | A/E | £1 P/L | ROI | Mean / median winning SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| November frozen reference | Frozen T2 | 380 | 380 / 380 | 83 | 21.8% | 10.18 | 68.21 | 1.22 | −£16.99 | -4.5% | 4.37 / 3.00 |
| November frozen reference | SP favourite | 380 | 380 / 380 | 133 | 35.0% | 2.86 | 127.65 | 1.04 | −£53.59 | -14.1% | 2.45 / 2.38 |
| TURF | Frozen T2 | 8 | 8 / 8 | 1 | 12.5% | 12.08 | 0.88 | 1.14 | −£5.38 | -67.2% | 2.63 / 2.63 |
| TURF | SP favourite | 8 | 8 / 8 | 3 | 37.5% | 3.58 | 2.08 | 1.44 | +£1.08 | 13.5% | 3.03 / 3.75 |
| AW | Frozen T2 | 121 | 121 / 121 | 28 | 23.1% | 10.14 | 19.33 | 1.45 | +£2.49 | 2.1% | 4.41 / 3.25 |
| AW | SP favourite | 121 | 121 / 121 | 38 | 31.4% | 2.97 | 37.77 | 1.01 | −£23.46 | -19.4% | 2.57 / 2.50 |
| HURDLE | Frozen T2 | 164 | 164 / 164 | 37 | 22.6% | 11.65 | 31.26 | 1.18 | −£16.24 | -9.9% | 3.99 / 2.50 |
| HURDLE | SP favourite | 164 | 164 / 164 | 64 | 39.0% | 2.69 | 59.03 | 1.08 | −£13.77 | -8.4% | 2.35 / 2.25 |
| CHASE | Frozen T2 | 87 | 87 / 87 | 17 | 19.5% | 7.30 | 16.74 | 1.02 | +£2.13 | 2.4% | 5.24 / 3.50 |
| CHASE | SP favourite | 87 | 87 / 87 | 28 | 32.2% | 2.95 | 28.77 | 0.97 | −£17.44 | -20.1% | 2.48 / 2.63 |

| Scope / family | Policy | Races | Selections / stakes | Wins | Strike | Mean final SP | Market E | A/E | £1 P/L | ROI | Mean / median winning SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| November complete-quote opportunity set | Frozen T2 | 332 | 332 / 332 | 74 | 22.3% | 10.20 | 59.51 | 1.24 | −£3.33 | -1.0% | 4.44 / 2.94 |
| November complete-quote opportunity set | SP favourite | 332 | 332 / 332 | 113 | 34.0% | 2.89 | 110.35 | 1.02 | −£52.68 | -15.9% | 2.47 / 2.50 |
| November complete-quote opportunity set | A · T2 refinement | 332 | 59 / 59 | 4 | 6.8% | 26.61 | 3.67 | 1.09 | −£8.50 | -14.4% | 12.63 / 11.25 |
| November complete-quote opportunity set | B · Market tilt | 332 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| November complete-quote opportunity set | C · Return ranking | 332 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |

<details>
<summary>November pre-off opportunities by family</summary>

| Scope / family | Policy | Races | Selections / stakes | Wins | Strike | Mean final SP | Market E | A/E | £1 P/L | ROI | Mean / median winning SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| November complete-quote opportunity set | Frozen T2 | 332 | 332 / 332 | 74 | 22.3% | 10.20 | 59.51 | 1.24 | −£3.33 | -1.0% | 4.44 / 2.94 |
| November complete-quote opportunity set | SP favourite | 332 | 332 / 332 | 113 | 34.0% | 2.89 | 110.35 | 1.02 | −£52.68 | -15.9% | 2.47 / 2.50 |
| November complete-quote opportunity set | A · T2 refinement | 332 | 59 / 59 | 4 | 6.8% | 26.61 | 3.67 | 1.09 | −£8.50 | -14.4% | 12.63 / 11.25 |
| November complete-quote opportunity set | B · Market tilt | 332 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| November complete-quote opportunity set | C · Return ranking | 332 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| TURF | Frozen T2 | 7 | 7 / 7 | 1 | 14.3% | 12.38 | 0.79 | 1.27 | −£4.38 | -62.5% | 2.63 / 2.63 |
| TURF | SP favourite | 7 | 7 / 7 | 2 | 28.6% | 3.90 | 1.42 | 1.41 | +£0.75 | 10.7% | 3.88 / 3.88 |
| TURF | A · T2 refinement | 7 | 1 / 1 | 0 | 0.0% | 34.00 | 0.02 | 0.00 | −£1.00 | -100.0% | — / — |
| TURF | B · Market tilt | 7 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| TURF | C · Return ranking | 7 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| AW | Frozen T2 | 116 | 116 / 116 | 27 | 23.3% | 10.16 | 18.23 | 1.48 | +£6.16 | 5.3% | 4.52 / 3.50 |
| AW | SP favourite | 116 | 116 / 116 | 37 | 31.9% | 2.97 | 36.14 | 1.02 | −£19.79 | -17.1% | 2.60 / 2.50 |
| AW | A · T2 refinement | 116 | 16 / 16 | 0 | 0.0% | 24.78 | 0.86 | 0.00 | −£16.00 | -100.0% | — / — |
| AW | B · Market tilt | 116 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| AW | C · Return ranking | 116 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| HURDLE | Frozen T2 | 136 | 136 / 136 | 31 | 22.8% | 11.80 | 26.34 | 1.18 | −£5.74 | -4.2% | 4.20 / 2.50 |
| HURDLE | SP favourite | 136 | 136 / 136 | 52 | 38.2% | 2.73 | 48.43 | 1.07 | −£12.42 | -9.1% | 2.38 / 2.25 |
| HURDLE | A · T2 refinement | 136 | 25 / 25 | 2 | 8.0% | 35.94 | 1.46 | 1.37 | +£3.00 | 12.0% | 14.00 / 14.00 |
| HURDLE | B · Market tilt | 136 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| HURDLE | C · Return ranking | 136 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| CHASE | Frozen T2 | 73 | 73 / 73 | 15 | 20.5% | 7.06 | 14.15 | 1.06 | +£0.63 | 0.9% | 4.91 / 3.50 |
| CHASE | SP favourite | 73 | 73 / 73 | 22 | 30.1% | 2.95 | 24.37 | 0.90 | −£21.22 | -29.1% | 2.35 / 2.56 |
| CHASE | A · T2 refinement | 73 | 17 / 17 | 2 | 11.8% | 14.18 | 1.33 | 1.51 | +£5.50 | 32.4% | 11.25 / 11.25 |
| CHASE | B · Market tilt | 73 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| CHASE | C · Return ranking | 73 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |

</details>

| Scope / family | Policy | Races | Selections / stakes | Wins | Strike | Mean final SP | Market E | A/E | £1 P/L | ROI | Mean / median winning SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A settled bet races | A · T2 refinement | 59 | 59 / 59 | 4 | 6.8% | 26.61 | 3.67 | 1.09 | −£8.50 | -14.4% | 12.63 / 11.25 |
| A settled bet races | Frozen T2 | 59 | 59 / 59 | 4 | 6.8% | 26.61 | 3.67 | 1.09 | −£8.50 | -14.4% | 12.63 / 11.25 |
| A settled bet races | SP favourite | 59 | 59 / 59 | 21 | 35.6% | 2.80 | 20.70 | 1.01 | −£9.56 | -16.2% | 2.35 / 2.25 |
| B settled bet races | B · Market tilt | 0 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| B settled bet races | Frozen T2 | 0 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| B settled bet races | SP favourite | 0 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| C settled bet races | C · Return ranking | 0 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| C settled bet races | Frozen T2 | 0 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |
| C settled bet races | SP favourite | 0 | 0 / 0 | 0 | — | — | 0.00 | — | — | — | — / — |

A selected **59 of 332** eligible T2s, winning four and returning **−£8.50 (−14.41%)**. The full original T2 policy on the same quote-eligible fields returned **−£3.33 (−1.00%)** from 332 stakes. On the 59 chosen races A and original T2 are the same horse by design. The 273 skipped T2s collectively returned **+£5.17** on final SP. The filter therefore hurt this sample, even though its match-priced subset edged the SP favourite on those 59 races. Its large-winner sensitivity and interval offer no evidence of a sustainable improvement.

### Decision by family

| Family | A with genuine November quotes | B and C in the fixed 2026 SP simulation | Evidence for a selection policy |
| --- | --- | --- | --- |
| Chase | 17 stakes, **+£5.50**. Skipped T2s lost £4.88. Removing A’s largest winner leaves **−£6.50**. | B and C each lost **£0.90** from three stakes, with different choices possible. | The pre-off gain depends on two outsider wins. On selected races A and frozen T2 are identical. |
| Hurdle | 25 stakes, **+£3.00**. Skipped T2s lost £8.74. Removing A’s largest winner leaves **−£15.00**. | B and C each lost **£1.50** from six stakes, after each lost £4.00 in the full 2025 simulation. | A kept Party Vibes and Rose Warrior. Those two winners account for the positive total. |
| All Weather | 16 stakes, **−£16.00**. Skipped T2s made **+£22.16**. | B broke even from seven stakes. C made **+£2.88** from seven after losing £3.25 in chronological 2025 validation. | A discarded profitable T2s. The existing rank-only AW candidate has its own comparison in section F. |
| Turf | One stake, **−£1.00**, on one date across seven complete books. | B lost **£13.17** from 15 stakes. C made **+£3.93** from 13, all based on final SP at decision time. | The captured Turf sample is too small to support a family-specific fit or filter. |

B and C abstained in all four families with genuine November quotes. The lowest raw reciprocal sums were 1.0750 for Chase, 1.0934 for Hurdle, 1.1167 for AW and 1.3019 for Turf. The retrospective sample yielded different B and C selections on 17 of the races where both bet in 2026, so the return penalty materially changed which runner was selected despite the shared probability model.

**Long-priced runners were not screened out.** A took 49 at 8/1 or longer and found all four of its winners in that group. Party Vibes retained T2 and was eligible at captured decimal **11.00**, with blended probability **10.42%** and projected edge **+14.62%**. Its settlement was **8/1**, producing **+£8**. A's 22 bets at 20/1 or longer all lost. In the broad 2026 SP simulation B lost all 19 bets at 8/1 or longer. C's utility ranking produced zero 8/1+ bets in both broad years despite no explicit ceiling. Those are observed selection consequences and do not establish that avoiding outsiders improves a deployable policy. [Party Vibes worked example](tissue-long-priced-selection-explanations.md)

## F. Revised AW T2, equal-race comparison

| Scope / family | Policy | Races | Selections / stakes | Wins | Strike | Mean final SP | Market E | A/E | £1 P/L | ROI | Mean / median winning SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| November AW exact overlap | Frozen T2 | 120 | 120 / 120 | 27 | 22.5% | 10.21 | 18.67 | 1.45 | +£2.16 | 1.8% | 4.52 / 3.50 |
| November AW exact overlap | AW without same-OR | 120 | 120 / 120 | 28 | 23.3% | 9.09 | 19.19 | 1.46 | +£13.54 | 11.3% | 4.77 / 3.50 |
| November AW exact overlap | SP favourite | 120 | 120 / 120 | 37 | 30.8% | 2.99 | 37.10 | 1.00 | −£23.79 | -19.8% | 2.60 / 2.50 |
| October AW development-era replay | Original AW formula | 144 | 144 / 144 | 28 | 19.4% | 9.03 | 23.51 | 1.19 | −£25.72 | -17.9% | 4.22 / 3.50 |
| October AW development-era replay | AW without same-OR | 144 | 144 / 144 | 30 | 20.8% | 7.75 | 24.66 | 1.22 | −£24.01 | -16.7% | 4.00 / 3.50 |
| October AW development-era replay | SP favourite | 144 | 144 / 144 | 47 | 32.6% | 3.01 | 44.87 | 1.05 | −£20.54 | -14.3% | 2.63 / 2.63 |
| 2025 AW base-fit-era replay | Original AW formula | 3028 | 3028 / 3028 | 514 | 17.0% | 9.46 | 513.48 | 1.00 | −£642.32 | -21.2% | 4.64 / 3.75 |
| 2025 AW base-fit-era replay | AW without same-OR | 3028 | 3028 / 3028 | 531 | 17.5% | 8.53 | 532.91 | 1.00 | −£758.41 | -25.0% | 4.27 / 3.50 |
| 2025 AW base-fit-era replay | SP favourite | 3028 | 3028 / 3028 | 1078 | 35.6% | 3.00 | 966.45 | 1.12 | −£170.06 | -5.6% | 2.65 / 2.50 |
| Early 2026 AW archive replay | Original AW formula | 1947 | 1947 / 1947 | 325 | 16.7% | 9.21 | 338.81 | 0.96 | −£392.16 | -20.1% | 4.78 / 3.50 |
| Early 2026 AW archive replay | AW without same-OR | 1947 | 1947 / 1947 | 318 | 16.3% | 8.48 | 346.35 | 0.92 | −£532.96 | -27.4% | 4.45 / 3.50 |
| Early 2026 AW archive replay | SP favourite | 1947 | 1947 / 1947 | 686 | 35.2% | 2.92 | 636.67 | 1.08 | −£180.60 | -9.3% | 2.57 / 2.50 |

On the exact November AW overlap, removing the term gained one T2 winner and **£11.38** of return. It preserved both 8/1+ winner hits, with 43 outsider selections versus 47. The removed-term T2 profit becomes **−£2.46** after removing its largest winning race and **−£11.46** after removing the largest two. The earlier October matched replay improved T2 P/L by **£1.71**, while the wider 2025 and early 2026 cohorts deteriorated by **£116.09 and £140.80**. Full-field probability scores improved in all four periods. That better probability fit has not yielded a stable improvement in level-stakes returns.

## G. Robustness, price distribution and monthly returns

The date-cluster 95% intervals resample whole calendar race dates, including dates with no bet. They describe sampling uncertainty conditional on the fixed research design and these data. A dash indicates no staked sample or too few winning races for the removal requested. The largest-winner checks remove the whole race with the highest actual winning return. With one bet per race, this recalculates both P/L and stake count. Price-band cells give **stakes / winning selections / £1 P/L**, and the rightmost column reports the share of gross winning returns from 8/1 and longer.

| Period | Policy | Dates / dates with stakes | No bet | P/L per available race | 95% ROI interval | Largest winner date and decimal SP | Skip largest P/L / ROI | Skip two largest P/L / ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| November frozen reference | Frozen T2 | 16 / 16 | 0.00% | −£0.04 | -29.9% to 19.3% | 2026-11-14 @ 19.00 | −£34.99 / -9.2% | −£50.99 / -13.5% |
| November complete-quote opportunity set | Frozen T2 | 15 / 15 | 0.00% | −£0.01 | -31.5% to 24.5% | 2026-11-14 @ 19.00 | −£21.33 / -6.4% | −£37.33 / -11.3% |
| November complete-quote opportunity set | A · T2 refinement | 15 / 14 | 82.23% | −£0.03 | -85.2% to 99.0% | 2026-11-14 @ 19.00 | −£26.50 / -45.7% | −£38.50 / -67.5% |
| November complete-quote opportunity set | B · Market tilt | 15 / 0 | 100.00% | £0.00 | — | — | — | — |
| November complete-quote opportunity set | C · Return ranking | 15 / 0 | 100.00% | £0.00 | — | — | — | — |
| 2025 Jan–Sep fit period | B · Market tilt | 273 / 41 | 99.53% | +£0.01 | -53.3% to 393.0% | 2025-09-11 @ 41.00 | +£21.00 / 48.8% | −£4.00 / -9.5% |
| 2025 Jan–Sep fit period | C · Return ranking | 273 / 40 | 99.54% | +£0.00 | -50.5% to 92.4% | 2025-02-19 @ 7.50 | +£2.17 / 5.2% | −£3.83 / -9.3% |
| 2025 Oct–Dec chronological validation | B · Market tilt | 89 / 8 | 99.74% | £0.00 | -100.0% to 233.3% | 2025-12-27 @ 8.00 | −£7.00 / -100.0% | — |
| 2025 Oct–Dec chronological validation | C · Return ranking | 89 / 8 | 99.74% | +£0.00 | -100.0% to 148.3% | 2025-10-12 @ 4.33 | −£3.25 / -46.4% | −£6.00 / -100.0% |
| 2025 full-year retrospective | B · Market tilt | 362 / 49 | 99.58% | +£0.00 | -51.2% to 342.2% | 2025-09-11 @ 41.00 | +£21.00 / 41.2% | −£4.00 / -8.0% |
| 2025 full-year retrospective | C · Return ranking | 362 / 48 | 99.59% | +£0.00 | -42.3% to 81.7% | 2025-02-19 @ 7.50 | +£2.25 / 4.5% | −£3.75 / -7.7% |
| 2026 previously explored SP replay | B · Market tilt | 285 / 27 | 99.66% | −£0.00 | -89.8% to -1.9% | 2026-02-20 @ 4.50 | −£19.07 / -63.6% | −£22.57 / -77.8% |
| 2026 previously explored SP replay | C · Return ranking | 285 / 26 | 99.69% | +£0.00 | -40.4% to 74.7% | 2026-07-20 @ 5.00 | +£0.41 / 1.5% | −£3.09 / -11.5% |
| November AW exact overlap | Frozen T2 | 10 / 10 | 0.00% | +£0.02 | -42.0% to 54.2% | 2026-11-07 @ 17.00 | −£13.84 / -11.6% | −£22.84 / -19.4% |
| November AW exact overlap | AW without same-OR | 10 / 10 | 0.00% | +£0.11 | -33.1% to 60.5% | 2026-11-07 @ 17.00 | −£2.46 / -2.1% | −£11.46 / -9.7% |
| October AW development-era replay | Original AW formula | 14 / 14 | 0.00% | −£0.18 | -49.7% to 14.2% | 2026-10-23 @ 13.00 | −£37.72 / -26.4% | −£46.72 / -32.9% |
| October AW development-era replay | AW without same-OR | 14 / 14 | 0.00% | −£0.17 | -41.0% to 11.0% | 2026-10-21 @ 10.00 | −£33.01 / -23.1% | −£41.01 / -28.9% |
| 2025 AW base-fit-era replay | Original AW formula | 259 / 259 | 0.00% | −£0.21 | -29.4% to -12.5% | 2025-12-10 @ 51.00 | −£692.32 / -22.9% | −£725.32 / -24.0% |
| 2025 AW base-fit-era replay | AW without same-OR | 259 / 259 | 0.00% | −£0.25 | -31.7% to -18.3% | 2025-10-30 @ 23.00 | −£780.41 / -25.8% | −£800.41 / -26.5% |
| Early 2026 AW archive replay | Original AW formula | 178 / 178 | 0.00% | −£0.20 | -30.2% to -9.7% | 2026-01-28 @ 41.00 | −£432.16 / -22.2% | −£457.16 / -23.5% |
| Early 2026 AW archive replay | AW without same-OR | 178 / 178 | 0.00% | −£0.27 | -35.6% to -18.8% | 2026-08-10 @ 17.00 | −£548.96 / -28.2% | −£562.96 / -28.9% |

| Period | Policy | <8/1 | 8/1–<12/1 | 12/1–<20/1 | 20/1–<33/1 | 33/1+ | Share of winner gross at 8/1+ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| November frozen reference | Frozen T2 | 257 / 74 / −£10.49 | 50 / 5 / +£2.50 | 37 / 4 / +£27.00 | 20 / 0 / −£20.00 | 16 / 0 / −£16.00 | 32.1% |
| November complete-quote opportunity set | Frozen T2 | 222 / 66 / +£2.17 | 46 / 4 / −£5.50 | 32 / 4 / +£32.00 | 18 / 0 / −£18.00 | 14 / 0 / −£14.00 | 31.8% |
| November complete-quote opportunity set | A · T2 refinement | 10 / 0 / −£10.00 | 16 / 2 / +£2.50 | 11 / 2 / +£21.00 | 10 / 0 / −£10.00 | 12 / 0 / −£12.00 | 100.0% |
| November complete-quote opportunity set | B · Market tilt | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — | — |
| November complete-quote opportunity set | C · Return ranking | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — | — |
| 2025 full-year retrospective | B · Market tilt | 26 / 5 / +£5.00 | 4 / 0 / −£4.00 | 10 / 1 / +£5.00 | 5 / 1 / +£21.00 | 7 / 1 / +£34.00 | 72.6% |
| 2025 full-year retrospective | C · Return ranking | 51 / 13 / +£8.75 | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — | 0.0% |
| 2026 previously explored SP replay | B · Market tilt | 12 / 5 / +£3.43 | 4 / 0 / −£4.00 | 5 / 0 / −£5.00 | 4 / 0 / −£4.00 | 6 / 0 / −£6.00 | 0.0% |
| 2026 previously explored SP replay | C · Return ranking | 29 / 11 / +£4.41 | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — | 0.0% |
| November AW exact overlap | Frozen T2 | 73 / 25 / +£22.16 | 19 / 1 / −£9.00 | 17 / 1 / £0.00 | 5 / 0 / −£5.00 | 6 / 0 / −£6.00 | 22.1% |
| November AW exact overlap | AW without same-OR | 77 / 26 / +£29.54 | 19 / 1 / −£9.00 | 16 / 1 / +£1.00 | 4 / 0 / −£4.00 | 4 / 0 / −£4.00 | 20.2% |
| October AW development-era replay | Original AW formula | 97 / 25 / −£10.72 | 19 / 2 / £0.00 | 17 / 1 / −£4.00 | 6 / 0 / −£6.00 | 5 / 0 / −£5.00 | 27.1% |
| October AW development-era replay | AW without same-OR | 106 / 28 / −£5.01 | 18 / 2 / +£1.00 | 14 / 0 / −£14.00 | 3 / 0 / −£3.00 | 3 / 0 / −£3.00 | 15.8% |
| 2025 AW base-fit-era replay | Original AW formula | 2099 / 471 / −£320.82 | 384 / 25 / −£129.50 | 291 / 13 / −£88.00 | 152 / 3 / −£87.00 | 102 / 2 / −£17.00 | 25.5% |
| 2025 AW base-fit-era replay | AW without same-OR | 2185 / 497 / −£353.91 | 385 / 20 / −£178.50 | 258 / 10 / −£112.00 | 133 / 4 / −£47.00 | 67 / 0 / −£67.00 | 19.3% |
| Early 2026 AW archive replay | Original AW formula | 1379 / 290 / −£288.16 | 230 / 18 / −£44.00 | 185 / 15 / +£26.00 | 79 / 1 / −£53.00 | 74 / 1 / −£33.00 | 29.8% |
| Early 2026 AW archive replay | AW without same-OR | 1437 / 291 / −£333.96 | 233 / 18 / −£47.00 | 161 / 9 / −£36.00 | 61 / 0 / −£61.00 | 55 / 0 / −£55.00 | 22.0% |

Monthly cells give **stakes / £1 P/L / ROI**. The machine evaluation also gives monthly and yearly results, price bands, winner-removal results and intervals by family and combined. Realised cash totals from unlike betting volumes are not an indication of superiority.

<details>
<summary>2025 full-year retrospective · monthly level stakes</summary>

| Month | B · Market tilt | C · Return ranking | SP favourite |
| --- | --- | --- | --- |
| 2025-01 | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% | 776 / +£13.21 / 1.7% |
| 2025-02 | 2 / +£10.00 / 500.0% | 2 / +£10.00 / 500.0% | 775 / −£43.68 / -5.6% |
| 2025-03 | 3 / −£3.00 / -100.0% | 3 / −£3.00 / -100.0% | 870 / −£29.98 / -3.4% |
| 2025-04 | 2 / −£2.00 / -100.0% | 2 / −£2.00 / -100.0% | 1067 / −£128.54 / -12.0% |
| 2025-05 | 6 / +£9.00 / 150.0% | 5 / −£1.17 / -23.3% | 1288 / −£204.98 / -15.9% |
| 2025-06 | 7 / −£7.00 / -100.0% | 7 / −£4.00 / -57.1% | 1122 / −£61.53 / -5.5% |
| 2025-07 | 5 / +£27.50 / 550.0% | 5 / +£5.83 / 116.7% | 1180 / −£156.80 / -13.3% |
| 2025-08 | 9 / −£4.50 / -50.0% | 9 / +£13.00 / 144.4% | 1133 / −£61.14 / -5.4% |
| 2025-09 | 9 / +£32.00 / 355.6% | 9 / −£9.00 / -100.0% | 1093 / −£107.25 / -9.8% |
| 2025-10 | 2 / −£2.00 / -100.0% | 2 / +£6.08 / 304.2% | 1220 / −£170.61 / -14.0% |
| 2025-11 | 2 / −£2.00 / -100.0% | 2 / −£2.00 / -100.0% | 957 / −£93.70 / -9.8% |
| 2025-12 | 4 / +£4.00 / 100.0% | 4 / −£4.00 / -100.0% | 896 / −£101.61 / -11.3% |

</details>

<details>
<summary>2026 previously explored SP replay · monthly level stakes</summary>

| Month | B · Market tilt | C · Return ranking | SP favourite |
| --- | --- | --- | --- |
| 2026-01 | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% | 800 / −£99.69 / -12.5% |
| 2026-02 | 4 / +£0.50 / 12.5% | 4 / +£3.38 / 84.4% | 783 / −£57.23 / -7.3% |
| 2026-03 | 0 / — / — | 0 / — / — | 863 / −£41.59 / -4.8% |
| 2026-04 | 2 / +£0.50 / 25.0% | 2 / +£0.50 / 25.0% | 1054 / −£114.71 / -10.9% |
| 2026-05 | 6 / +£0.60 / 10.0% | 5 / +£3.70 / 74.0% | 1273 / −£161.12 / -12.7% |
| 2026-06 | 6 / −£6.00 / -100.0% | 6 / −£0.25 / -4.2% | 1121 / −£130.34 / -11.6% |
| 2026-07 | 3 / −£3.00 / -100.0% | 3 / +£4.25 / 141.7% | 1210 / −£85.18 / -7.0% |
| 2026-08 | 4 / −£2.17 / -54.2% | 4 / −£2.17 / -54.2% | 1098 / −£148.70 / -13.5% |
| 2026-09 | 4 / −£4.00 / -100.0% | 3 / −£3.00 / -100.0% | 822 / −£139.60 / -17.0% |
| 2026-10 | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% | 202 / +£9.46 / 4.7% |

</details>

<details>
<summary>November frozen reference · monthly level stakes</summary>

| Month | Frozen T2 | SP favourite |
| --- | --- | --- |
| 2026-11 | 380 / −£16.99 / -4.5% | 380 / −£53.59 / -14.1% |

</details>

<details>
<summary>November complete-quote opportunity set · monthly level stakes</summary>

| Month | Frozen T2 | A · T2 refinement | B · Market tilt | C · Return ranking | SP favourite |
| --- | --- | --- | --- | --- | --- |
| 2026-11 | 332 / −£3.33 / -1.0% | 59 / −£8.50 / -14.4% | 0 / — / — | 0 / — / — | 332 / −£52.68 / -15.9% |

</details>

<details>
<summary>2025 AW base-fit-era replay · monthly level stakes</summary>

| Month | Original AW formula | AW without same-OR | SP favourite |
| --- | --- | --- | --- |
| 2025-01 | 397 / −£121.36 / -30.6% | 397 / −£57.34 / -14.4% | 397 / −£15.85 / -4.0% |
| 2025-02 | 316 / −£42.09 / -13.3% | 316 / −£65.90 / -20.9% | 316 / +£19.86 / 6.3% |
| 2025-03 | 337 / −£62.91 / -18.7% | 337 / −£92.53 / -27.5% | 337 / +£9.51 / 2.8% |
| 2025-04 | 220 / −£78.91 / -35.9% | 220 / −£49.08 / -22.3% | 220 / −£32.18 / -14.6% |
| 2025-05 | 120 / +£11.44 / 9.5% | 120 / −£2.05 / -1.7% | 120 / −£10.86 / -9.1% |
| 2025-06 | 123 / −£13.24 / -10.8% | 123 / −£17.61 / -14.3% | 123 / +£33.01 / 26.8% |
| 2025-07 | 63 / −£14.98 / -23.8% | 63 / −£19.98 / -31.7% | 63 / −£8.15 / -12.9% |
| 2025-08 | 170 / +£5.64 / 3.3% | 170 / −£23.27 / -13.7% | 170 / −£26.70 / -15.7% |
| 2025-09 | 271 / −£99.71 / -36.8% | 271 / −£92.13 / -34.0% | 271 / −£20.68 / -7.6% |
| 2025-10 | 339 / −£93.61 / -27.6% | 339 / −£103.78 / -30.6% | 339 / −£49.54 / -14.6% |
| 2025-11 | 320 / −£92.49 / -28.9% | 320 / −£99.42 / -31.1% | 320 / −£66.06 / -20.6% |
| 2025-12 | 352 / −£40.10 / -11.4% | 352 / −£135.31 / -38.4% | 352 / −£2.43 / -0.7% |

</details>

<details>
<summary>Early 2026 AW archive replay · monthly level stakes</summary>

| Month | Original AW formula | AW without same-OR | SP favourite |
| --- | --- | --- | --- |
| 2026-01 | 400 / −£102.80 / -25.7% | 400 / −£173.44 / -43.4% | 400 / −£37.42 / -9.4% |
| 2026-02 | 322 / −£55.91 / -17.4% | 322 / −£82.98 / -25.8% | 322 / −£27.87 / -8.7% |
| 2026-03 | 342 / −£62.29 / -18.2% | 342 / −£77.01 / -22.5% | 342 / −£23.51 / -6.9% |
| 2026-04 | 242 / −£57.30 / -23.7% | 242 / −£88.56 / -36.6% | 242 / −£22.16 / -9.2% |
| 2026-05 | 103 / −£33.32 / -32.3% | 103 / −£35.17 / -34.1% | 103 / +£15.84 / 15.4% |
| 2026-06 | 87 / −£34.74 / -39.9% | 87 / −£4.74 / -5.4% | 87 / −£32.69 / -37.6% |
| 2026-07 | 119 / −£11.18 / -9.4% | 119 / −£1.93 / -1.6% | 119 / −£26.34 / -22.1% |
| 2026-08 | 160 / +£9.64 / 6.0% | 160 / −£17.99 / -11.2% | 160 / −£25.76 / -16.1% |
| 2026-09 | 172 / −£44.26 / -25.7% | 172 / −£51.13 / -29.7% | 172 / −£0.68 / -0.4% |

</details>

<details>
<summary>October AW development-era replay · monthly level stakes</summary>

| Month | Original AW formula | AW without same-OR | SP favourite |
| --- | --- | --- | --- |
| 2026-10 | 110 / +£0.68 / 0.6% | 110 / −£8.20 / -7.5% | 110 / −£13.08 / -11.9% |
| 2026-11 | 34 / −£26.40 / -77.6% | 34 / −£15.82 / -46.5% | 34 / −£7.46 / -21.9% |

</details>

<details>
<summary>November AW exact overlap · monthly level stakes</summary>

| Month | Frozen T2 | AW without same-OR | SP favourite |
| --- | --- | --- | --- |
| 2026-11 | 120 / +£2.16 / 1.8% | 120 / +£13.54 / 11.3% | 120 / −£23.79 / -19.8% |

</details>

## H. Probability quality and prior research

Probabilities are compared on the same eligible fields, conditioned on actual starters for score evaluation. The SP row is the normalized final-SP field. C shares B's probabilities because its change is the selection decision. Better forecast fit can leave every offered return below break-even. In November the pre-off market on its own slightly beat the B forecast on both full-field scores, and the latter produced no qualifying offers.

| Scope | Probability source | Fields | Log loss | Brier |
| --- | --- | --- | --- | --- |
| 2025 Oct–Dec chronological validation | Final SP book | 3073 | 1.72814 | 0.75758 |
| 2025 Oct–Dec chronological validation | B · Market tilt | 3073 | 1.72806 | 0.75749 |
| 2026 previously explored SP replay | Final SP book | 9226 | 1.73702 | 0.76376 |
| 2026 previously explored SP replay | B · Market tilt | 9226 | 1.73706 | 0.76373 |
| November complete-quote opportunity set | Final SP book | 332 | 1.76672 | 0.76577 |
| November complete-quote opportunity set | Pre-off market | 332 | 1.81158 | 0.77717 |
| November complete-quote opportunity set | Frozen T2 | 332 | 2.03660 | 0.84034 |
| November complete-quote opportunity set | A · T2 refinement | 332 | 1.81834 | 0.77975 |
| November complete-quote opportunity set | B · Market tilt | 332 | 1.81171 | 0.77717 |
| November AW exact overlap | Final SP book | 120 | 1.91236 | 0.79053 |
| November AW exact overlap | Frozen T2 | 120 | 2.21133 | 0.86743 |
| November AW exact overlap | AW without same-OR | 120 | 2.20363 | 0.86498 |
| 2025 AW base-fit-era replay | Final SP book | 3028 | 1.75912 | 0.76793 |
| 2025 AW base-fit-era replay | Original AW formula | 3028 | 2.03640 | 0.84478 |
| 2025 AW base-fit-era replay | AW without same-OR | 3028 | 2.01990 | 0.84098 |
| October AW development-era replay | Final SP book | 144 | 1.78211 | 0.78102 |
| October AW development-era replay | Original AW formula | 144 | 2.15318 | 0.86497 |
| October AW development-era replay | AW without same-OR | 144 | 2.14161 | 0.86095 |
| Early 2026 AW archive replay | Final SP book | 1947 | 1.74701 | 0.76776 |
| Early 2026 AW archive replay | Original AW formula | 1947 | 2.01717 | 0.84206 |
| Early 2026 AW archive replay | AW without same-OR | 1947 | 1.97863 | 0.83120 |

The earlier Tissue studies warn against winning-rank optimisation, market-disagreement thresholds and adjustment changes based on small cohorts. The prior market study's sole profitable 2025 rule, Chase Speed top three plus a 61–120 day layoff, lost **38.99%** in the unchanged 2026 replay. Saved Research Filters include superficially strong returns, but some reversed after canonical non-finisher handling, and the positive Turf rule turned negative without its two largest winners in both years. The present fit excludes participant rates and past rule configurations. It reuses verified historical evidence to test bounded form and return-ranking hypotheses rather than reopening that search. [Earlier market research](retrospective-market-beating-models-2026.md) · [Research Filter transfer](research-filter-cross-year-2026-11-18.md) · [Tissue profitability review](tissue-profitability-decision-review-2026-11-12.md)

## I. Recommendation

Use final-SP £1 return as the primary research decision measure, with a common opportunity set, same-bet-race controls, date-cluster intervals and removal of the two largest winning races. Evaluate any genuine selection from a recorded pre-off offer, with coverage of no-bet decisions as well as bets. Treat apparent overlays generated by an underround as price-evidence questions until book completeness, timing and availability are established. Track price and history quality rather than excluding longer prices.

Keep the existing Today’s Racing selection policy. The Chase and Hurdle results for A depend on too few winners to justify applying it as a filter. B and C could not cross their eligibility threshold in any captured November field. C is the strongest retrospective return result among the new policies, but its SP timing and winner concentration rule out promotion. The existing AW revision remains separately reviewable and supplies no evidence for a multi-family replacement.

## J. Reproduction and validation

The Bun research driver verifies source SHA-256 pins and the frozen reference, uses exclusive creation for the immutable outputs, and splits fitting and replay into separate invocations. The evaluation persists race IDs and actual decisions, with a null for an abstention, all summary populations and the relevant source hashes. Date, course and original selection identities remain traceable even where there was no experiment bet. Earlier research exports and audited terminal snapshots were existing local inputs. Their exact paths and hashes appear in the machine files. Reproduction requires those archived bytes, and it does not require a database write, collector or historical backfill. [Research driver](../scripts/profitability-first-research.ts) · [Frozen baseline](tissue-t2-profit-baseline-v1.json) · [Model definitions](profitability-first-model-definitions-v1.json) · [Evaluation and race-level decisions](profitability-first-model-evaluation-v1.json)
The unchanged evaluation reproduced byte-for-byte with content digest `a50f54f1ede38d4eab9f492d4eeb0d14cc8baf57404d6ea5b8635017790273cf`. Validation checked the three linked artifact digests, 39 applicable input-file pins, row uniqueness and source linkage. The early-2026 export contains an ancillary November generation section with an older ledger hash. The replay reads only its historical race records. The current November section is read separately from the verified baseline ledger.

The completed local-model delivery passed **51 targeted tests**, with the existing optional PostgreSQL test skipped. Focused TypeScript and lint passed. Repository-wide TypeScript and lint matched the existing failures. TypeScript reported errors in backup scripts, and full lint reported 79 errors and five warnings in existing files.

The refresh-free replay can be repeated from the workspace with the exact pinned historical inputs.

```sh
bun scripts/profitability-first-research.ts freeze \
  /private/tmp/tissue-rank-diag-terminal-v1.json \
  /private/tmp/racing-audit.1mgsVE/population.ndjson \
  /private/tmp/retrospective-2025.json

bun scripts/profitability-first-research.ts evaluate \
  /private/tmp/tissue-rank-diag-terminal-v1.json \
  /private/tmp/racing-audit.1mgsVE/population.ndjson \
  /private/tmp/retrospective-2025.json \
  /private/tmp/retrospective-2026-reviewed.json \
  /private/tmp/aw-reversal-data.json \
  /private/tmp/aw-reversal-historical-data.json
```

## K. Local models and Today’s Racing handoff

[A, B and C use one local prediction function](../src/lib/racing/profitability-first-model.ts) that reads the checksum-verified V1 definitions and calls the same scoring code as the evaluation. It accepts the frozen family model and a whole `GenerationRace` capture. Each decision contains the policy ID and either a runner ID, original Tissue rank, captured price, estimated probability and edge, or a no-selection reason. C also returns its fixed-fraction utility. An incomplete market, mismatched model, unavailable capture, closed race or changed field can produce an abstention distinct from insufficient edge. Model A also needs a unique original Rank 2. No parameters were changed after reading the results.

Run locally from the repository root with Bun:

```sh
bun scripts/preview-profitability-first.ts --race-id c2508a16-81c2-4cad-ba0d-d5a990b09262
bun scripts/preview-profitability-first.ts --date 2026-11-14
bun test scripts/profitability-first-research.test.ts src/lib/racing/profitability-first-model.test.ts
```

The first command selects **Rose Warrior** for A at captured decimal **19.00** with estimated probability **8.20%**, and returns insufficient edge for B and C. Rose Warrior won at **18/1** final SP. The CLI reads the existing ledger, or a snapshot supplied with `--ledger`, and prints its decisions. The [real race fixtures](../scripts/fixtures/profitability-first-v1.json) cover pre-off selection and abstention, all four families, and distinct choices by B and C on separately labelled SP-only books. The predictor reproduced A, B and C decisions on all 332 November quote books, including every abstention. The original research replay also regenerated the frozen byte digests from the pinned 2025, 2026 and November inputs. [Replay CLI](../scripts/preview-profitability-first.ts) · [Tests](../src/lib/racing/profitability-first-model.test.ts)

If a future review approves an integration, the read-only prediction function can be called on the server after the [Today’s Racing generation ledger join](../src/app/racing/today/page.tsx#L159). Reuse the latest whole capture available as of the request, scoped to the same race and racing date. Pass the original family model and the live card’s race ID, off time, clock, active runner IDs and closed-race flag. Use the existing [pre-race stage and result checks](../src/lib/racing/current-price-overlay.ts#L22) when setting that flag. Supply the capture’s own bookmaker quotes and price set. After a withdrawal, use a fresh validated whole capture or show no selection. A future display can identify research outputs by policy ID, definition hash and capture identity alongside the original T2. Today’s Racing, its active selections and its collection processes received no integration changes.

## L. Family-by-month results and abstentions

Each monthly policy cell shows **settled stakes / £1 P/L / ROI**. The race count is the common eligible monthly denominator. B and C use retrospective SP in the two broad periods. A has no auditable original-model inputs and captured prices in those periods. Baseline T2 for those years is unavailable for the same exact original-generation comparison. November uses the original frozen T2 and genuine captured prices for A, B and C. Exact monthly and yearly summaries, per-race selections, win credits, market probabilities, final prices and no-selection decisions are in the [evaluation artifact](profitability-first-model-evaluation-v1.json).

<details>
<summary>CHASE · monthly returns</summary>

| Retrospective month | Races | SP favourite | B | C |
| --- | --- | --- | --- | --- |
| 2025-01 | 142 | 142 / +£13.34 / 9.4% | 0 / — / — | 0 / — / — |
| 2025-02 | 186 | 186 / −£21.01 / -11.3% | 0 / — / — | 0 / — / — |
| 2025-03 | 191 | 191 / −£30.28 / -15.9% | 0 / — / — | 0 / — / — |
| 2025-04 | 159 | 159 / −£32.35 / -20.3% | 0 / — / — | 0 / — / — |
| 2025-05 | 152 | 152 / −£11.79 / -7.8% | 0 / — / — | 0 / — / — |
| 2025-06 | 82 | 82 / −£17.58 / -21.4% | 0 / — / — | 0 / — / — |
| 2025-07 | 79 | 79 / −£12.10 / -15.3% | 0 / — / — | 0 / — / — |
| 2025-08 | 62 | 62 / −£5.05 / -8.1% | 0 / — / — | 0 / — / — |
| 2025-09 | 60 | 60 / −£15.19 / -25.3% | 0 / — / — | 0 / — / — |
| 2025-10 | 153 | 153 / +£2.84 / 1.9% | 1 / −£1.00 / -100.0% | 1 / +£3.33 / 333.3% |
| 2025-11 | 220 | 220 / −£17.56 / -8.0% | 0 / — / — | 0 / — / — |
| 2025-12 | 202 | 202 / −£54.63 / -27.0% | 0 / — / — | 0 / — / — |
| 2026-01 | 152 | 152 / −£41.52 / -27.3% | 0 / — / — | 0 / — / — |
| 2026-02 | 173 | 173 / −£14.58 / -8.4% | 0 / — / — | 0 / — / — |
| 2026-03 | 184 | 184 / +£14.66 / 8.0% | 0 / — / — | 0 / — / — |
| 2026-04 | 149 | 149 / −£7.16 / -4.8% | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% |
| 2026-05 | 149 | 149 / −£4.84 / -3.2% | 1 / +£1.10 / 110.0% | 1 / +£1.10 / 110.0% |
| 2026-06 | 80 | 80 / −£11.15 / -13.9% | 0 / — / — | 0 / — / — |
| 2026-07 | 69 | 69 / +£13.22 / 19.2% | 0 / — / — | 0 / — / — |
| 2026-08 | 60 | 60 / +£19.21 / 32.0% | 0 / — / — | 0 / — / — |
| 2026-09 | 74 | 74 / −£7.26 / -9.8% | 0 / — / — | 0 / — / — |
| 2026-10 | 67 | 67 / −£10.95 / -16.3% | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% |

| Captured-price month | Races | Original T2 | SP favourite | A | B | C |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11 | 73 | 73 / +£0.63 / 0.9% | 73 / −£21.22 / -29.1% | 17 / +£5.50 / 32.4% | 0 / — / — | 0 / — / — |

</details>

<details>
<summary>HURDLE · monthly returns</summary>

| Retrospective month | Races | SP favourite | B | C |
| --- | --- | --- | --- | --- |
| 2025-01 | 234 | 234 / +£16.99 / 7.3% | 0 / — / — | 0 / — / — |
| 2025-02 | 272 | 272 / −£36.29 / -13.3% | 0 / — / — | 0 / — / — |
| 2025-03 | 300 | 300 / −£21.80 / -7.3% | 0 / — / — | 0 / — / — |
| 2025-04 | 285 | 285 / −£87.21 / -30.6% | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% |
| 2025-05 | 253 | 253 / −£33.13 / -13.1% | 0 / — / — | 0 / — / — |
| 2025-06 | 148 | 148 / −£1.75 / -1.2% | 2 / −£2.00 / -100.0% | 2 / −£2.00 / -100.0% |
| 2025-07 | 166 | 166 / +£11.70 / 7.0% | 0 / — / — | 0 / — / — |
| 2025-08 | 126 | 126 / +£17.56 / 13.9% | 0 / — / — | 0 / — / — |
| 2025-09 | 131 | 131 / +£14.77 / 11.3% | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% |
| 2025-10 | 274 | 274 / −£24.18 / -8.8% | 0 / — / — | 0 / — / — |
| 2025-11 | 371 | 371 / −£4.64 / -1.3% | 0 / — / — | 0 / — / — |
| 2025-12 | 331 | 331 / −£41.37 / -12.5% | 0 / — / — | 0 / — / — |
| 2026-01 | 241 | 241 / −£17.37 / -7.2% | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% |
| 2026-02 | 279 | 279 / −£23.89 / -8.6% | 1 / +£3.50 / 350.0% | 1 / +£3.50 / 350.0% |
| 2026-03 | 286 | 286 / −£38.05 / -13.3% | 0 / — / — | 0 / — / — |
| 2026-04 | 261 | 261 / −£31.71 / -12.1% | 0 / — / — | 0 / — / — |
| 2026-05 | 257 | 257 / −£52.63 / -20.5% | 0 / — / — | 0 / — / — |
| 2026-06 | 134 | 134 / −£36.35 / -27.1% | 0 / — / — | 0 / — / — |
| 2026-07 | 161 | 161 / −£40.52 / -25.2% | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% |
| 2026-08 | 128 | 128 / −£23.36 / -18.3% | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% |
| 2026-09 | 149 | 149 / −£53.48 / -35.9% | 2 / −£2.00 / -100.0% | 2 / −£2.00 / -100.0% |
| 2026-10 | 135 | 135 / +£20.41 / 15.1% | 0 / — / — | 0 / — / — |

| Captured-price month | Races | Original T2 | SP favourite | A | B | C |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11 | 136 | 136 / −£5.74 / -4.2% | 136 / −£12.42 / -9.1% | 25 / +£3.00 / 12.0% | 0 / — / — | 0 / — / — |

</details>

<details>
<summary>AW · monthly returns</summary>

| Retrospective month | Races | SP favourite | B | C |
| --- | --- | --- | --- | --- |
| 2025-01 | 400 | 400 / −£17.12 / -4.3% | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% |
| 2025-02 | 316 | 316 / +£12.11 / 3.8% | 2 / +£10.00 / 500.0% | 2 / +£10.00 / 500.0% |
| 2025-03 | 334 | 334 / +£10.67 / 3.2% | 3 / −£3.00 / -100.0% | 3 / −£3.00 / -100.0% |
| 2025-04 | 227 | 227 / −£31.37 / -13.8% | 0 / — / — | 0 / — / — |
| 2025-05 | 124 | 124 / −£14.86 / -12.0% | 1 / −£1.00 / -100.0% | 1 / +£1.50 / 150.0% |
| 2025-06 | 126 | 126 / +£31.45 / 25.0% | 2 / −£2.00 / -100.0% | 2 / −£2.00 / -100.0% |
| 2025-07 | 66 | 66 / −£8.28 / -12.5% | 0 / — / — | 0 / — / — |
| 2025-08 | 167 | 167 / −£23.70 / -14.2% | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% |
| 2025-09 | 277 | 277 / −£14.38 / -5.2% | 3 / +£38.00 / 1266.7% | 3 / −£3.00 / -100.0% |
| 2025-10 | 350 | 350 / −£52.59 / -15.0% | 1 / −£1.00 / -100.0% | 1 / +£2.75 / 275.0% |
| 2025-11 | 328 | 328 / −£67.18 / -20.5% | 2 / −£2.00 / -100.0% | 2 / −£2.00 / -100.0% |
| 2025-12 | 363 | 363 / −£5.61 / -1.5% | 4 / +£4.00 / 100.0% | 4 / −£4.00 / -100.0% |
| 2026-01 | 407 | 407 / −£40.79 / -10.0% | 0 / — / — | 0 / — / — |
| 2026-02 | 330 | 330 / −£20.38 / -6.2% | 3 / −£3.00 / -100.0% | 3 / −£0.13 / -4.2% |
| 2026-03 | 346 | 346 / −£20.76 / -6.0% | 0 / — / — | 0 / — / — |
| 2026-04 | 249 | 249 / −£21.20 / -8.5% | 1 / +£1.50 / 150.0% | 1 / +£1.50 / 150.0% |
| 2026-05 | 106 | 106 / +£15.04 / 14.2% | 1 / +£3.50 / 350.0% | 1 / +£3.50 / 350.0% |
| 2026-06 | 90 | 90 / −£33.96 / -37.7% | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% |
| 2026-07 | 127 | 127 / −£21.39 / -16.8% | 0 / — / — | 0 / — / — |
| 2026-08 | 166 | 166 / −£31.85 / -19.2% | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% |
| 2026-09 | 169 | 169 / −£2.43 / -1.4% | 0 / — / — | 0 / — / — |

| Captured-price month | Races | Original T2 | SP favourite | A | B | C |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11 | 116 | 116 / +£6.16 / 5.3% | 116 / −£19.79 / -17.1% | 16 / −£16.00 / -100.0% | 0 / — / — | 0 / — / — |

</details>

<details>
<summary>TURF · monthly returns</summary>

| Retrospective month | Races | SP favourite | B | C |
| --- | --- | --- | --- | --- |
| 2025-02 | 1 | 1 / +£1.50 / 150.0% | 0 / — / — | 0 / — / — |
| 2025-03 | 45 | 45 / +£11.43 / 25.4% | 0 / — / — | 0 / — / — |
| 2025-04 | 396 | 396 / +£22.39 / 5.7% | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% |
| 2025-05 | 759 | 759 / −£145.19 / -19.1% | 5 / +£10.00 / 200.0% | 4 / −£2.67 / -66.7% |
| 2025-06 | 766 | 766 / −£73.64 / -9.6% | 3 / −£3.00 / -100.0% | 3 / £0.00 / 0.0% |
| 2025-07 | 869 | 869 / −£148.11 / -17.0% | 5 / +£27.50 / 550.0% | 5 / +£5.83 / 116.7% |
| 2025-08 | 778 | 778 / −£49.96 / -6.4% | 8 / −£3.50 / -43.8% | 8 / +£14.00 / 175.0% |
| 2025-09 | 625 | 625 / −£92.44 / -14.8% | 5 / −£5.00 / -100.0% | 5 / −£5.00 / -100.0% |
| 2025-10 | 443 | 443 / −£96.68 / -21.8% | 0 / — / — | 0 / — / — |
| 2025-11 | 38 | 38 / −£4.31 / -11.3% | 0 / — / — | 0 / — / — |
| 2026-02 | 1 | 1 / +£1.63 / 162.5% | 0 / — / — | 0 / — / — |
| 2026-03 | 47 | 47 / +£2.56 / 5.4% | 0 / — / — | 0 / — / — |
| 2026-04 | 395 | 395 / −£54.64 / -13.8% | 0 / — / — | 0 / — / — |
| 2026-05 | 761 | 761 / −£118.70 / -15.6% | 4 / −£4.00 / -100.0% | 3 / −£0.90 / -30.0% |
| 2026-06 | 817 | 817 / −£48.88 / -6.0% | 5 / −£5.00 / -100.0% | 5 / +£0.75 / 15.0% |
| 2026-07 | 853 | 853 / −£36.49 / -4.3% | 2 / −£2.00 / -100.0% | 2 / +£5.25 / 262.5% |
| 2026-08 | 744 | 744 / −£112.69 / -15.1% | 2 / −£0.17 / -8.3% | 2 / −£0.17 / -8.3% |
| 2026-09 | 430 | 430 / −£76.42 / -17.8% | 2 / −£2.00 / -100.0% | 1 / −£1.00 / -100.0% |

| Captured-price month | Races | Original T2 | SP favourite | A | B | C |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11 | 7 | 7 / −£4.38 / -62.5% | 7 / +£0.75 / 10.7% | 1 / −£1.00 / -100.0% | 0 / — / — | 0 / — / — |

</details>

The yearly coverage table shows evaluated races with **no selection**, rather than counting unavailable original predictions or missing market books as abstentions. Avg/median prices are final decimal SP across all settled stakes, regardless of result.


<details>
<summary>2025 SP simulation · no-selection counts and final prices</summary>

| Family | Policy | Races | Selections | No selection | Mean final SP | Median final SP |
| --- | --- | --- | --- | --- | --- | --- |
| ALL | B | 12377 | 52 | 12325 | 19.57 | 9.00 |
| ALL | C | 12377 | 51 | 12326 | 4.78 | 4.50 |
| ALL | SP favourite | 12377 | 12377 | 0 | 2.99 | 2.88 |
| CHASE | B | 1688 | 1 | 1687 | 17.00 | 17.00 |
| CHASE | C | 1688 | 1 | 1687 | 4.33 | 4.33 |
| CHASE | SP favourite | 1688 | 1688 | 0 | 2.96 | 2.88 |
| HURDLE | B | 2891 | 4 | 2887 | 4.94 | 4.63 |
| HURDLE | C | 2891 | 4 | 2887 | 4.94 | 4.63 |
| HURDLE | SP favourite | 2891 | 2891 | 0 | 2.81 | 2.63 |
| AW | B | 3078 | 20 | 3058 | 25.60 | 13.00 |
| AW | C | 3078 | 20 | 3058 | 4.53 | 4.25 |
| AW | SP favourite | 3078 | 3078 | 0 | 3.01 | 2.88 |
| TURF | B | 4720 | 27 | 4693 | 17.36 | 10.00 |
| TURF | C | 4720 | 26 | 4694 | 4.96 | 4.75 |
| TURF | SP favourite | 4720 | 4720 | 0 | 3.10 | 3.00 |

</details>

<details>
<summary>2026 SP simulation · no-selection counts and final prices</summary>

| Family | Policy | Races | Selections | No selection | Mean final SP | Median final SP |
| --- | --- | --- | --- | --- | --- | --- |
| ALL | B | 9226 | 31 | 9195 | 23.58 | 12.00 |
| ALL | C | 9226 | 29 | 9197 | 3.63 | 3.25 |
| ALL | SP favourite | 9226 | 9226 | 0 | 2.95 | 2.88 |
| CHASE | B | 1157 | 3 | 1154 | 4.78 | 3.25 |
| CHASE | C | 1157 | 3 | 1154 | 2.87 | 3.25 |
| CHASE | SP favourite | 1157 | 1157 | 0 | 2.90 | 2.75 |
| HURDLE | B | 2031 | 6 | 2025 | 7.92 | 5.00 |
| HURDLE | C | 2031 | 6 | 2025 | 4.54 | 4.13 |
| HURDLE | SP favourite | 2031 | 2031 | 0 | 2.87 | 2.75 |
| AW | B | 1990 | 7 | 1983 | 44.05 | 5.50 |
| AW | C | 1990 | 7 | 1983 | 3.39 | 2.88 |
| AW | SP favourite | 1990 | 1990 | 0 | 2.92 | 2.88 |
| TURF | B | 4048 | 15 | 4033 | 24.05 | 17.00 |
| TURF | C | 4048 | 13 | 4035 | 3.52 | 3.75 |
| TURF | SP favourite | 4048 | 4048 | 0 | 3.01 | 2.88 |

</details>

<details>
<summary>November priced books · no-selection counts and final prices</summary>

| Family | Policy | Races | Selections | No selection | Mean final SP | Median final SP |
| --- | --- | --- | --- | --- | --- | --- |
| ALL | Frozen T2 | 332 | 332 | 0 | 10.20 | 5.50 |
| ALL | A | 332 | 59 | 273 | 26.61 | 15.00 |
| ALL | B | 332 | 0 | 332 | — | — |
| ALL | C | 332 | 0 | 332 | — | — |
| ALL | SP favourite | 332 | 332 | 0 | 2.89 | 2.75 |
| CHASE | Frozen T2 | 73 | 73 | 0 | 7.06 | 5.00 |
| CHASE | A | 73 | 17 | 56 | 14.18 | 11.00 |
| CHASE | B | 73 | 0 | 73 | — | — |
| CHASE | C | 73 | 0 | 73 | — | — |
| CHASE | SP favourite | 73 | 73 | 0 | 2.95 | 2.88 |
| HURDLE | Frozen T2 | 136 | 136 | 0 | 11.80 | 5.00 |
| HURDLE | A | 136 | 25 | 111 | 35.94 | 19.00 |
| HURDLE | B | 136 | 0 | 136 | — | — |
| HURDLE | C | 136 | 0 | 136 | — | — |
| HURDLE | SP favourite | 136 | 136 | 0 | 2.73 | 2.63 |
| AW | Frozen T2 | 116 | 116 | 0 | 10.16 | 6.50 |
| AW | A | 116 | 16 | 100 | 24.78 | 15.00 |
| AW | B | 116 | 0 | 116 | — | — |
| AW | C | 116 | 0 | 116 | — | — |
| AW | SP favourite | 116 | 116 | 0 | 2.97 | 2.88 |
| TURF | Frozen T2 | 7 | 7 | 0 | 12.38 | 8.00 |
| TURF | A | 7 | 1 | 6 | 34.00 | 34.00 |
| TURF | B | 7 | 0 | 7 | — | — |
| TURF | C | 7 | 0 | 7 | — | — |
| TURF | SP favourite | 7 | 7 | 0 | 3.90 | 4.00 |

</details>
