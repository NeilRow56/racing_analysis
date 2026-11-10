# Tissue-vs-market badge fix — 10 November 2026

Same-capture market normalization: **implemented**. Complete valid book required: **yes**.
Legacy Value matching required for the badge: **no**.

New captures persist each runner's normalized market probability. The active view exposes frozen probability, rank, price, normalized market probability, completeness, source, timestamp and book identity. Existing complete books are normalized read-only from their own frozen captured prices; no historical rows are rewritten. Incomplete books expose a null market probability and retain fallback styling.

The existing Value normalization formula was extracted into one shared helper with the same arithmetic order. Value selection, ranking, scoring, model coefficients, watch rules, settlement and V3 logic are unchanged. The production badge uses the active V2 capture directly. Exact legacy Value matching remains a compatibility path only when the active view predates the new market fields.

## Frozen replay

The original component was run before editing and reproduced 36 fallbacks. Replaying its legacy input shape after the fix also reproduces those counts. Whole latest pre-off captures for 2026-11-10 supply 36 T1/T2 badges across 18 races. This replay uses frozen books, not live runner-status data; NR behavior is checked separately below.

| State | Before | After |
| --- | ---: | ---: |
| Positive | 0 | 20 |
| Neutral | 0 | 1 |
| Negative | 0 | 13 |
| Fallback | 36 | 2 |

Commands (read-only):

```sh
bun run scripts/audit-tissue-market-badges.tsx 2026-11-10 --legacy
bun run scripts/audit-tissue-market-badges.tsx 2026-11-10
```

The command emits per-runner probabilities, edge in percentage points, completeness, timestamp, book identity and the state found in server-rendered badge markup.

## Rendering examples

These deterministic UI fixtures assert the rendered markup, including NR precedence and independence from changed live odds, legacy Value and V3 shadow probabilities. The Hurdle fixture uses V2 probability 25% while V3 has 99% (then 1%); both produce identical production markup.

| Case | Tissue % | Market % | Edge pp | Expected | Rendered |
| --- | ---: | ---: | ---: | --- | --- |
| Positive | 35.0 | 30.0 | +5.0 | positive | positive |
| Neutral | 30.3 | 30.0 | +0.3 | neutral | neutral |
| Negative | 25.0 | 30.0 | -5.0 | negative | negative |
| Incomplete book | 35.0 | unavailable | unavailable | fallback | fallback |
| NR | 35.0 | 30.0 | +5.0 frozen | NR; no edge emphasis | NR; no edge emphasis |
| Hurdle V2 / V3 separation | 25.0 | 30.0 | -5.0 | negative from V2 | negative from V2 |

The ±0.5 pp boundaries are covered separately, as are invalid data, absent Value rank, legacy frozen-book projection, capture persistence, changed pre-off books and immutable historical rows.

## Immutability and validation

All research JSON SHA-256 hashes match their task-start values, including existing prospective ledgers and models. Tissue probabilities/ranks, Value ranks, captured prices and model hashes are unchanged. No historical backfill was performed. Existing unrelated workspace edits were preserved.

73 tests pass across capture, badge UI, all-family Tissue/Value separation, agreement/watch behavior, Hurdle V3 and context shadow suites. Typecheck and targeted ESLint pass. No production build was run.

## Individual frozen replay results

