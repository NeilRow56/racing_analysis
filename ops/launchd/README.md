# Local automation — pre-activation safety review

**Nothing in this directory is installed or loaded. Both templates have `Disabled=true`.
Do not activate them during this review. Activation recommendation: **NO-GO** until
runtime acceptance and the Stage B ledger hash drift are reviewed. Shared exclusion is now implemented; see [Stage B](../concurrency/STAGE-B.md).** `RunAtLoad=true` means a later deliberate
activation can immediately execute operational work within the wrapper's window.

The wrapper and shared operational guard are outside the active source-pin graph. Stage B adds Today/Python entry guards and a Bun project preload without editing pinned collectors, `package.json`, models, epochs or rules. The separate prior Today display lookup refinement is retained.
Hurdle V2 remains live; V3 remains shadow-only. Existing incomplete market books
are never repaired, repriced or replayed by this infrastructure.

## Proposed schedule (London time)

| Job | Calendar triggers | Existing command selected |
| --- | --- | --- |
| Collection | 08:00, 08:10, 08:20, 08:30 | `bun run research:morning YYYY-MM-DD` at most once after readiness succeeds |
| Settlement | 10:30, 13:00, 16:00, 19:00, 23:00 | First invocation each day: `research:after YESTERDAY`; subsequent invocations: `research:live TODAY` |

The extra collection triggers retry **readiness only** if no workflow started.
Once a morning workflow starts, no later trigger replays it, even after failure,
timeout, fallback or a partial research hook. Inspect it manually. This avoids
blindly repeating scraping or creating additional prospective observations.
Morning acquisition fallback retains existing semantics, including withheld stale
quotes; it is reported as partial and is not retried with force refresh.

Collection accepts a delayed login/wake invocation only from 08:00 to before
11:00 London; later attempts are recorded as missed, never backfilled. Existing
collectors still enforce each race's pre-off guard. They can still freeze a market
with missing prices: complete-market waiting is a separate future protocol.

Settlement accepts login/manual invocations from 09:00 to midnight London. The first
calendar trigger is 10:30, allowing headroom after the 08:30 readiness retry and a
90-minute collection ceiling. A late wake can still overlap; the shared lock skips
the competing invocation. A missed 10:30 run
uses the first later invocation for yesterday; today's results wait for the next
trigger. A failed yesterday reconciliation is reported for review, not replayed.
The report exposes the actual `mode` and racing date of the last success. Repeated
live-settlement starts in the same London hour are suppressed, including failed
attempts. There is no whole-workflow retry loop; the next scheduled hour is a new
bounded results/settlement pass. Yesterday's reconciliation is attempted once.
These coarse passes deliberately avoid a full-day import every few minutes:
the existing result importer does not skip existing full results by default.
Result settlement latency can be several hours. The normal `research:live/after`
commands import results and settle existing rows; neither recaptures missed races.

No `night`, `late`, `today:refresh`, force-refresh, independent Shadow/Market Edge
sync, or display-price refresh is scheduled. Morning already imports cards and
routes newly accepted production books to the armed replacement cohorts. Existing
manual/browser triggers remain unchanged and are **not** covered by this wrapper's
orchestration lock; existing per-ledger locks still apply to them.

## Execution and safeguards

- Absolute Bun: `/Users/neilrowland/.bun/bin/bun`; project working directory:
  `/Users/neilrowland/racing-analysis`.
- Both templates explicitly load `.env.local`; children receive the same environment,
  an explicit executable PATH, and `TZ=Europe/London`. Transient acquisition guard
  variables are removed before a new workflow. No credentials belong in plist files.
- launchd calendar times use the **Mac's local timezone**; confirm it is Europe/London
  before future activation. `TZ` controls wrapper/workflow date arithmetic but does
  not change launchd's calendar timezone. Summer dates use `Intl` London conversion.
- Readiness authenticates against the configured `127.0.0.1:5432/racing_analysis`
  endpoint and executes a read-only transaction. Three attempts, 3-second connection
  and statement timeouts, with 2/4-second backoff. No service commands, migrations,
  repairs or automatic server switching. Endpoint drift fails readiness.
- A readiness failure means access/configuration failure, **not proof of a server
  outage**. Codex sandbox refusal is an established possibility. No native probe or
  permission escalation is performed automatically.
- Atomic exclusive `workflow.lock` is shared by both roles. Stale locks are not
  automatically stolen. Check owner PID, descendants and ledger state before any
  future manual recovery. A killed wrapper can leave this lock intentionally.
