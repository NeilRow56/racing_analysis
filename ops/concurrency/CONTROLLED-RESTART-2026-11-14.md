# Stage B controlled restart and activation preparation

Review completed 14 November 2026, approximately 14:21 Europe/London (UTC).
Scheduler activation was neither authorized nor performed in this task.

## Restart result

Prechecks passed: no collection/settlement process, no operational lock, no unfinished
wrapper invocation, zero recorded wrapper executions, and the port 3000 listener and
all development processes belonged to this checkout. The open browser connection was
idle; the latest logged Today result refresh had completed. Pending research outcomes
are stored observations, not an in-flight workflow, and were left untouched.

The old Bun/Next processes 38776, 38777, 38778 and worker 38956 exited after SIGTERM
to the Next CLI. No forced termination was required. Port 3000 was verified free.
The existing project-root `bun run dev` command restarted at 14:18:48 London, reporting
Next.js 16.3.4, `.env.local`, port 3000 and readiness in 639 ms.

New processes at verification:

| Role | PID |
| --- | --- |
| Bun dev command | 39939 |
| Next CLI | 39940 |
| Next server / port 3000 listener | 39941 |
| Development workers | 39943, 39944, 39945, 39947, 39948 |

The three main processes' working directories match this checkout. Environment files
and database configuration were retained unchanged; PostgreSQL was not restarted.

## Read-only verification

- Home route: HTTP 200, expected Racing workspace content.
- Database: existing `databaseReady()` passed its bounded read-only transaction against
  the configured local racing_analysis database. No operational wrapper was executed.
- Today was not requested by a verification command because its normal route can mutate.
  An already-open browser automatically reconnected and requested Today after restart.
  A temporary shared lock owned by a separate safety process was held throughout that
  request; Today returned HTTP 200. No result-refresh log appeared in the new session.
  The safety owner released its lock normally after completion; final lock is absent.
- The current development SSR source map contains an exact byte match for the current
  `src/lib/racing/operational-lock.ts`; compiled Today calls `withOperationalAccess`.
  Cached chunk mtimes alone were not used as proof. Bun project preload configuration
  and Python guards remain present. No live capture/settlement was used as a lock test.
- Existing mocked Today test: 1 passed, 0 failed. It renders stored data and verifies
  zero mutations for the page and busy actions. Live browser visual inspection was
  unavailable; the live route result, build inspection and mocked rendering are the
  evidence for the stored-data path.
- All 141 source pins remain ACTIVE; all five original-evidence hashes match.
  A task-local baseline of 1,098 existing source/research/configuration/template files
  showed zero hash changes during restart verification, including the live ledgers,
  `.env.local`, package files and disabled templates.
- Final read-only status at 14:20:37 UTC: zero executions, no unfinished invocations,
  no operational lock, unchanged evidence summary and zero exact-capture companion gaps.
  No collection, scraping, capture or settlement process was started by this task.
- Both templates pass `plutil -lint` and remain `Disabled=true`. Both user services
  were absent in read-only launchctl inspection; no installed plist or history found.

The user's completed ledger-integrity review resolves the prior outcome-only drift
concern. Historical NO-GO wording in STAGE-B.md, hash-audit.json, launchd/README.md
and the status formatter predates that resolution; it is not a fresh pin failure.
Those historical files and executable status wording were not rewritten in this task.

## Activation checklist — preparation only

1. Separately approve a future activation window, preferably before 08:00 London.
   Record the actual operational scheduling start timestamp with UTC and Europe/London
   offset, approver, selected schedules and runtime acceptance in a new operational
   review record under ops. Do not reuse or edit a research epoch activation timestamp.
   No scheduling start timestamp exists from this task because nothing was activated.
2. Confirm the Mac timezone remains Europe/London (verified here via /etc/localtime).
   launchd calendar triggers use system local time; wrapper TZ does not override that.

   | Role | Proposed London triggers | Work selected by existing wrapper |
   | --- | --- | --- |
   | Collection | 08:00, 08:10, 08:20, 08:30 | Morning once after readiness; later triggers retry readiness only if no workflow started |
   | Settlement | 10:30, 13:00, 16:00, 19:00, 23:00 | First daily invocation reconciles yesterday; later invocations settle today |

   Collection wake/login window is 08:00 to before 11:00; settlement window is 09:00
   to midnight. Missed collection is not backfilled. A started morning or yesterday
   reconciliation is not blindly replayed after failure. Inspect failures manually.
