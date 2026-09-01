# rpscrape Investigation

Date investigated: 2026-09-01

## Repository

- Original upstream documented by the project: `joenano/rpscrape`.
- Direct clone and archive access to `joenano/rpscrape` returned not found during this investigation.
- Practical inspected implementation: `https://github.com/stejackson94/rpscrape-updated.git`.
- Inspected commit: `743224c2a24eecc020bd307f54e8946ea112280c`.

The fork preserves the upstream README and command interface, but current historical scraping is not reliable against Racing Post's live markup/API.

## Python Requirements

The README and `requirements.txt` require Python 3.13 or newer. Local Python used here was 3.14.3.

Required packages:

- `curl_cffi>=0.13`
- `jarowinkler>=2.0.1`
- `lxml>=4.7`
- `orjson>=3.6`
- `python-dotenv>=1.2`
- `tomli>=2.0`
- `tqdm>=4.67`

## Invocation

Historical results:

```bash
cd scraper/vendor/rpscrape/scripts
../../../.venv/bin/python rpscrape.py -d 2020/10/01 -r gb
../../../.venv/bin/python rpscrape.py -c 2 -y 2020 -t flat
```

Racecards:

```bash
cd scraper/vendor/rpscrape/scripts
../../../.venv/bin/python racecards.py --day 1 --region gb
```

## Historical Results Capability

Documented historical options include:

- single date or date range
- year or year range
- region filter such as `gb` or `ire`
- course filter by Racing Post course code
- race type filter `flat` or `jumps`

Observed current behavior:

- Date mode reached Racing Post with HTTP 200 through `curl_cffi`, but current page markup no longer contains the XPath targets used by rpscrape, so the output CSV contained only the header row.
- Course/year mode attempted `https://www.racingpost.com:443/profile/course/filter/results/2/2020/flat/all-races`, which currently returned 404.
- Feeding a live full-result URL into the parser hung because the parser loops until it finds the old `data-analytics-race-date-time` marker.

Conclusion: historical result scraping needs upstream maintenance before it is a safe ingestion source.

## Racecard Capability

Racecard scraping is documented for today and tomorrow only:

- `--day 1`
- `--day 2`
- `--days 2`
- optional `--region gb`

Observed current behavior:

- Racecard pages returned HTTP 200 through `curl_cffi`.
- The parser found no meetings because the expected racecard XPath selectors were absent in the current markup.
- No racecard JSON file was written.

## Authentication

The network client can run without credentials and sends no auth cookies if `EMAIL`, `AUTH_STATE`, and `ACCESS_TOKEN` are absent.

The README documents optional Racing Post cookie values:

- `EMAIL`
- `AUTH_STATE`
- `ACCESS_TOKEN`

No credentials were used in this investigation. Anonymous `curl_cffi` requests received HTTP 200, but selectors were stale. Direct plain `curl` received HTTP 406 from Racing Post.

## Output Formats

Historical results output is CSV. The selected local settings enabled the source ID columns that are disabled in the default settings.

Configured historical CSV columns:

```text
date,region,course_id,course,course_detail,race_id,off,race_name,type,class,pattern,rating_band,age_band,sex_rest,dist,dist_f,dist_m,dist_y,going,surface,ran,num,pos,draw,ovr_btn,btn,horse_id,horse,age,sex,wgt,lbs,hg,time,secs,sp,dec,jockey_id,jockey,trainer_id,trainer,prize,or,rpr,comment
```

Racecard output is JSON grouped by region, course, and off time. The `Racecard` model includes `race_id`, `course_id`, `race_name`, `race_type`, `race_class`, `distance`, `distance_f`, `distance_y`, `going`, `surface`, and nested runners. Runner fields include `horse_id`, `jockey_id`, `trainer_id`, `name`, `draw`, `lbs`, `non_runner`, and related profile/stat fields depending on settings.

## Captured Samples

- `data/raw/rpscrape/historical-results-gb-2020-10-01-rpscrape.csv`
  - Produced by rpscrape date mode.
  - Contains the configured header only because current selectors returned no rows.
- `data/raw/rpscrape/historical-results-page-next-data-chelmsford-2020-10-01-first-race.json`
  - Diagnostic payload extracted from Racing Post `__NEXT_DATA__`, using rpscrape's `NetworkClient`.
  - This is not normalized data and was not inserted into PostgreSQL.

The diagnostic result object includes:

- race: `raceUid`, `raceDateTime`, `raceTime`, `raceTitle`, `courseUid`, `courseKey`, `diffusionCourseName`, `countryCode`, `distance`, `going`, `raceClass`, `raceStatusCode`, `fullResultLink`, `runnersCount`, `winnerTime`, `nonRunners`
- runners: `horseName`, `horseUrl`, `position`, `saddleCloth`, `distanceToWinner`, `sp`, `jockey`, `trainer`, owner/breeding names and URLs

