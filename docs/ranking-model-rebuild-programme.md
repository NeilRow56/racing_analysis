# Ranking Model Rebuild Programme

This programme starts a fresh research track for Turf, Jump and All Weather rank-1 quality. It does not replace or mutate the current production or shadow models:

- TPR_S2_V1
- Turf Tissue v2
- JPR-A / JPR-B
- JUMP_TISSUE_V1
- AW-D / AW-A
- AW_TISSUE_V1

Primary objective: identify the horse most likely to win the race. Betting value, SP A/E, P/L and ROI are descriptive diagnostics only.

## Phase 1: Rank-1 Failure Audit

Run:

```sh
bun run scripts/audit-rank-one-failures.ts
```

This writes `data/research/rank-one-failure-diagnostic.md`.

The audit buckets frozen rank-1 selections by final SP:

- odds-on
- evens to <2/1
- 2/1 to <4/1
- 4/1 to <8/1
- 8/1+

For each current model family it reports selections, winners, strike, market implied win rate, model predicted win rate where available, actual-minus-market expectation and actual-minus-model expectation.

Final SP is used only after rank 1 is frozen. It is not a ranking input.

## Phase 2: Confidence Profile

The first diagnostic confidence profile is price-independent and intentionally simple:

- model probability
- rank-1 versus rank-2 probability gap where available
- rating gap where probability gap is unavailable
- agreement with independent model families where captured

The initial gates are pre-specified in `src/lib/racing/rank-one-diagnostics.ts` and should be revised only through chronological validation, not by retrospective P/L.

## Phase 3: Abstention and Short-Price Gate

Test `NO CONFIDENT RANK 1` as a label, not as a betting rule. Measure:

- races abstained
- retained rank-1 strike
- top-1 capture lost through abstention
- retained sample size
- calibration where probabilities exist

The separate market-aware diagnostic layer applies only after core ranking is frozen. For rank-1 horses shorter than 2/1, inspect whether weak confidence explains underperformance. Do not introduce a blanket "never select under 2/1" rule without stable structural evidence.

## Phase 4: Candidate Families

Keep candidate families small:

- Turf: TURF-R0 current Turf Tissue v2, TURF-R1 reduced/regularised Tissue, TURF-R2 ranking-oriented, TURF-R3 consensus.
- Jump: JUMP-R0 current Jump Tissue, JUMP-R1 richer numeric, JUMP-R2 numeric plus reduced comments, JUMP-R3 ranking/consensus.
- All Weather: AW-R0 current AW Tissue, AW-R1 richer numeric, AW-R2 numeric plus reduced comments, AW-R3 ranking/consensus.

Use chronological folds, walk-forward validation and a new prospective shadow epoch before recommending any production change.
