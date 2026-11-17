# Controlled activation — 15 November 2026

Both user LaunchAgents were activated at **2026-11-15 06:05:32.985486 GMT
(UTC+00:00), Europe/London**, in `gui/501`. This is an operational scheduling
timestamp only; no research epoch was changed. The machine-readable
[receipt](activation-2026-11-15.json) records effective launchd output, installed
plist configurations and hashes, wrapper hashes, runtime/retention configuration,
initial status and the source/research baseline.

| Agent | Verified state | Daily London schedule | Next planned run |
| --- | --- | --- | --- |
| `uk.racing-analysis.collection` | Installed, loaded, enabled, idle; runs=0 | 08:00, 08:10, 08:20, 08:30 | 15 November 2026 08:00 GMT |
| `uk.racing-analysis.settlement` | Installed, loaded, enabled, idle; runs=0 | 10:30, 13:00, 16:00, 19:00, 23:00 | 15 November 2026 10:30 GMT |

Installed copies in `/Users/neilrowland/Library/LaunchAgents` have
`Disabled=false`, `RunAtLoad=false`, `KeepAlive=false`, owner `neilrowland`/501
and mode `0644`. Both passed `plutil -lint` before bootstrap. Calendar intervals
were preserved and verified in effective launchd registrations. Templates remain
disabled and retain their historical `RunAtLoad=true`; installation must override
that setting. No kickstart, manual workflow or catch-up execution was performed.

## Readiness and immediate verification

- Correct checkout: `/Users/neilrowland/racing-analysis`, HEAD
  `c21893c02f839398fef0cf74189639c6a41487d2`. No application changes, commit or deployment.
- Authenticated read-only readiness passed before and after installation against
  `127.0.0.1:5432/racing_analysis`; native server identified as PostgreSQL 17.11
  via Postgres.app. Other active database sessions: none at preflight.
- All 141 source pins, eight frozen model fingerprints and five original evidence
  pins passed. Hurdle V2 remains production; V3 remains shadow-only.
- Source/research baseline at 06:05:02.253 GMT: all 1,112 files remained unchanged
  at 06:05:58.165 GMT after installation. This certifies the installation interval,
  not historical writer attribution. Existing dirty production ledger was preserved;
  its inspected diff contains settlement outcomes. The earlier Stage B audit's
  unknown writer remains a historical limitation, not a repaired baseline.
- No active workflow, unfinished automation history or shared lock before/after.
  Existing dev server started 14 November at 15:12:40, after guard changes; its
  compiled Today route contains `withOperationalAccess`. Wrapper, Bun preload,
  Today routes and Python guards use the same canonical shared-lock protocol.
- No competing racing workflow/scheduler found in process inventory, user crontab
  or inspected user/system LaunchAgent/LaunchDaemon configuration. A legacy
  PostgreSQL 15 service registration is idle with exit status 1; the healthy
  Postgres.app 17 endpoint was independently verified. No DB settings changed.
- Log root is owned by user 501, mode `0700`, writable via a temporary probe,
  with approximately 190 GiB free. Probe left no file. Log root remained empty
  after loading; both agents reported runs=0 and no previous exit status.
- Mac awake and console user logged in; network reachable on en1; native timezone
  link is Europe/London. No power, network or startup settings changed.

The user provisionally accepted 90-minute collection and 45-minute settlement
ceilings as safety limits. They are not measured workflow durations. Wrapper
termination grace is ten seconds; LaunchAgent exit timeout is thirty seconds.

## Initial automation status

`bun run scripts/local-automation.ts status` at 06:05:49.171 GMT reported both
agents **Loaded, not running**, with **No executions recorded** for collection
and settlement. Positive/Neutral V2: 55 captured, 47 resolved, 8 pending;
Shadow V2 and Market Edge V2: each 35 captured, 31 resolved, 4 pending.
Cross-ledger gaps among recorded captures: 0. Market Edge incomplete books:
17/35; partial raw quote coverage: 2 Shadow books. Pending production books: 8.
All three cohort latest-capture timestamps remain 14 November 04:46:49.027Z.

The status command still emits a hard-coded historical
`Activation readiness: NO-GO ... drift/runtime review pending` banner.
It is not a dynamic activation gate and predates this authorised installation.
Its live agent states are accurate. No code was changed to suppress that warning.

## First scheduled collection inspection

After 08:00, from the project root:

```sh
/Users/neilrowland/.bun/bin/bun run scripts/local-automation.ts status
/Users/neilrowland/.bun/bin/bun run scripts/local-automation.ts status --json
launchctl print gui/501/uk.racing-analysis.collection
tail -n 30 "$HOME/Library/Logs/RacingAnalysis/executions.jsonl"
```

The status commands read logs, frozen ledgers and launchd state only; they do not
contact PostgreSQL or run racing work. In the journal, find today's collection
`started` event, then its matching invocation `id` with terminal `success`,
`partial` or `failed`. Absence of a terminal event means unfinished/unknown,
not successful. `launchctl` shows running PID, run count and wrapper last exit code.
Journal terminal `code` is the workflow result; launchd's last exit code is the
wrapper result. Neither should be inferred from a skip code 0 alone.

