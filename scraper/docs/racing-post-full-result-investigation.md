# Racing Post Full Result Investigation

Date investigated: 2026-09-01

## Objective

Determine whether a current Racing Post individual full-result page exposes a structured representation of all runners, without changing the PostgreSQL schema or importing real data.

## Pages Investigated

- `https://www.racingpost.com/results/1083/chelmsford-aw/2020-10-01/766341`
- `https://www.racingpost.com/_next/data/{buildId}/results/1083/chelmsford-aw/2020-10-01/766341.json`
- `https://www.racingpost.com/results/2020-03-13/`
- Selected Cheltenham full-result JSON routes from 2020-03-13:
  - race `747842`
  - race `750554`
  - race `747843`
  - race `743616`
  - race `750555`

## Complete Runner Source

The individual full-result page contains complete structured runner data in server-rendered Next.js state:

```text
pageProps.initialState.raceResult.data.runners
```

For the Chelmsford race `766341`, this list contains all 9 runners. The previous date-summary payload only contained the first 3 placed runners, but the individual full-result payload is complete.

The same data is also available from the public Next.js data route:

```text
/_next/data/{buildId}/results/1083/chelmsford-aw/2020-10-01/766341.json
```

That route returned JSON with `pageProps.initialState.raceResult.data.runners` containing all 9 runners.

## Raw Samples Captured

Stored under `data/raw/racing-post/`:

- `2020-10-01-chelmsford-aw-766341-full-result-next-page-data.json`
- `2020-10-01-chelmsford-aw-766341-full-result-next-race-result.json`
- `2020-10-01-chelmsford-aw-766341-full-result-next-data-route.json`
- `2020-03-13-cheltenham-747842-full-result-next-data-route-unusual-outcomes.json`
- `2020-03-13-cheltenham-750554-full-result-next-data-route-unusual-outcomes.json`
- `2020-03-13-cheltenham-747843-full-result-next-data-route-unusual-outcomes.json`
- `2020-03-13-cheltenham-743616-full-result-next-data-route-unusual-outcomes.json`
- `2020-03-13-cheltenham-750555-full-result-next-data-route-unusual-outcomes.json`

These are raw preserved payloads only. No normalization or PostgreSQL import was performed.

## Race Fields Discovered

Main race result fields:

- `raceId`
- `raceDatetime`
- `localRaceDatetime`
- `countryCode`
- `courseUid`
- `courseKey`
- `courseName`
- `header.raceTitle`
- `header.raceTime`
- `header.raceDate`
- `header.distanceShort`
- `header.distanceYard`
- `header.going`
- `header.raceClass`
- `header.raceTypeCode`
- `header.agesAllowed`
- `details.numberOfRunners`
- `details.offTime`
- `details.winningTime`
- `details.fastSlow`
- `nonRunners`
- `analysis`
- `raceComments`

For Chelmsford `766341`:

- race ID: `766341`
- course ID: `1083`
- course: `Chelmsford (AW)`
- datetime: `2020-10-01T16:25:00+01:00`
- title: `tote placepot Your First Bet EBF Fillies' Novice Stakes (Plus 10/GBB Race)`
- distance: `7f`
- distance yards: `1540`
- going: `Standard`
- class: `4`
- race type code: `X`
- runners: `9`
- winning time: `1m 24.81s`

## Runner Fields Discovered

Each full-result runner object includes:

- `horseUid`
- `horseName`
- `horseUrl`
- `horseSuffix`
- `age`
- `pedigree.colourSex`
- `trainerName`
- `trainerUrl`
- `jockeyName`
- `jockeyUrl`
- `jockeyWeightAllowance`
- `saddleClothNo`
- `drawLabel`
- `outcomeCode`
- `isDisqualified`
- `beatenDistance`
- `beatenDistanceToWinner`
- `distanceToWinnerNative`
- `weightStones`
- `weightPounds`
- `weightCarriedLbs`
- `headgear`
- `isFirstTimeHeadgear`
- `officialRating`
- `officialRatingUnit`
- `rpRating`
- `topspeed`
- `odds`
- `comment.bettingMovements`
- `comment.comment`
- `ownerName`
- `ownerUrl`
- `silkUrl`
- `prevRaceUrl`
- `nextRaceUrl`

`comment.comment` is the visible Racing Post in-running comment text. `comment.bettingMovements` is kept only in the raw source payload for now.

Trainer and jockey source IDs are not separate scalar fields in the runner object, but they are embedded in URLs such as:

- `/profile/trainer/4336/john-gosden/`
- `/profile/jockey/13317/dane-oneill/`

