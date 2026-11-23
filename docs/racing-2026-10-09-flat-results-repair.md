# Verified repair of 9 October 2026 Flat results
19 November 2026 · Local PostgreSQL transaction 53234

The repair restored **91 missing starter outcomes across exactly eight races** and registered eight full-result provenance rows. All 105 ride and horse identities reconciled. The 14 non-runner statuses and every stored final-SP value were preserved. A fresh verification connection reported zero additional changes.

## Backup, restore and live verification

The custom-format backup was taken under the existing operational lock. PostgreSQL successfully restored the full archive on a private Unix socket. The rehearsal rolled back an intentional mid-batch failure to the exact before-image. A successful rehearsal was followed by a zero-change verification pass and a compensating rollback that restored the same before-image. The live transaction required an exact match to that restored backup before writing.

Backup SHA-256 7078c6de6e955bd8e6cd0fe1eef596bae65564f6d3d5e7f6ff13dfd0021bcf89. The backup includes 188 frozen research files, verified byte-for-byte at backup, live commit and verification. [Backup manifest](../backups/flat-results-2026-10-09-repair.kGlelU/backup-manifest.json) · [Restore and rollback rehearsal](../backups/flat-results-2026-10-09-repair.kGlelU/restore-rehearsal.json) · [Live verification](../backups/flat-results-2026-10-09-repair.kGlelU/live-verification.json)

| Provider race ID | Course | Restored starters | NR statuses preserved | Provider winner final SP | New provenance UUID |
| --- | --- | --- | --- | --- | --- |
| 942523 | Newmarket | 11 | 4 | 9/2 | cbcba33f-7ec9-4976-a75b-5f910dc37926 |
| 942524 | Kempton | 10 | 2 | 7/4 | 738c2606-df3b-44bf-aae2-e7b185264399 |
| 942525 | Kempton | 13 | 1 | 33/1 | 7f892f36-a9cd-4e62-b030-9cf9378c6923 |
| 942526 | Kempton | 7 | 1 | 66/1 | 08d04bb9-b19d-49b3-9613-1336c538b6cc |
| 942755 | Dundalk | 14 | 2 | 8/1 | 831cee82-5a49-46ee-b7ed-406503b502da |
| 942756 | Dundalk | 14 | 1 | 28/1 | a7296968-edb5-4c0b-b46e-11767c387cef |
| 943052 | Dundalk | 14 | 3 | 50/1 | 1f7ee02c-d707-417e-bb32-29e41b220a6a |
| 943054 | Kempton | 8 | 0 | 30/100 | 77fa153c-78ed-4da4-b9f8-8c8a88204a41 |

The live transaction filled 24 race result fields and 648 runner result fields. It copied the eight exact payloads and original acquisition times into the full-result namespace. The original racecard imports, runner identities, prices and all protected columns matched their before-images. Tuple fingerprints and row counts for every unrelated public table matched before and after under the transaction lock. The canonical adapter resolved eight winners and 83 losing starters and withheld all 14 non-runners from settlement. No race or runner rows were inserted. [Private before/after and inserted-ID receipt](../backups/flat-results-2026-10-09-repair.kGlelU/repair-receipt.json) · [Approved correction plan](racing-2026-data-integrity-impact-and-correction-plan.md)

## Isolated cache work

| Derived artifact | Races | Runner rows | Prepared outcomes / scope |
| --- | --- | --- | --- |
| AW exact target slice | 7 | 90 | 80 starter outcomes |
| Turf exact target slice | 1 | 15 | 11 starter outcomes |
| Jump through 14 October participant delta | 32 | 52 | Trainer and jockey features only |

The Flat slices use the canonical historical feature reader on the 105 repaired ride IDs. The Jump overlay uses pinned guard-v2 feature rows. The original participant fields were reproduced against the restored database and checked against the live, read-only loaders after repair. An independent count of the added earlier starts and wins explained each delta. No target horse in the pinned Jump replay had an earlier start among the eight repaired Flat races. Eighteen archived cache files matched their pre-repair hashes. [Archived cache verification](../backups/flat-results-2026-10-09-repair.kGlelU/archived-cache-verification.json). The AW/Turf historical model evaluations through September and the pinned Chase forecasts remain on their original populations. [Isolated derived artifact manifest](../backups/flat-results-2026-10-09-repair.kGlelU/isolated-derived/manifest.json)

## Historical research reconciliation

Each pair is the previous value followed by the corrected value on the same published rule and date window. The market and trainer tables use exact final fractional SP, the original competition ranking for ties and normalised inverse-SP probabilities. The eight books expand observed market coverage by 80 AW and 11 Turf stakes. Existing complete-book results are held fixed.