- Morning has a 90-minute ceiling; settlement has a 45-minute ceiling. Timeout or termination sends TERM,
  then KILL after ten seconds to its process group, including descendants. LaunchAgent
  ExitTimeOut is 30 seconds to allow wrapper shutdown. The lock
  is held through termination. A nonzero child exit, timeout, or research-warning
  output becomes failed/partial, with no automatic morning workflow replay.
- Read-only evidence checks before/after verify active epoch source pins and detect new exact-capture cross-ledger gaps.
  Failure to establish a pre-run baseline blocks execution. Post-run monitor errors
  or new gaps mark a successful child process as partial. Known existing gaps are
  reported without reinterpretation or replay. Keyword warning detection is
  conservative, not a proof that every research hook completed correctly.
- Per-invocation stdout/stderr logs and a retained operational execution journal
  live in `~/Library/Logs/RacingAnalysis`, separate from all research evidence.
  Execution logs record wrapper return codes. Known database URL/password values
  and PostgreSQL URLs are redacted from captured workflow output. Oversized unbroken
  output lines are omitted. No environment dumps are recorded. Workflow stdout and
  stderr are captured directly by the wrapper. launchd's own stdout/stderr target
  `/dev/null` to avoid a second, unbounded log stream. Fatal wrapper errors are recorded
  in bounded `last-error.json`; failures before JavaScript starts remain visible through
  launchd's last exit code, when inspection is permitted. There is no persistent transcript
  of Bun loader failures before the wrapper starts; investigate those in an approved
  native diagnostic, not by running collection as a probe.
- Code 0: success or safe skip; 65: missed window; 69: readiness exhausted; 70:
  partial research; 71: command/logging failure; 75: overlap; 78: monitoring unavailable.
  The journal distinguishes skips from success. `started` without a terminal record
  is reported as unfinished and suppresses collection replay.

These are user LaunchAgents: no operation while logged out. The Mac must be awake,
logged in, network-connected and Postgres.app ready. Calendar sleep events may run
on wake, but cannot restore missed prospective opportunities. Login runs perform
window checks; shutdown and logout can interrupt workflows. No power settings or
database startup settings are changed. `KeepAlive=false` prevents restart storms.

## Read-only local status

Run from the project directory (no `--execute`):

```sh
/Users/neilrowland/.bun/bin/bun run scripts/local-automation.ts status
```

The default is a compact terminal summary with AUTOMATION, RESEARCH COLLECTION and
DATA QUALITY sections. It uses counts instead of race IDs, shows captured/resolved/
pending and complete/incomplete frozen-market books separately, and lists the latest
capture time per Collection V2 cohort. Empty automation history says **No executions
recorded**, not zero failures. Elapsed windows with no history do not imply an agent
was scheduled and failed.

The complete machine-readable report, including all original identifier lists and
diagnostic fields, is available with:

```sh
/Users/neilrowland/.bun/bin/bun run scripts/local-automation.ts status --json
```

Activation inspection uses bounded, read-only `launchctl print` calls and checks for
installed user plists. It does not load, enable or change any job. A verified absent
service with no installed plist/history is **Not yet activated** (current state,
not a historical assertion). A loaded idle service is **Loaded, not running**;
permission failures or inaccessible GUI domains are **Unknown / unverifiable**.

This command reads existing logs/frozen JSON and local launchd state only. It does not create log
directories, contact PostgreSQL, scrape, predict, capture or settle. It reports:

- last successful wrapper collection/settlement, failed/partial executions and
  readiness failures;
- today's collection window without a successful wrapper run, a settlement heartbeat
  older than five hours after 11:30 London (allowing the first 10:30 pass), unfinished invocations and lock metadata;
- incomplete and partially quoted production books, pending/overdue settlements,
  Market Edge pending and resolved complete-market counts;
- exact-capture production→Shadow, production→Positive/Neutral and Shadow→Edge gaps,
  plus missing production/Shadow source identities.

It identifies the fixed, currently armed Collection V2 paths separately from V1.
Later production force-refresh books can legitimately lack a second research row
because cohorts freeze first-per-race. Gap lists are review candidates, not instructions
to backfill. Ledger reads are individually atomic, not one transactional snapshot;
recheck transient gaps after activity finishes. Wrapper history does not establish
manual/browser execution history or prove launchd is loaded. Missing logs remain
unknown, not fabricated historical successes. Corrupt execution journals fail closed.

