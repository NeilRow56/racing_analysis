# Trainer targeting prospective collection

The collector is inactive until `data/research/trainer-targeting-prospective-v1/period.json` exists. The protocol is `trainer_targeting_prospective_v1` and settlement is `canonical_settlement_v3`. The first day defaults to the London calendar day after activation. The anniversary is an exclusive end date. A 29 February start uses 28 February as its anniversary in a non-leap year.

| Hypothesis | Captured target | Captured same-trainer control |
| --- | --- | --- |
| William Haggas, Sporting Life trainer `193` | AW or Turf with explicit `has_handicap = true` and published first prize of at least 25,000 GBP or EUR | Ordinary AW/Turf handicaps with a published first prize below 25,000 in GBP or EUR |
| Willie Mullins, Sporting Life trainer `414` | All Chase/Hurdle Grade 1 declarations with explicit `has_handicap = false` and corroborating structured Class 1 | Other explicit non-handicap Chases/Hurdles. Grade 1 labels with missing or conflicting class evidence are excluded |
| Gavin Cromwell, Sporting Life trainer `1287` | All Chase/Hurdle declarations at Sporting Life course `341`, Punchestown | Chase/Hurdle declarations at other identified courses |

Prizes retain their published currency. Mullins's favourites and non-favourites are assigned after settlement by final-SP competition rank. Ties at the shortest price share rank 1.

## Activation and reporting

1. From the repository root, run `bun run scripts/trainer-targeting.ts activate` on the day before the intended start. To freeze a later first day, pass it as `activate YYYY-MM-DD`. The command writes the sole period manifest atomically and prints the frozen dates and versions.
2. Let the existing morning automation invoke `research:morning` on the first day. For a manual morning run, use `bun run research:morning YYYY-MM-DD` with that day's London date. Look for `Trainer targeting appended … race captures` in the import log. The existing result imports continue to supply settlement evidence.
3. Generate the report with `bun --env-file=.env.local run scripts/trainer-targeting.ts report`. Redirect stdout to a Markdown file if desired.

The morning workflow passes a private handoff containing payloads from committed racecard imports. The collector runs after the importer succeeds. It checks the London race date, pre-race stage, published off time and declaration roster. Collection closes at the scheduled off or 12:00 London time, whichever comes first. A failed import, a stored-card fallback, a next-day card and a later refresh cannot create a new observation through their workflows. Activation does not run a scraper, import data or start a scheduler.

Each race file contains the first eligible capture, the complete declaration roster with frozen roles, the provider's race, meeting, course, ride, horse and trainer identifiers, conditions and timestamps, and the imported payload. A hard link publishes the complete read-only file atomically under its provider race ID. A retry cannot replace that file. The reader verifies SHA-256 hashes for the capture and payload and binds the capture to its observation period.

Reports join the frozen provider identities to the existing full-result imports. Complete final-SP books supply market expectations and headline returns on the same starters. Results without complete books still contribute to settled starter and winner counts when outcomes are known. The four preliminary floors apply to complete-book stakes. Controls use common support as defined in the [historical research note](trainer-targeting-race-placement-research.md).

The [fixture report](trainer-targeting-fixture-report.md) uses projections of retained Sporting Life cards and full results for Newmarket `946368` and Punchestown `947809`. The test scenarios adjust the Haggas prize and construct the Mullins Grade 1 example from the Punchestown roster. Fixture captures run in temporary directories.