Actual wrapper workflow elapsed time is terminal `at` minus matching `started.at`
(includes post-work monitoring before the terminal record). For the latest role:

```sh
/Users/neilrowland/.bun/bin/bun -e 'import {readEvents,LOG_ROOT} from "./scripts/local-automation"; const events=await readEvents(LOG_ROOT); for(const role of ["collection","settlement"]){const s=events.filter(e=>e.role===role&&e.status==="started").at(-1); const end=s?events.find(e=>e.id===s.id&&["success","partial","failed"].includes(e.status)):null; console.log(JSON.stringify({role,start:s??null,end:end??null,elapsedSeconds:s&&end?(Date.parse(end.at)-Date.parse(s.at))/1000:null}));}'
```

Inspect that invocation's `<id>.stdout.log` and `<id>.stderr.log` under
`~/Library/Logs/RacingAnalysis` for source acquisition failures, stale-card fallback,
withheld quotes, research warnings, failed stages and timeouts. Inspect
`overlap-collection.json`, `overlap-settlement.json`, `last-error.json` and
`workflow.lock` if present. Status JSON exposes readiness failures, overlap
indicators, unfinished invocations, missed windows and retention errors.
`database_unreachable` records an access/configuration failure and does not alone
establish a server outage.

Independent authenticated read-only database readiness, without executing a role:

```sh
/Users/neilrowland/.bun/bin/bun --env-file=.env.local -e 'import {databaseReady} from "./scripts/local-automation"; await databaseReady(); console.log("Authenticated read-only database readiness PASS");'
```

Compare status JSON `evidence.production` counts and `latestCapture` with this
receipt's baseline to identify new production captures. For today's detailed books,
read `data/research/tissue-generation-forward-2026-11.json` and the three existing
Collection V2 ledgers under `data/research/prospective-epochs-2026-11-11/`.
Match by exact `raceId` **and** `capturedAt`; Hurdle production should have matching
V3 Shadow and Market Edge companions, while Positive/Neutral spans all families.
Status JSON `evidence.gaps` lists missing recorded companions/source identities;
`incompleteMarkets` and `partialRawQuoteBooks` identify incomplete frozen books.
Inspect frozen `completeMarket`, runner prices and quotes in those existing rows.
Compare racecard coverage separately using stored cards: zero recorded gaps does
not prove every eligible race was captured, and no new database/card acquisition
was added to status. Do not use a Today-page visit as a read-only monitoring probe:
that page can perform guarded operational work when idle.

The 08:10/08:20/08:30 triggers retry readiness only until a morning workflow has
started. They never replay an attempted morning workflow, including a failed or
partial one. Do not manually rerun failures or retrospectively capture missed races,
repair incomplete books, replace prices/probabilities, reset/rearm or backfill.

## Settlement inspection

After 10:30, use the same status, journal and per-invocation logs, plus:

```sh
launchctl print gui/501/uk.racing-analysis.settlement
```

The first settlement attempt should show `mode=after`, `date=2026-11-14`, followed
by its matching terminal event. Verify import/settlement stage output, elapsed time,
code, pending/resolved changes and any warnings. At 13:00, 16:00, 19:00 and 23:00,
expect `mode=live`, `date=2026-11-15` once yesterday's reconciliation was attempted.
If the 10:30 attempt never started, the first later eligible trigger reconciles
yesterday instead. A failed attempted reconciliation is not automatically replayed.
Safe skips and lock conflicts are not successful reconciliation. Existing frozen
observations may receive ordinary settlement outcomes; missed captures remain absent.

## Safe rollback

Prefer an idle interval. Disable both first, then unload both:

```sh
launchctl disable gui/501/uk.racing-analysis.collection
launchctl disable gui/501/uk.racing-analysis.settlement
launchctl bootout gui/501/uk.racing-analysis.collection
launchctl bootout gui/501/uk.racing-analysis.settlement
launchctl print-disabled gui/501
```

Confirm `launchctl print gui/501/<label>` reports service absent for each label.
These commands preserve installed files, logs and all research data. An urgent
bootout during work can interrupt committed stages; inspect processes, descendants,
terminal records and coverage afterwards. Never remove an operational lock until
ownership, start identity, process/descendant status and possible partial writes
have been independently verified. No lock removal is part of this procedure.

## Remaining limits

The first scheduled execution has not been observed. Awake/logged-in operation,
network access and Postgres.app readiness must persist. Sleep/wake can delay/coalesce
calendar events; prospective opportunities cannot be restored. Runtime caps are
unmeasured and timeout may leave partial commits. The cooperative guard covers
supported project paths; arbitrary external runtime/configuration bypasses do not
join it. Cross-ledger commits are separate, crashes can retain locks, and existing
incomplete books remain incomplete. No outbound alerting or automatic repair was
enabled. This task stopped after installation and immediate verification.
