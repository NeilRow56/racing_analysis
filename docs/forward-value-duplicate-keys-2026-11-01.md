# Forward Value duplicate-key investigation — 1 November 2026

## Findings

Both stored duplicate quotes and an insufficient React key are present. This
does not establish that the morning workflow ran twice.

The original key in both `SnapshotCell` and `MarketPriceCell` was
`${quote.bookmakerId}:${quote.bookmakerName}:${quote.decimalOdds}`. Identical
quotes collide within a single list. Adding race, stage, or capture time alone
would not fix identical quotes within the same snapshot.

Read-only inspection of `data/research/forward-value-v1.json` found:

| Scope | Count |
| --- | ---: |
| All race observations | 1,394 |
| Duplicate race IDs across the entire file | 0 |
| Race observations dated 2026-11-01 | 36 |
| Nonempty quote arrays today (record markets and named snapshots) | 86 |
| Quote entries in those arrays | 264 |
| Entries in top-level rating/Tissue markets | 108 |
| Entries in named price snapshots | 156 |
| Exact duplicate groups within those arrays | 6 |
| Excess identical entries | 6 |

All six groups belong to Cork 13:40, West Away:
race `ee4dce1c-3e70-47ff-82fc-de9734d257da`, runner
`fb4e6622-5fc1-49e1-93e1-13cc4ad61297`.

| Bookmaker | ID | Fractional | Decimal | Copies per array |
| --- | ---: | --- | ---: | ---: |
| Betfair Sportsbook | 4 | 5/2 | 3.5 | 2 |
| Paddy Power | 6 | 5/2 | 3.5 | 2 |
| Sky Bet v2 | 17 | 5/2 | 3.5 | 2 |

Each group appears in `bookmakerQuotes` and `earlyPriceSnapshot.bookmakerQuotes`.
Their four stored fields are identical. Both captures are timestamped
`2026-11-01T05:52:34.891Z`; the top-level market is mirrored into Early,
not evidence of a second capture. Across the whole Forward Value file these
are the only exact duplicate quote groups under the inspected fields.

Today's observations have two `recordedAt` values: nine at
`05:51:46.187Z` and 27 at `05:52:34.891Z`. Trackers capture different families
in separate steps, so these timestamps do not establish two workflow runs.

A recursive scan of today's quote arrays in other top-level research JSON
files also found duplicates in `rank-one-forward-v1.json` (3 groups),
`jump-tissue-forward-v1.json` (6), and
`hurdle-tissue-challenger-forward-v1.json` (6). These include mirrored
qualification/control/challenger snapshots. Each affected array contains six
quotes instead of three; all its quotes are 13.0, so its median remains 13.0.
These counts must not be interpreted as distinct workflow executions.

## Import and capture identity

`scraper/sporting_life/importing.py:upsert_source_import` replaces the payload
on conflict with `(source, source_type, source_id)`; it does not append quote
arrays. The database has a unique index on those fields. `todays-racing.ts`
reads `bookmakerOdds` directly from the selected ride in that payload, and
`parseSportingLifeBookmakerQuotes` preserves repeated entries.

`upsertForwardValueRecords` skips existing race IDs, including duplicates in
one candidate batch. `enrichForwardValuePriceSnapshots` writes only the first
valid quote for each capture stage. Neither appends quotes to an existing
snapshot. No failed import idempotency was demonstrated, so neither import
nor capture semantics were changed.

The local PostgreSQL connection failed with `ECONNREFUSED 127.0.0.1:5432`.
The source payload and its import timestamps therefore could not be inspected.
There is no execution ledger in the research JSON. Whether morning was run
twice, and whether the upstream payload itself contained repeats, remain
unconfirmed. The evidence is consistent with one capture of repeated source
quotes, rather than appending a second research observation.

## Calculation impact and preservation decision

The observed repeats inflate quote counts (6 rather than 3), including the
displayed diagnostic count. The observed median and best decimal prices are
unchanged: 3.5 for West Away and 13.0 in the other affected arrays. These are
quote duplicates, not duplicated runners or races. Tissue probabilities,
Tissue ranks, Value ranks, market ranks, frozen prices, settlement returns,
prospective observation totals, and dashboard totals are unchanged by this fix.

Repeated quotes are not universally harmless: `summarizeBookmakerMarket` and
`summarizeTodayMarketPrice` calculate a median over all valid entries. Uneven
repeats at different prices could reweight that median. New capture prices,
implied probabilities, edges, market/Value ranks, qualification and eventual
captured-price returns could then differ. `tissue-value-forward.ts` and
`rank-one-forward.ts` consume those medians. This investigation found no such
median change in the affected stored arrays. Altering the shared market
calculation or rewriting frozen history is outside this fix.

Stored quotes are preserved (option C). Both quote lists use the shared
`BookmakerQuoteLines` renderer with full quote identity and an occurrence
counter per identity. There are no canonical individual quote IDs/timestamps
in the stored schema. The counter only distinguishes otherwise indistinguishable
entries; it is not an array-index-only key. Parent rows/cells already scope
race and snapshot identities. Prices, quote counts and visible quote lines
remain unchanged.

## Verification

Focused tests assert unique, repeatable element keys for identical quotes,
changed prices, different bookmakers, and different fractional representations.
They verify stability when unrelated quotes are inserted. Integration tests
render both diagnostics and recent observations with repeated quotes, check
console output, and compare the input data and calculated summaries before
and after rendering. Direct key assertions cover the collision even when
server rendering does not emit duplicate-key diagnostics.

Capture tests repeat morning upsert and capture, verify no added observation
or quotes, and preserve a genuinely later T-60 price alongside frozen Early
and T-180 stages. Existing prospective tests cover frozen primary/Value ranks
and summary totals. Research-file hashes are checked against the pre-edit
workspace, including the user's existing uncommitted research changes.

Full browser/database-backed route verification requires the unavailable local
database; server component rendering and direct element-key tests were used.

Validation completed:

- 215 tests passed across Forward Value UI, capture, workflow, prospective,
  Rank 1, Jump Tissue, and Hurdle challenger suites.
- 47 additional all-family/Turf Value and price-cap tests passed.
- 28 Python racecard/import tests passed.
- `bun run typecheck` passed.
- Targeted ESLint on the five changed/new TypeScript files passed.
- `git diff --check` passed.
- `bun run build --webpack` passed, including the Forward Value route.
- All 235 research files matched their pre-edit SHA-256 hashes; none added or
  rewritten. Together with unchanged calculation code, this preserves stored
  Tissue/Value/market ranks, captured prices and prospective summary inputs.

Completion status: UI keys hardened **YES**; duplicate stored quotes **YES**;
double morning import **UNCONFIRMED**; demonstrated price/rank/settlement impact
**NONE**, quote-count inflation **YES**; import idempotency changed **NO**
(existing behavior verified); historical data rewritten **NO**;
Tissue/Value/market ranks changed **NO**.