| Horse | Race | Rank | Tissue % | Market % | Edge pp | Rendered |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Charles Ritz | aae62e86-481c-48e2-a3d3-efff8dfe584a | 1 | 25.109 | 23.859 | +1.250 | positive |
| Sherborne | aae62e86-481c-48e2-a3d3-efff8dfe584a | 2 | 20.890 | 23.859 | -2.969 | negative |
| Teorie | c4c3564d-0095-4991-9a38-a06e78d7c79a | 2 | 21.005 | 36.936 | -15.931 | negative |
| Ocean Heights | c4c3564d-0095-4991-9a38-a06e78d7c79a | 1 | 34.306 | 16.621 | +17.685 | positive |
| Seven Stars | ffaed1c0-19c0-473f-86ea-472670f7a3ee | 2 | 17.635 | 54.665 | -37.029 | negative |
| Dancing Dame | ffaed1c0-19c0-473f-86ea-472670f7a3ee | 1 | 38.703 | 19.679 | +19.023 | positive |
| Cap Ricochet | e8e4ce8e-0de5-4929-9ec6-58d853551dd0 | 1 | 26.673 | 42.656 | -15.983 | negative |
| Eastern Shores | e8e4ce8e-0de5-4929-9ec6-58d853551dd0 | 2 | 20.028 | 12.534 | +7.493 | positive |
| Latin | 07d9d0cf-fc44-4b15-8501-4214b537df3a | 1 | 22.573 | 21.757 | +0.816 | positive |
| Polemon | 07d9d0cf-fc44-4b15-8501-4214b537df3a | 2 | 19.298 | 1.218 | +18.080 | positive |
| Virtual Rock | 4f6afca5-1b0b-4b31-a5e0-7e6b9980dd66 | 1 | 31.570 | 26.148 | +5.422 | positive |
| Blues Singer | 4f6afca5-1b0b-4b31-a5e0-7e6b9980dd66 | 2 | 17.114 | 18.116 | -1.002 | negative |
| Port Glen One | f322649a-c708-42f6-862c-b698f70842e5 | 1 | 39.510 | 70.794 | -31.284 | negative |
| Templar Knight | f322649a-c708-42f6-862c-b698f70842e5 | 2 | 23.183 | 7.079 | +16.103 | positive |
| Kamille Au Kanada | 3562071a-3887-4d04-b257-6c77ab1f82e5 | 2 | 21.871 | 38.381 | -16.510 | negative |
| Ride Like A Girl | 3562071a-3887-4d04-b257-6c77ab1f82e5 | 1 | 42.057 | 19.501 | +22.556 | positive |
| Zaraquelle | 4527f03c-4adf-4dd5-971a-7f93f5be7345 | 1 | 28.295 | 17.271 | +11.024 | positive |
| Foinix | 4527f03c-4adf-4dd5-971a-7f93f5be7345 | 2 | 17.704 | 8.181 | +9.523 | positive |
| Cinnodin | 2c446a08-6d4f-40f1-a51e-d8591b26bf8b | 1 | 46.769 | — | — | fallback |
| Betty's Tiara | 2c446a08-6d4f-40f1-a51e-d8591b26bf8b | 2 | 30.963 | — | — | fallback |
| Rebel Tribesman | 4abd830f-3701-4473-b69a-b0acc453eddf | 1 | 48.807 | 40.144 | +8.663 | positive |
| Secret Trix | 4abd830f-3701-4473-b69a-b0acc453eddf | 2 | 24.796 | 12.043 | +12.753 | positive |
| Quatre Saison | 73762a4f-a3ee-4876-b17c-9132b64fd7d8 | 1 | 15.529 | 36.938 | -21.409 | negative |
| Garrison Gold | 73762a4f-a3ee-4876-b17c-9132b64fd7d8 | 2 | 8.117 | 13.519 | -5.402 | negative |
| Western Shores | 6d7cbd61-c443-480b-b47e-6e488b295d57 | 1 | 21.914 | 20.305 | +1.609 | positive |
| Gratitudeforgrace | 6d7cbd61-c443-480b-b47e-6e488b295d57 | 2 | 18.322 | 5.857 | +12.465 | positive |
| Fuusland | 1f3c243b-b3d4-43e1-9e30-72cd98a175eb | 2 | 14.978 | 15.222 | -0.244 | neutral |
| Well Bud | 1f3c243b-b3d4-43e1-9e30-72cd98a175eb | 1 | 18.944 | 8.059 | +10.885 | positive |
| Ballyfad | bc8d6a0f-f0c5-49c5-a145-031b0c9ae21b | 2 | 11.660 | 29.487 | -17.827 | negative |
| Storm Heart | bc8d6a0f-f0c5-49c5-a145-031b0c9ae21b | 1 | 15.587 | 22.682 | -7.096 | negative |
| Urbs Intacta Manet | 0d0ea273-b3e0-4ffe-bde3-75a82a4d07d4 | 2 | 19.598 | 36.406 | -16.808 | negative |
| Attaboyarchie | 0d0ea273-b3e0-4ffe-bde3-75a82a4d07d4 | 1 | 39.900 | 14.893 | +25.007 | positive |
| Hearts And Spades | ba0770a5-61a9-48c6-bbae-2f6f48f94660 | 1 | 19.154 | 26.580 | -7.426 | negative |
| Cold Old Fire | ba0770a5-61a9-48c6-bbae-2f6f48f94660 | 2 | 14.224 | 4.300 | +9.924 | positive |
| Cahirdown Boy | 010eb3d1-3767-43bd-a625-56b1a7c62657 | 1 | 11.410 | 5.361 | +6.049 | positive |
| Getaway Charlie | 010eb3d1-3767-43bd-a625-56b1a7c62657 | 2 | 9.742 | 4.099 | +5.643 | positive |