The capture-gap check covers recorded production and companion observations only.
It does not establish coverage of every current racecard, or verify Today-page display
lookup. For example, the 14 November Somersby 12:42 and QuinnBet Conditional Jockeys'
Handicap 12:07 at Uttoxeter both have exact Collection V2 companions at
04:46:49.027Z. The prior Today lookup read only the closed original V1 ledger, causing
unavailable comparisons despite zero capture gaps. The display now reads both ledgers,
preferring the existing replacement observation by race ID and retaining the existing
off-time/horse/runner identity guards. No fresh V3 calculation is substituted.

A future separate read-only racecard coverage report could compare declared hurdle
cards with captured production books, record exclusions and separately classify absent
production, absent companions, changed off/runner identity and display-source errors.
It must not redefine prospective membership or fill missing observations. This is a
recommendation only; no live database/racecard acquisition was added to status.

## Retention (implemented, not run against operational logs during validation)

Maintenance runs only from an explicit operational invocation while owning the shared
lock, before and after work. The read-only status command never prunes files.
`scripts/local-automation-retention.ts` defines the tested settings:

| Item | Policy |
| --- | --- |
| Per-execution stdout/stderr | 8 MiB each plus a small truncation marker; keep draining the child; mark run partial if output is truncated |
| Managed execution logs | Up to 30 days, or 256 MiB combined, removing oldest eligible files first |
| Protected logs | Current invocation, last 24 hours, invocations within the last two days, unfinished invocations and the last successful invocation per role |
| Execution journal | 90 days / 20,000 records / 16 MiB, with a small reserve for the current invocation |
| Protected journal records | Last successes, unfinished invocations, last two days' records (including current collection replay guards) |
| Other metadata | One retention summary, one last-error file and one latest-overlap indicator per role, atomically replaced |

Only UUID-named `*.stdout.log`/`*.stderr.log` files created by this wrapper are deletion
candidates. Unknown files, existing launchd/application logs, backups and subdirectories
are untouched. Symlinked log roots, symlinked files and hard-linked files are rejected
or skipped. Recognised crash temporaries are removed only after 24 hours and an owner
PID lookup reports ESRCH; alive/unverifiable owners are never removed. Workflow locks
are never stolen or age-expired automatically. Never repoint this directory at evidence.

The last two days and last successes can outlive age limits deliberately. If protected
logs/history cannot fit the budget, new work is blocked and status reports the problem;
protected files are not deleted to force compliance. Unknown/legacy files are outside
the managed byte budget and may require separate human review. The policy bounds
wrapper-generated growth during normal operation; a machine that never invokes any
maintenance cannot prune, and no process can guarantee storage durability after a crash.

Journal compaction is atomic under the workflow lock. A lock loser writes only its
role's latest-overlap metadata file, not the journal; this avoids lost concurrent appends
during compaction. JSON status retains the identifiers of retained history; bounded
retention is not an immutable research ledger or an unlimited execution archive.

Status shows last successful collection/settlement independently of the latest failure,
timed-out runs, readiness failures, missed collection windows, overdue settlement
heartbeat, overlap indicators, unfinished runs, local infrastructure errors, retention
overflow, launchd exit codes and research coverage gaps. Missing/corrupt history is
unknown, not success or zero failures. Expired-window/heartbeat checks are indicators;
without a confirmed activation epoch they cannot prove every missed calendar trigger.

No outbound alert service is configured. A simple optional local macOS notification
could use `osascript` with a fixed non-sensitive message when a new failure appears,
deduplicated by invocation ID. This has not been implemented or enabled. It requires
notification permission and a logged-in GUI session. Off-machine heartbeat monitoring
would be needed for an iMac that remains off/logged out; that is a separate approval.

## Concurrency and runtime findings

Stage B now shares `workflow.lock` across the wrapper, Today request/actions, Bun
operational commands through project preload, and direct Python operational CLIs.
Nested callers verify token, live owner start identity and process ancestry. Busy
Today renders stored data; missing V3 observations remain unavailable. Crash/legacy
locks fail closed for manual review, without automatic stale takeover or replay.
See the [complete caller inventory, design, validation and remaining risks](../concurrency/STAGE-B.md).

Run Bun operational commands from the project root with `bunfig.toml` loaded.
Alternative runtimes/configuration bypasses are not supported operational entry paths.
Pre-existing processes must use guarded code before a future activation. The Stage B
hash audit observed drift in two already-dirty live ledgers; source pins remain ACTIVE,
but unchanged live evidence cannot be certified. Neither ledger was rolled back.