3. Review `RunAtLoad=true` on both templates: bootstrap/login can immediately attempt
   work inside the permitted window. Activate before 08:00 if avoiding immediate work
   is required. Do not use bootstrap or kickstart as a diagnostic. `KeepAlive=false`;
   `ExitTimeOut=30`. Leave repository templates disabled; any later activation uses
   separately reviewed installed copies only.
4. Verify absolute Bun executable, project directory, existing .env.local, Python venv
   and dependencies without installing or migrating. Confirm database readiness using
   the existing read-only probe. Never restart PostgreSQL as an activation step.
5. Verify ~/Library/Logs/RacingAnalysis is owned by neilrowland, not a symlink and mode
   0700 (ownership/mode passed here); operational files should be mode 0600. Check disk
   space, writability and retention budgets at activation time. Do not point logs at
   research evidence. launchd stdout/stderr are /dev/null; loader failures require
   inspection of launchd exit status. No outbound alerting is configured.
6. Recheck idle state, no owner/unfinished workflow, active source pins and evidence
   monitor baseline immediately before activation. Do not delete a lock as preparation.
   Supported Bun operational commands require project-root bunfig preload; direct
   Python CLIs and Today use the shared guard. Current application restart is complete.
7. Keep the iMac awake, logged in, network connected, and Postgres.app ready. User
   LaunchAgents do not run while logged out. Sleep can delay triggers until wake;
   late wake cannot restore missed prospective opportunities. Do not change power or
   database startup settings as part of activation.
8. Explicitly accept or independently substantiate collection's 90-minute ceiling and
   settlement's 45-minute ceiling before activation. These are unvalidated headroom,
   not measured SLAs; no live timing run was authorized here. Review historical stage
   durations when available. Timeout uses TERM then KILL after ten seconds for the
   process group and can leave partial database imports or evidence commits. It is a
   review event, never permission to replay, repair, reprice or rearm.
9. After a separately authorized activation, inspect both service states and first
   scheduled executions, actual mode/date, start/terminal records, duration, exit codes,
   source pins, companion gaps, overdue pending outcomes and settlement heartbeat.
   Watch overlaps, readiness failures, partial/failed runs, retained locks, unbounded
   output/retention errors and unfinished starts. Distinguish safe skips from success.
   Read-only status does not prove every expected trigger occurred; use the operational
   scheduling timestamp and journal together. Recheck after each first-day trigger.
10. Immediate rollback if unexpected work, partial results or new gaps appear: disable
    both jobs to prevent new starts, then boot out both services. Prefer an idle moment;
    emergency bootout can interrupt current work and must be reviewed as partial.
    Preserve logs and any remaining lock; inspect owner and descendants before any
    manual recovery. Remove installed copies only after jobs are unloaded. Do not
    revert research evidence, replay missed work, or restart PostgreSQL.

    Future rollback commands only — NOT RUN:

    ```sh
    launchctl disable "gui/$(id -u)/uk.racing-analysis.collection"
    launchctl disable "gui/$(id -u)/uk.racing-analysis.settlement"
    launchctl bootout "gui/$(id -u)/uk.racing-analysis.collection"
    launchctl bootout "gui/$(id -u)/uk.racing-analysis.settlement"
    ```

## Recommendation

CONDITIONAL GO for a separately authorized, monitored Stage B activation once the
90/45-minute runtime ceilings are explicitly accepted or substantiated, and the future
operational start time/window is recorded. Restart, database, shared-lock runtime
presence and source-pin checks passed. No remaining restart or pin-integrity blocker
was found. Live runtime ceilings remain unvalidated. Stop before scheduler activation.

No agents were installed, enabled or bootstrapped. No database data/configuration,
models, frozen evidence, epochs, research rules or pin manifests were changed. No
rearm, backfill, repricing, commit or deployment occurred.
