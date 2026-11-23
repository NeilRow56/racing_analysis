# TRAINER TARGETING — PROSPECTIVE MONITORING

**FIXTURE EXAMPLE.** Historical test inputs with simulated capture times and edited scenarios.

London racing dates **2026-10-31** to **2027-10-31** (end exclusive). Activated 2026-10-30T07:00:00.000Z.

Protocol `trainer_targeting_prospective_v1` · Settlement `canonical_settlement_v3`.

Market A/E and £1 win returns use the same complete final-SP books. A/E uses fractional dead-heat credit. Independent dates are distinct London racing dates. The comparison floors require 30 complete-book stakes, 3 expected winners, 10 dates and 15 horses. Meeting the floors only establishes reporting coverage.

The sensitivity columns remove every stake in the one or two races with the largest gross winning payouts. An em dash indicates unavailable evidence.

| Cohort | Captured | Settled starters | Winners | Strike rate | Market stakes | SP-expected winners | Market A/E | Date-cluster 95% A/E | £1 SP P/L | ROI | Dates | Horses | Pending | NR | Void | Incomplete starters / races | P/L excl. 1 race | P/L excl. 2 races | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| William Haggas · Valuable AW/Turf handicaps | 1 | 1 | 0 | 0.0% | 1 | 0.17 | 0.00 | — | −£1.00 | -100.0% | 1 | 1 | 0 | 0 | 0 | 0 / 0 | — | — | INCONCLUSIVE |
| Willie Mullins · All Grade 1 declarations | 3 | 3 | 1 | 33.3% | 3 | 1.00 | 1.00 | — | −£1.00 | -33.3% | 1 | 3 | 0 | 0 | 0 | 0 / 0 | — | — | INCONCLUSIVE |
| Mullins · Final-SP favourites | 2 | 2 | 1 | 50.0% | 2 | 0.86 | 1.17 | — | £0.00 | 0.0% | 1 | 2 | 0 | 0 | 0 | 0 / 0 | — | — | INCONCLUSIVE |
| Mullins · Final-SP non-favourites | 1 | 1 | 0 | 0.0% | 1 | 0.14 | 0.00 | — | −£1.00 | -100.0% | 1 | 1 | 0 | 0 | 0 | 0 / 0 | — | — | INCONCLUSIVE |
| Gavin Cromwell · Punchestown Chase/Hurdle | 1 | 1 | 0 | 0.0% | 1 | 0.02 | 0.00 | — | −£1.00 | -100.0% | 1 | 1 | 0 | 0 | 0 | 0 / 0 | — | — | INCONCLUSIVE |

Mullins's final-SP categories include ranked starters only. Joint favourites share rank 1. Pending, refunded and unranked declarations are included in the all-declarations row.

## Controls

Common-support cells share race family, country, currency, handicap flag, final starter-count band, calendar quarter, class band and first-prize band. Matching drops prize band for Haggas and class band for Mullins. Each side uses the smaller cell count as its weight. Mullins comparisons use final-SP non-favourites. Rivals are other identified trainers in the same target races.

| Trainer | Own controls captured | Matched stakes per side | Own A/E target / control | Own ROI target / control | Rival market stakes | Rival A/E | Rival ROI |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| William Haggas | 0 | 0 | — / — | — / — | 9 | 1.20 | -50.0% |
| Willie Mullins | 0 | 0 | — / — | — / — | 0 | — | — |
| Gavin Cromwell | 0 | 0 | — / — | — / — | 8 | 1.02 | -25.0% |