| Selection group | Selections | Winners | £1 SP P/L | Market A/E |
| --- | --- | --- | --- | --- |
| All Weather · Favourite | 2,687 → 2,694 | 905 → 907 | −£321.26 → −£324.21 | 1.062 → 1.062 |
| All Weather · Second | 2,590 → 2,599 | 505 → 505 | −£483.58 → −£492.58 | 0.985 → 0.982 |
| All Weather · Third | 2,497 → 2,503 | 340 → 340 | −£469.35 → −£475.35 | 0.971 → 0.969 |
| All Weather · 2–3 | 5,087 → 5,102 | 845 → 845 | −£952.93 → −£967.93 | 0.979 → 0.977 |
| All Weather · 4–6 | 7,362 → 7,385 | 548 → 550 | −£1805.08 → −£1752.08 | 0.962 → 0.963 |
| All Weather · 7+ | 7,967 → 8,002 | 216 → 219 | −£2690.00 → −£2611.00 | 0.940 → 0.949 |
| All Weather · Non-favourites | 20,416 → 20,489 | 1,609 → 1,614 | −£5448.02 → −£5331.02 | 0.968 → 0.968 |
| Turf · Favourite | 5,157 → 5,158 | 1,702 → 1,702 | −£576.40 → −£577.40 | 1.059 → 1.059 |
| Turf · Second | 4,788 → 4,789 | 985 → 986 | −£556.42 → −£551.92 | 1.050 → 1.051 |
| Turf · Third | 4,696 → 4,697 | 652 → 652 | −£828.94 → −£829.94 | 1.004 → 1.004 |
| Turf · 2–3 | 9,484 → 9,486 | 1,637 → 1,638 | −£1385.36 → −£1381.86 | 1.031 → 1.032 |
| Turf · 4–6 | 13,321 → 13,324 | 942 → 942 | −£3522.50 → −£3525.50 | 0.908 → 0.907 |
| Turf · 7+ | 16,524 → 16,529 | 443 → 443 | −£6140.00 → −£6145.00 | 0.902 → 0.901 |
| Turf · Non-favourites | 39,329 → 39,339 | 3,022 → 3,023 | −£11047.86 → −£11052.36 | 0.970 → 0.970 |

### Trainer patterns

| Selection group | Selections | Winners | £1 SP P/L | Market A/E |
| --- | --- | --- | --- | --- |
| Run 1 after 90+ day break | 11,323 → 11,325 | 1,136 → 1,136 | −£2940.30 → −£2942.30 | 1.006 → 1.006 |
| Run 1 after 90+ day break · no favourites | 10,265 → 10,267 | 735 → 735 | −£2860.24 → −£2862.24 | 0.963 → 0.963 |
| Run 2 after 90+ day break | 8,907 → 8,910 | 982 → 982 | −£2612.04 → −£2615.04 | 0.999 → 0.999 |
| Run 2 after 90+ day break · no favourites | 7,779 → 7,782 | 608 → 608 | −£2466.19 → −£2469.19 | 0.989 → 0.989 |
| Run 3 after 90+ day break | 7,723 → 7,724 | 936 → 936 | −£1595.03 → −£1596.03 | 1.037 → 1.037 |
| Run 3 after 90+ day break · no favourites | 6,673 → 6,674 | 592 → 592 | −£1431.40 → −£1432.40 | 1.038 → 1.038 |
| Seasonal reappearance | 16,218 → 16,225 | 1,600 → 1,601 | −£4130.96 → −£4103.96 | 1.009 → 1.010 |
| Seasonal reappearance · no favourites | 14,704 → 14,710 | 1,076 → 1,077 | −£4044.10 → −£4016.10 | 0.964 → 0.965 |

[All changed broad trainer cohorts](../backups/flat-results-2026-10-09-repair.kGlelU/trainer-reconciliation.json).

### Fixed rules

| Fixed Jump replay | Original selections | Settled stakes | Winners | £1 SP P/L | Market A/E | IDs added / removed |
| --- | --- | --- | --- | --- | --- | --- |
| Chases - 2026 non summer | 345 → 345 | 345 → 345 | 84 → 84 | −£56.40 → −£56.40 | 1.019 → 1.019 | 0 / 0 |
| Jump - handicap 2 | 1,387 → 1,387 | 1,284 → 1,284 | 170 → 170 | −£212.44 → −£212.44 | 0.963 → 0.963 | 0 / 0 |

The archived Jump handicap names share one canonical rule. Original selection identities were reproduced before evaluating any corrections. The table uses the market-covered and SP basis of the 19 November audit. The evaluator’s separate stored-decimal settlement totals and exact ID memberships are in the reconciliation receipt. [Saved-rule reconciliation](../backups/flat-results-2026-10-09-repair.kGlelU/saved-rule-reconciliation.json)

| Selection group | Selections | Winners | £1 SP P/L | Market A/E | IDs added / removed |
| --- | --- | --- | --- | --- | --- |
| HURDLE R09 | 2,012 → 2,012 | 432 → 432 | −£297.14 → −£297.14 | 1.016 → 1.016 | 0 / 0 |

The discovery sensitivity reran three existing participant-conditioned rules in each of the four families. All twelve retained their original selection membership. The original Hurdle finalist appears above. The standalone model vectors reproduced exactly, and no fitting was needed. The Chase Speed/layoff finalist has no input path from these Flat results. [All twelve discovery comparisons](../backups/flat-results-2026-10-09-repair.kGlelU/discovery-rule-reconciliation.json)

The repair does not change the main practical findings. All predefined family market-rank cohorts still lost money at final SP in 2026. The 90-day second-run group remains close to market expectation and loss-making. Its no-favourite subset remains loss-making. The updated figures are retrospective market and trainer results.

## Boundaries and tests

The 76 other card-only races, 38 nonterminal imports and 130 absent Irish races remain outside the repair. The old Hurdle V2/V3 historical roster remains unavailable, so an exact corrected replay for that specific comparison is still unverified. Later AW/Turf forecasting windows and any effect on subsequent course-time or prior-year trainer models require separately scoped research. The recorded prospective forecasts and their settlement files remain byte-identical to the verified backup. The prior audit and impact plan remain available for comparison.

Validation passed **141 Bun tests and 50 Sporting Life importer tests**. The transaction also passed the canonical results, duplicate, unchanged-price, unrelated-row and receipt checks. [Bun test log](../backups/flat-results-2026-10-09-repair.kGlelU/bun-tests.log) · [Importer test log](../backups/flat-results-2026-10-09-repair.kGlelU/import-tests.log) · [Prior audit](racing-2025-2026-data-market-trainer-audit.md)