There does not appear to be a separate stable runner/result ID in the inspected payload. A deterministic runner key would likely need to be derived from `raceId:horseUid`.

## Full Chelmsford Runner Coverage

The full-result payload contains all 9 runners:

1. `Tawahub`, outcome `1`, horseUid `3200005`
2. `Jacinth`, outcome `2`, horseUid `3142184`
3. `Looktotherainbow`, outcome `3`, horseUid `3168665`
4. `Apatite`, outcome `4`, horseUid `3234575`
5. `Florence Street`, outcome `5`, horseUid `3200004`
6. `Glenartney`, outcome `6`, horseUid `3225242`
7. `Banoffee`, outcome `7`, horseUid `3178703`
8. `Billie's Girl`, outcome `8`, horseUid `3213978`
9. `Lady Amalthea`, outcome `9`, horseUid `3154610`

The same race also has a `nonRunners` list:

- `Arenas Del Tiempo`, reason `self certificate`

The non-runner object did not include a horse ID in the inspected payload.

## Unusual Outcomes

A tiny bounded check of seven Cheltenham races on 2020-03-13 found:

- `UR`: Goshen, JCB Triumph Hurdle, race `747842`
- `PU`: Stolen Silver, Randox Health County Handicap Hurdle, race `750554`
- `PU`: multiple runners, Albert Bartlett Novices' Hurdle, race `747843`
- `F`: Presenting Percy, Cheltenham Gold Cup, race `743616`
- `BD`, `F`, `PU`: Martin Pipe Conditional Jockeys' Handicap Hurdle, race `750555`

For these non-standard outcomes:

- `outcomeCode` stores the status code.
- `beatenDistance` is `null`.
- `beatenDistanceToWinner` is `null`.
- odds remain available.
- jockey/trainer/horse fields remain available.

Normalized result statuses are intentionally small and source-code based: numeric `outcomeCode` values are `finished`; `F` is `fell`; `PU` is `pulled_up`; `UR` is `unseated_rider`; `BD` is `brought_down`; `DQ`/`DSQ` are `disqualified`; `NR` is `non_runner`; unknown non-numeric codes are `other`.

Starting price normalization keeps the raw `odds` string and adds decimal odds only where the source string is a recognizable fractional price or evens. Favourite status is derived only from raw suffix variants: `F`, observed bare `J`, `JF`, `CF`, and the observed Racing Post `C` suffix are treated as favourite indicators.

No disqualified or dead-heat example was found in this deliberately tiny pass.

## Source IDs Available

Stable-looking IDs available:

- race: `raceId`
- course: `courseUid`
- horse: `horseUid`
- jockey: parse from `jockeyUrl`
- trainer: parse from `trainerUrl`
- owner: parse from `ownerUrl`

Not observed:

- individual runner/result ID
- non-runner horse ID in the race-level `nonRunners` list

## Stability Assessment

Best source found:

```text
public Next.js data route
```

The route is cleaner than scraping HTML because it returns JSON directly. It is still coupled to Racing Post's internal Next.js page structure and build ID. The build ID is discoverable from the public page's `__NEXT_DATA__`, but it will change over time.

Compared with rpscrape's old XPath parser, this is much more promising:

- no old result-table selectors needed
- all runners are present
- IDs and result fields are structured
- difficult outcomes are represented explicitly in `outcomeCode`

Main stability risks:

- field names are not a public API contract
- `/_next/data/{buildId}` depends on Next.js routing internals
- Racing Post access controls may change
- plain `curl` receives HTTP 406; `curl_cffi` impersonation was required

## Recommendation

Recommendation: A. Build a small maintained Racing Post extractor ourselves using the structured source discovered.

Reasons:

- `rpscrape-updated` historical result discovery and parsing are stale.
- The individual full-result page now exposes better structured data than the old HTML parser used by rpscrape.
- A small extractor can preserve raw JSON first, then normalize later.
- Forking rpscrape would inherit a lot of unrelated historical HTML parsing and racecard code we do not need yet.
- Abandoning Racing Post is premature because the full-result JSON route provides complete runner data for the inspected examples.

Suggested next architecture:

1. Discover race links from a date results page's embedded `initialState.results.data`.
2. Fetch each individual full-result page to discover the current `buildId`, or reuse a current build ID after validating it.
3. Fetch the corresponding `/_next/data/{buildId}/results/...json` payload.
4. Preserve the raw payload and checksum.
5. Normalize only from raw payloads in a separate step.
6. Prevent duplicates using Racing Post `raceId` and derived runner keys such as `raceId:horseUid`.

Do not build the production extractor or alter the schema until we add raw import storage and decide which fields to normalize.