The former 20-minute cap was not justified by a full workflow runtime measurement.
Morning has multiple serial imports/research steps before final capture. The source
client uses 14-second request timeouts; racecard retries include bounded network/5xx
retries and backoff, plus the existing two-second inter-request delay. Large cards,
status reconciliation, historical queries and database waits add time. A 90-minute
collection / 45-minute settlement cap is conservative headroom, not a measured SLA.
No live timing run was performed. Review historical successful durations and longest
stage before accepting these ceilings; a timeout may leave partially committed source
imports/hooks and is always a review event, not an automatic retry/repair instruction.

This review's NO-GO applies to unattended activation alongside the running application.
Do not infer activation readiness from passing unit tests or healthy source pins.

## Future activation — conditional procedure, NOT executed

Review proposed timing and the prospective scheduling start date first. Activating
an additional caller can change future first-capture times while preserving frozen
models/rules and every previous observation. Review wake/login behaviour and the
runtime ceilings against real historical runtimes before enabling it.

Exact initial procedure after a separate GO decision and user approval:

1. Confirm Mac timezone is Europe/London, awake/logged-in operation and Postgres.app
   readiness using a permitted read-only native check. Verify Bun, project directory,
   `.env.local`, Python virtual environment and installed dependencies; no install or
   migration is part of activation.
2. Review Stage B caller coverage, runtime configuration and observed ledger drift; inspect
   pending local diffs and verify source pins. Never revert live settlement updates to
   make the working tree look clean. Accept the runtime limits and retention policy.
3. Record a new *operational scheduling* start time in the review record, outside research
   manifests. Activation can become the first caller and change future capture timing;
   this is not permission to rearm, rewrite or improve old observations.
4. Choose a time before 08:00 London with no in-flight work. Run the read-only status
   command. Do not delete an existing lock as an activation step.
5. Install/activate copies using the commands below. RunAtLoad should skip collection
   before its window; first planned work is 08:00. Do not use a real workflow as a test.
6. Inspect launchd state and the next scheduled run's journal/status. A partial result,
   unexpected caller or new cross-ledger gap stops the trial for review, without replay.

After approval, from the project directory, install **copies**, leaving templates disabled:

```sh
mkdir -p "$HOME/Library/Logs/RacingAnalysis" "$HOME/Library/LaunchAgents"
chmod 700 "$HOME/Library/Logs/RacingAnalysis"
for job in collection settlement; do
  cp "ops/launchd/uk.racing-analysis.$job.plist" "$HOME/Library/LaunchAgents/uk.racing-analysis.$job.plist"
  /usr/libexec/PlistBuddy -c 'Set :Disabled false' "$HOME/Library/LaunchAgents/uk.racing-analysis.$job.plist"
  plutil -lint "$HOME/Library/LaunchAgents/uk.racing-analysis.$job.plist"
  launchctl enable "gui/$(id -u)/uk.racing-analysis.$job"
  launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/uk.racing-analysis.$job.plist"
  launchctl print "gui/$(id -u)/uk.racing-analysis.$job"
done
```

**Bootstrap may run work immediately because RunAtLoad is true. Do not use this
as a validation test.** Do not use `kickstart` as a connectivity probe.

Future rollback (prefer an idle interval after the current workflow finishes):

```sh
for job in collection settlement; do
  launchctl disable "gui/$(id -u)/uk.racing-analysis.$job"
  launchctl bootout "gui/$(id -u)/uk.racing-analysis.$job"
done
```

Disabling/unloading does not delete logs or evidence. Unloading during execution
can interrupt source imports or research hooks. For an urgent stop, run the same
disable/bootout commands and expect TERM/KILL cleanup; inspect last result, descendants,
lock and coverage afterwards. `disable` is not a substitute for `bootout` of an already
loaded service. Never remove a lock solely because its timestamp is old or PID absent:
descendants/partial writes may remain. Do not remove operational history/replay guards,
rearm cohorts or roll back database/evidence as part of disabling. Templates stay disabled.

## Non-operational validation

```sh
bun test scripts/local-automation.test.ts scripts/local-automation-retention.test.ts scripts/run-research-workflow.test.ts
bun x tsc --noEmit --incremental false
bun x eslint scripts/local-automation.ts scripts/local-automation.test.ts scripts/local-automation-retention.ts scripts/local-automation-retention.test.ts
plutil -lint ops/launchd/uk.racing-analysis.collection.plist
plutil -lint ops/launchd/uk.racing-analysis.settlement.plist
```

Wrapper tests inject mocked readiness and commands. Process tests launch harmless
Bun dummy processes in temporary directories, including a TERM-resistant descendant.
They never invoke real collection/settlement or database readiness. No activation,
bootstrap, enable, kickstart, scraper or operational dry run belongs in Stage A.
