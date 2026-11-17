# LaunchAgent database readiness failure — 15 November 2026

## Resolution — 09:19 GMT

**GO for future scheduled runs.** The user reports approving Bun's connection
permission in Postgres.app. At **2026-11-15T09:19:25.419Z**, a new readiness-only
native LaunchAgent using `/Users/neilrowland/.bun/bin/bun` 1.3.5, parent PID 1,
the project working directory and `--env-file=.env.local` successfully executed
the existing `databaseReady()` authenticated read-only transaction. It exited 0.
This resolves the observed permission failure; no PostgreSQL authentication,
wrapper code or security controls were changed by the agent.

Temporary diagnostic `uk.racing-analysis.readiness-diagnostic` was unloaded after
the test. Its output is retained at
`/private/tmp/racing-readiness-confirm-a973d5gz/`. Both real agents were independently
verified installed, loaded, enabled and idle, with `RunAtLoad=false`, `Disabled=false`
and their original calendar schedules. No reload is required. Collection's old
last exit code 69 and four historical runs remain recorded; settlement has not
run. Those historical records were preserved.

Next planned settlement: **15 November 2026 10:30 GMT**, reconciling 14 November
if it is the first attempted reconciliation. Next planned collection:
**16 November 2026 08:00 GMT**. No real workflow was manually invoked and no missed
collection was replayed. Normal first-run monitoring and existing safety limits
continue to apply. The historical diagnosis and NO-GO decision below describe
the state before permission approval and this successful native validation.

## Historical diagnosis — before permission approval

Decision: **NO-GO for unattended workflows until native launchd readiness passes.**
No wrapper/application/plist correction can be justified within the current
prohibition on changing PostgreSQL or Postgres.app connection permissions.
No code, database configuration, client permissions, installed schedules or research
evidence was changed. This operational diagnosis is the only new project file.

## Exact cause and evidence

The four collection invocations at 08:00, 08:10, 08:20 and 08:30 GMT each failed
all three readiness attempts (12 journal records, wrapper/launchd exit 69).
The wrapper records generic readiness failures and discards the exception;
there are no workflow stdout/stderr logs because no workflow started.

The existing PostgreSQL server log at
`~/Library/Application Support/Postgres/var-17/postgresql.log` records all twelve
corresponding rejected authentication attempts. For the first attempt, at
08:01:00.152 GMT it reports `Postgres.app failed to verify "trust" authentication`,
with detail identifying `auth_permission_dialog`, an `unknown process`, and the
PostgresPermissionDialog helper terminated with signal 15. It then reports
`canceling authentication due to timeout`. The server's approximately one-minute
authentication timeout occurs after the wrapper's three-second connection timeout;
the different timestamps do not imply different failures.

The server was running. Native `pg_hba.conf` inspection shows `trust` for local
connections and loopback IPv4/IPv6. Postgres.app adds per-client permission checking
to that method. A password in DATABASE_URL does not force password authentication
when the server selects `trust`.

See [Postgres.app's primary documentation](https://postgresapp.com/documentation/app-permissions.html):
unknown clients can be blocked; helper failure/timeouts prevent approval. Its
documented remedies are approving a recognised client in Postgres.app settings or
configuring password authentication for unknown processes. Neither was performed.
The helper's failure to approve the launchd caller is established; the internal
reason it could not identify/approve that process is not independently established.

## Environment comparison and safe reproduction

At approximately 09:12–09:13 GMT, the same exported `databaseReady()` function:

| Check | Native app/terminal-associated process with minimal environment | Native GUI LaunchAgent |
| --- | --- | --- |
| Working directory | `/Users/neilrowland/racing-analysis` | Same |
| Bun executable/version | `/Users/neilrowland/.bun/bin/bun`, 1.3.5 | Same |
| Bun project config | Root `bunfig.toml`, operational preload present | Same |
| Explicit dotenv loading | `--env-file=.env.local` | Same |
| DATABASE_URL available | Yes | Yes |
| Username/password present | Yes (values not emitted) | Yes (values not emitted) |
| Host/port/database | `127.0.0.1:5432/racing_analysis` | Same |
| Environment | Minimal PATH, HOME/USER/LOGNAME, Europe/London | Installed-agent PATH and Europe/London, native launchd defaults |
| Read-only readiness | PASS | FAIL: `CONNECT_TIMEOUT` |

The launchd reproduction used a distinct temporary
`uk.racing-analysis.readiness-diagnostic` service, PID 25555, parent PID 1.
Its only action was importing and calling `databaseReady()`; it never invoked
`runScheduled`, collection, settlement, scraping or capture. The diagnostic plist
had `RunAtLoad=false`, no calendar and `KeepAlive=false`. Only that diagnostic was
explicitly started, then unloaded in cleanup. Output is retained in the private
directory `/private/tmp/racing-readiness-only-e992etug/`.

The native probe rules out missing URL, dotenv, working directory, host/port and
Bun configuration as the observed cause. It also demonstrates why a successful
readiness call from an interactive/app-associated process did not validate the
LaunchAgent's Postgres.app permission context during activation.

## Validation and research safety

- The mocked bounded-readiness retry test uses injected failures, temporary logs
  and an inert command mock. It verifies three attempts, exit 69, no workflow call
  and later readiness retry eligibility. The initial sandbox run could not verify
  its own PID/start identity because native `ps` was unavailable; the native rerun
  passed: 1 test passed, 0 failed (25 unrelated tests filtered out).
  No operational lock was created by the
  test; fixture locks are confined to temporary test directories.
- All 141 active source pins, including frozen model artifacts, and all five
  original evidence pins validate after diagnosis.
- Installed `RunAtLoad=false` remains verified for both real agents. Collection
  is loaded/idle with runs=4, exit 69; settlement is loaded/idle with runs=0.
- No real racing workflow, backfill, rearming, repricing, settlement, PostgreSQL
  restart, configuration change, commit or deployment was performed.

## Correction boundary, reload and next scheduled run

No safe wrapper-only fix was established. Increasing connection timeouts would
wait longer for the same permission failure; setting another URL/password or
misrepresenting the responsible application is not an appropriate correction.
Connection permission/authentication changes require a separate authorised scope.
In particular, do not disable the Postgres.app permission guard as a workaround.

**Reload required now: no**, because no installed configuration or executable was
changed. Both real agents remain enabled with their existing schedules. No missed
collection was replayed. If only Postgres.app permission/authentication is corrected
later, validate using a readiness-only native LaunchAgent before permitting real
work; merely passing a terminal check is insufficient. Whether a reload is needed
for a future correction depends on whether that correction changes the plist.

The 10:30 settlement agent shares the same Bun command, working directory,
dotenv loading, endpoint and `databaseReady()` implementation. Its native
connection is expected to fail similarly while the permission problem persists.
No settlement run was triggered as a test. The first actual reconciliation has
not been validated. Do not manually rerun collection or retrospectively capture
today's missed races. Recommendation remains NO-GO pending an authorised permission
or authentication correction and successful native launchd read-only validation.