Important limitation: the diagnostic result-page summary exposed only three placed runners for the selected race, while `runnersCount` was 9. It is useful for field discovery, but not sufficient for full result ingestion.

## Schema Compatibility

Clean mappings to the existing schema:

- `courseUid` or CSV `course_id` -> `courses.source_id`
- course display fields -> `courses.display_name`
- `raceUid` or CSV `race_id` -> `races.source_id`
- `raceDateTime`/CSV `date` and `off` -> `races.race_date` and `races.scheduled_time`
- `raceTitle`/CSV `race_name` -> `races.race_name`
- `raceClass`/CSV `class`, CSV `type` -> `races.race_type` with future refinement
- `distance`/CSV `dist` -> `races.distance`
- `going` -> `races.going`
- runner `horseUrl` ID or CSV `horse_id` -> `horses.source_id`
- runner `horseName`/CSV `horse` -> `horses.display_name`
- CSV `trainer_id` and `jockey_id` -> `trainers.source_id`, `jockeys.source_id`
- runner trainer/jockey names -> display names
- CSV `pos` or diagnostic `position` -> runner finishing status/position after parsing
- CSV `draw`/diagnostic `saddleCloth` -> current schema partially supports draw, but saddlecloth number is separate
- CSV `wgt`, `lbs`, diagnostic `sp` -> current runner fields can preserve text values

Unsupported or under-specified fields:

- separate race class, pattern, handicap, surface, region, field size, age/rating/sex restrictions
- numeric distance in yards/metres/furlongs
- horse age/sex
- saddlecloth number distinct from draw
- beaten distances, finishing time, prize money, official rating, RPR
- owner and breeding information
- non-runner reason and runner non-runner state
- jockey/trainer IDs are not present in the diagnostic result-page summary, only in rpscrape CSV/racecard models when parsing works

Type/meaning concerns:

- `races.race_type` should probably not combine class, pattern, and code long term.
- `race_runners.draw` should remain draw/stall, not saddlecloth number.
- `race_runners.weight` can preserve source text initially, but a numeric pounds field is likely useful.
- `race_runners.starting_price` text is required because values may include `EvensF`, joint-favourite suffixes, or no odds; decimal odds can be derived separately.

## Source IDs

rpscrape's historical CSV can expose stable Racing Post IDs if enabled:

- `course_id`
- `race_id`
- `horse_id`
- `jockey_id`
- `trainer_id`

The diagnostic embedded result object exposed:

- `courseUid`
- `raceUid`
- horse IDs embedded in `horseUrl`
- owner/sire/dam IDs embedded in URLs

It did not expose jockey/trainer IDs for the result-page summary runners.

## Representation Notes

- Distance appears as text (`7f`, `1m2f`) and sometimes numeric forms (`dist_f`, `dist_m`, `dist_y` in rpscrape CSV).
- Weight appears as text (`wgt`, e.g. `9-2`) and pounds (`lbs`) in rpscrape CSV/racecard models.
- Starting prices are text (`sp`) and decimal (`dec`) in historical CSV when parsing works. Favourite suffixes can appear in text.
- Non-finishing historical results are represented in `pos` using statuses such as `DSQ` and other non-numeric codes; rpscrape sets time, seconds, and beaten-distance fields to `-` for non-completions other than `DSQ`.
- Going is text such as `Standard`; surface is derived by rpscrape.
- Race class may be numeric/text depending on source. Pattern is separate in rpscrape.

## Raw Data Preservation Recommendation

Use both files and PostgreSQL JSONB later:

- Keep immutable raw files under `data/raw/rpscrape/` during development and for reproducibility.
- Add a PostgreSQL raw import table later with JSONB or text payload, source, source ID/date, capture time, and checksum.
- Normalize from preserved raw payloads into core tables only after source output is stable and validated.

## Minimal Ingestion Design Recommendation

Smallest safe future pipeline:

1. Capture one date/course request with rpscrape into an immutable raw file.
2. Store a raw import manifest/checksum.
3. Parse rows into a staging representation.
4. Normalize courses, horses, trainers, jockeys, races, and runners.
5. Insert with `source = 'racing-post'` and stable source IDs where available.

Duplicate prevention:

- `courses`, `horses`, `trainers`, and `jockeys`: upsert by `(source, source_id)` when IDs exist.
- `races`: upsert by `(source, source_id)`.
- `race_runners`: upsert by `(source, source_id)` if runner-level IDs exist; otherwise derive a deterministic source ID such as `race_id:horse_id`, with care for duplicated horse entries or void/abandoned records.

Do not build bulk import until rpscrape historical parsing is fixed or another reliable raw source endpoint is selected.
