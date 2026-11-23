# Racing 2025–2026 data, market and trainer audit
19 November 2026 · Retrospective diagnostic · £1 win singles at final Sporting Life SP

## A. Executive summary

1. **2026 has real coverage and feature problems.** The audit found eight weighed-in Flat results filed only as racecards and absent from the structured results, alongside the known October Jump gap. The default 2026 Jump feature cache still uses the superseded timing guard. In the reconciled final fields there was no broad corruption of runner results or SP. Coverage faults can change a model's sample and prior history. They do not establish that poor system returns came from broken settlement.
2. **Favourites behaved differently by family.** On matching dates, Chase favourite strike rose from 33.1% to 35.5%, Hurdle fell from 38.2% to 34.8%, All Weather changed little and Turf rose from 31.6% to 33.0%. All eight family-year favourite samples lost at SP.
3. **Favourite exclusion did not produce a robust improvement.** The saved Turf rule's ROI rose in both years and turned negative in both after removing its two largest winning races. Jump handicap had only a small improvement in the matched headline ROI, with losses in both years and mixed results on the same races. Excluding favourites made the saved Chase rule worse in 2026.
4. **No market-rank group established repeatable SP profitability.** Turf second favourites slightly exceeded normalised market expectation in both years and lost about 12% in both. Rank 7+ underperformed normalised SP in every family and year and lost roughly 30–48% on matching dates.
5. **Second runs after a break showed no general uplift.** At 90 days, second-run A/E was 0.96 and 1.00, with ROI −23.6% and −29.3%. The 60- and 120-day checks gave the same broad result. Third runs were closer to market expectation and less loss-making, with variation by family and limited evidence of a model omission.
6. **The two biggest winning races matter.** No broad trainer group showed profit before or after their removal. A handful of profitable fixed-system slices became losses or failed to repeat across years.
7. **There is a forecasting question worth testing independently.** Test the fixed third-run definition against frozen Tissue forecasts and final-SP expectations on new races. Keep the second-run claim as a comparison and predefine the families, sample and evaluation date.

## B. 2026 database integrity findings

The unit is a Sporting Life race or runner in the local database. The 2025 inventory covers the calendar year. The 2026 cutoff is 18 November, the latest racing date in the snapshot. The main like-for-like comparison uses 1 January–18 November in both years. Jump subtypes and surfaces use the application's classifiers. For 56 Flat entries without a final import, identity-matched racecards supply the family only. Other Jump and unsupported races stay outside the four-family tables. The database snapshot was acquired with PostgreSQL repeatable-read and read-only enforcement.

| Family | Year | First–last (MM-DD) | Race dates | Races | Runner records | Confirmed starters | Result settled | Winners | NR | DNF | Void races / void rows | Dead-heat races | Unresolved rows | Complete SP books |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chase | 2025 | 01-01–12-31 | 314 | 1,707 | 14,349 | 13,081 | 13,081 | 1,702 | 1,219 | 2,659 | 0 / 0 | 0 | 49 | 1,702 |
| Chase | 2026 | 01-01–11-18 | 273 | 1,388 | 11,267 | 10,098 | 10,098 | 1,373 | 1,010 | 2,144 | 1 / 9 | 1 | 150 | 1,372 |
| Hurdle | 2025 | 01-01–12-31 | 321 | 2,911 | 30,820 | 27,823 | 27,823 | 2,907 | 2,938 | 3,586 | 1 / 12 | 0 | 47 | 2,906 |
| Hurdle | 2026 | 01-01–11-18 | 281 | 2,414 | 25,778 | 23,222 | 23,222 | 2,400 | 2,390 | 3,209 | 1 / 7 | 2 | 159 | 2,397 |
| All Weather | 2025 | 01-01–12-31 | 259 | 3,106 | 30,664 | 28,634 | 28,634 | 3,113 | 1,978 | 67 | 2 / 21 | 11 | 31 | 3,102 |
| All Weather | 2026 | 01-01–11-18 | 224 | 2,556 | 25,111 | 23,103 | 23,103 | 2,514 | 1,508 | 67 | 1 / 8 | 6 | 492 | 2,508 |
| Turf | 2025 | 02-03–11-08 | 219 | 4,740 | 48,657 | 44,562 | 44,561 | 4,747 | 4,080 | 136 | 1 / 7 | 9 | 9 | 4,737 |
| Turf | 2026 | 02-15–11-07 | 218 | 4,762 | 49,063 | 44,486 | 44,486 | 4,724 | 3,859 | 143 | 1 / 11 | 5 | 707 | 4,719 |

A confirmed starter has a final-stage runner record and is outside void and NR classifications. Result-settled includes classified losses and explicit started non-finishers. Multiple winners count as winner records. Unresolved rows include declarations on non-final cards and the single unresolved runner in a final-stage field. The unresolved column cannot be added to confirmed starters to estimate field size.

| Family | Year | Confirmed starters | Missing final SP | Missing OR | Missing provider Topspeed | No cache row for Speed | Best L3 Speed missing among matched cache rows | Missing trainer | Missing jockey | Race ID / provider race ID duplicates | Runner ID / provider ride ID / race-horse duplicates |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chase | 2025 | 13,081 | 0 | 1,191 | 13,081 | 0 | 1,595 | 0 | 0 | 0 / 0 | 0 / 0 / 0 |
| Chase | 2026 | 10,098 | 0 | 760 | 10,098 | 1,431 | 581 | 0 | 0 | 0 / 0 | 0 / 0 / 0 |
| Hurdle | 2025 | 27,823 | 0 | 8,810 | 27,823 | 0 | 5,915 | 0 | 0 | 0 / 0 | 0 / 0 / 0 |
| Hurdle | 2026 | 23,222 | 0 | 6,966 | 23,222 | 3,442 | 3,264 | 0 | 0 | 0 / 0 | 0 / 0 / 0 |
| All Weather | 2025 | 28,634 | 0 | 5,233 | 28,634 | 0 | 7,227 | 0 | 0 | 0 / 0 | 0 / 0 / 0 |
| All Weather | 2026 | 23,103 | 0 | 4,046 | 23,103 | 5,149 | 3,873 | 0 | 0 | 0 / 0 | 0 / 0 / 0 |
| Turf | 2025 | 44,562 | 0 | 9,722 | 44,562 | 0 | 8,417 | 0 | 0 | 0 / 0 | 0 / 0 / 0 |
| Turf | 2026 | 44,486 | 0 | 9,218 | 44,486 | 6,900 | 7,077 | 0 | 0 | 0 / 0 | 0 / 0 / 0 |

The provider Topspeed column comes from the database. Best L3 Speed is the local model feature, joined by runner ID from the relevant v4 cache, with 2026 Jump limited to the pinned isolated fields. Missing prior Speed within a cache may reflect a lightly raced horse, insufficient usable priors or source timing and history gaps. Unmatched Speed records mostly reflect the model-cache date cutoffs.

| Family | Jan–18 Nov dates | Races | Starters | Complete SP books | Unresolved rows | Missing OR | Mean starters (complete) | Mean book |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chase | 274 → 273 | 1,404 → 1,388 | 10,738 → 10,098 | 1,399 → 1,372 | 49 → 150 | 987 → 760 | 7.68 → 7.36 | 115.0% → 115.5% |
| Hurdle | 281 → 281 | 2,417 → 2,414 | 23,083 → 23,222 | 2,412 → 2,397 | 47 → 159 | 6,921 → 6,966 | 9.56 → 9.68 | 119.1% → 120.4% |
| All Weather | 224 → 224 | 2,556 → 2,556 | 23,343 → 23,103 | 2,552 → 2,508 | 31 → 492 | 4,152 → 4,046 | 9.15 → 9.21 | 117.7% → 119.0% |
| Turf | 219 → 218 | 4,740 → 4,762 | 44,562 → 44,486 | 4,737 → 4,719 | 9 → 707 | 9,722 → 9,218 | 9.41 → 9.43 | 118.2% → 119.2% |

The arrows in all comparison tables run from 2025 to 2026. Matching dates removes the 2025 year-end excess. Turf starter volume is close, Chase fields are smaller and Hurdle fields slightly larger. Card-only placeholders inflate the recorded race counts. All four complete-book populations are close in size, with overround higher in 2026.

### Result and source reconciliation

- **Where fields reconciled.** Compared every available race and provider ride identity, finishing position, v3 outcome and final SP to the retained full-result import. 12,464 2025 and 11,028 2026 races also matched the on-disk result projection by race/date, ride IDs, stage, starter count, classifiable outcome and price. The 11 previously recovered Jump results were checked through the pinned alternative filenames. Across final fields, the audit found zero runner-ID, finishing-position or valid-price disagreements. Full evidence and canonical resolution were available for 12,447 and 10,996 complete SP books. [Pinned Jump recovery](../data/research/jump-2026-local-recovery-2026-11-11/report.md)
- **Runner counts and favourite flags.** In 6,108 and 5,338 races, the database actual count equalled the ride array including non-runners, while provider starter count agreed with the genuine starter roster. The importer uses ride-array length for this field. For market coverage use the independently checked roster. There were 22 and 16 complete races with at least one provider favourite-flag disagreement. Shortest final SP determined favourite status, including every equal shortest price. [Importer mapping](../scraper/sporting_life/importing.py)
- **Historical timing and availability.** All ten pinned winning-time corrections still match their dates and database values. The stale 2026 Jump v4 manifest identifies guard v1. Its guard-v2 candidate ends on 14 October and changed at least one rating field on 333 of 32,901 comparable rows, including 128 Best L3 Speed changes in the earlier candidate audit. The candidate's prior-history review identified 110 later targets exposed to completed untimed priors and 886 exposed to uncertain historical records, with overlap possible. AW v4 ends on 21 September and Turf v4 on 19 September. Cache gaps are wider than the gaps among reconciled final results. [Timing corrections](../data/corrections/sporting-life-winning-times.json) · [Pinned candidate validation](../data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/report.md)

The local UK/Ireland results indexes cover 365 2025 dates and 320 of 322 2026 dates. The absent 2026 indexes are 9 and 15 October. Among final-listed races, 171 of 13,021 in 2025 and 130 of 11,425 in 2026 had no database race at that provider ID. All were at Down Royal or Downpatrick. The matched-calendar counts are 164 and 130. This is a repeated geographical coverage gap. An index listing supplies a race identity and stage, with insufficient evidence for full-field settlement. The counts exclude any unlisted gaps on the two dates without a daily index.

### Affected records and smallest proposed corrections

**New Flat result-import failure.** Eight local cards contain weighed-in payloads under racecard filenames and have no full-result import. All eight ran on 9 October. Seven are All Weather and one Turf. Each document matches the stored race/date and exact provider ride roster. The retained evidence has 91 canonical starter outcomes. 91 joined runner rows lack their structured result. Verify and import only the attributable result fields and full-result provenance from these exact retained payloads in a separately authorised correction. Keep pre-race fields intact. The market and model tables use only database-backed final fields. These eight October races fall beyond the AW and Turf historical model-cache cutoffs, so they cannot explain those measured cache-sample returns. The unresolved 15 October Jump cards likewise fall after the isolated Jump replay. Missing results can still affect later form histories.

| Date | Family / course | Source race ID | Database race UUID | Source starters | DB missing joined results | Source winner ride IDs |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-09 | All Weather / Kempton | 943054 | b92a8027-c7e9-4764-b81d-399cd589044a | 8 | 8 | 256620007 |
| 2026-10-09 | All Weather / Kempton | 942524 | 7bd81380-4aa7-4c99-829f-b94ab03709ab | 10 | 10 | 256620019 |
| 2026-10-09 | All Weather / Dundalk | 943052 | f0cd9455-ad1e-4524-a3e3-98da92ca48b8 | 14 | 14 | 256619504 |
| 2026-10-09 | All Weather / Kempton | 942525 | a5289c78-2650-417b-b319-1a0f594a80fa | 13 | 13 | 256620039 |
| 2026-10-09 | Turf / Newmarket | 942523 | 8ad88673-b325-4b66-960c-4c4b10d6ead9 | 11 | 11 | 256246901 |
| 2026-10-09 | All Weather / Dundalk | 942755 | 619ffd46-cbb7-499d-9881-5fc81b18ff25 | 14 | 14 | 256619511 |
| 2026-10-09 | All Weather / Kempton | 942526 | 119c9f4c-3860-47ac-9c48-24a6498d193f | 7 | 7 | 256620042 |
| 2026-10-09 | All Weather / Dundalk | 942756 | c6346305-bea1-42ac-9546-78cdc35df980 | 14 | 14 | 256619532 |

<details>
<summary>Runner identities for the eight weighed-in racecard payloads</summary>

| Source race ID | Retained racecard filename / SHA-256 | Database runner UUIDs with missing final outcome |
| --- | --- | --- |
| 943054 | 2026-10-09-kempton-943054-racecard-next-data.json · 5a885740299af65d35db336fa36461b7b71714edc436059880fcffadfc88f8ec | 3bea0bab-eca9-417d-aead-d783ae568094, 4001582a-886e-4232-8209-7099aa07bbad, 62fe60a3-040a-4acc-baba-973b699ff630, 8ec455b8-b568-4587-b2ec-7c46ba9e154a, ae50b60d-9b79-4a65-8010-48820fb0fb3d, c744badc-2411-4f5c-9f29-d1fee671e036, e54a23f4-7d40-46ee-a0e7-6ec4e962f293, f2fa4e77-469c-4015-88f7-527dd769419d |
| 942524 | 2026-10-09-kempton-942524-racecard-next-data.json · 9e14d88fe121c6b35ec9b63b842311e9a64ca69283964f5f2c270c1f94349fc5 | 00f41a01-590d-495d-b3d7-8a8306a16c8c, 2e160830-0f1a-44d8-b5fc-ce94b6dade3d, 31d22899-5d9d-47e9-8d47-f48503b1dc18, 552bf19f-d987-4ac8-9f39-476628d32b3c, 64f26012-e037-49f9-8d25-dc1a4a755c88, 6b32ea0b-762b-45b4-ba33-3b91cc5e2b1a, 756af0d4-954a-450f-a49a-13f666cda3c5, dc488e75-d5f3-4f0b-9d0f-6676bf0c87ef, df5cfb11-f87f-4264-b286-0dbd1932c2f7, f0057579-3cb7-4c8e-99e5-be21caa2cb25 |
| 943052 | 2026-10-09-dundalk-943052-racecard-next-data.json · 6e57e69cd3cd6c94771211c9fbb3428706972c88cd6aca262599f51c548d7017 | 2cfb491d-f25a-4ca4-bfe7-3046e8dc8548, 535520ad-3429-47bb-b95c-fa8d2f8209de, 6f652d22-cbfa-4ae3-9eef-681793e658d6, 82743a95-a562-4e2b-8133-31b41e558ee1, 872dd26a-180f-4ec0-b371-1dfd50b52082, a786b11b-11fc-4c9e-aa87-8ef34c792725, ad2ff867-5358-4f69-8bf3-74a0a8f846bd, b65cdcf4-dedb-47c8-9a68-271fdea73814, b8504e8d-1b5d-4675-ad9d-01e95dfa7851, c59e37a2-1379-4d41-b54a-4bbc014d4601, cc89b7a6-0d94-47f7-8496-ecc81224c659, cd705187-d420-4c34-84c8-f58e5411c6f1, d51b50e3-5438-49f4-a77b-8fb22af64def, e778b704-8aa5-4d2b-b40a-119c65cf2dab |
| 942525 | 2026-10-09-kempton-942525-racecard-next-data.json · b4a63ab2489a2968dabb419b9510b2daeb8b417f824ee459e0f063680ad4986d | 05a0f48b-92b3-42e1-b9cc-7d935cf49876, 092278e2-1c7c-41dc-992b-8e563d9420f2, 0b7e53ee-17cd-47d4-9244-d418f5c20892, 3b88a704-8aea-481f-a645-d4b0c7b1f2e0, 59e3fda6-ac4d-49f3-81d1-d56b59c04065, 9066793d-556b-4797-8dc1-ace1afa4eb51, 9f5e6869-c14a-4adc-820b-572acb5f99be, bd451ea2-e6a8-430a-8ccb-bd3a91e1ee47, cb4ae787-7f9a-44e0-b177-ebc4e4a40198, e41c7c46-777f-47d7-8679-f127d925e5a6, e787fb7c-7593-4e42-9ef6-f62430385b98, ebef3390-ee3d-4fa5-b08a-6241b5e9b441, f9eaf5dd-d5a2-4ac5-9084-3206d16c981a |
| 942523 | 2026-10-09-newmarket-942523-racecard-next-data.json · 4892ec27a70a71cdae3b266dabe6332ea611dd294da950f0da45d4f201d808e8 | 0e76841a-daab-4f9c-9f0b-11218e9b614f, 1030adc7-c079-4eb7-af98-c90f63d9f692, 5cd080b9-f181-4def-9e8f-4e7bdbfbd8ed, a6f46704-98d1-4fba-9d5b-f6318b948804, a71718e7-6be1-46cd-b2bc-2acf381ae0bc, abad7c5e-04e7-41af-9de6-3124b65993cd, bc838a75-2598-4883-a0ee-23e26b35678b, c31b9360-a222-449e-9000-57b83bcda1bc, ce2291e5-980e-4e6f-b5aa-34cff106dbfa, e8356c3b-9140-4556-98db-c8d40eca6aa9, f7665479-047f-4a40-bc63-8958d05580a0 |
| 942755 | 2026-10-09-dundalk-942755-racecard-next-data.json · abd33bfe2251698e82f3208bb61943d78ada4924343a41df805cebb2a00dc71b | 0b8cfe44-4032-4386-a018-615789c9c476, 1b2205ed-0d8e-410d-bf00-72ac7128c332, 1c23535a-8f63-4216-a3f3-b9f3c7f7f1f3, 358fd685-3bf2-4a01-ae34-a344118f2a21, 3fc125f5-92df-48c0-8cb4-d6ef2273ffd6, 618e7460-ffa2-447f-ac5c-8b1eb669ee71, 6efff8e7-2661-4ca3-be86-cfbc8e8d8b5f, 87da49bd-291c-4475-9c63-b58bf1e48675, 9a4cf94b-df50-49ec-9d92-62092b8a822c, 9f78204d-d14a-4002-af13-5ae0d7862a94, b97fabb8-5757-4403-9e53-478d623fe1a6, c0185799-3f72-487b-9f14-cf071d1cd46e, c906c471-cdcc-4ba1-b8c9-54a1ce0dd678, f64b3a0b-bc6e-46e3-b939-2f79291f3331 |
| 942526 | 2026-10-09-kempton-942526-racecard-next-data.json · 4945f72aba8c55ec5fb0401c00278ad58ba8ac92d1ad0ede3eb4dda663a24310 | 1e225711-d9a0-46d9-8568-ebf3e254f863, 33ea21b1-f602-4a3f-b240-b4e77bf6918a, 3e30e338-f346-40c9-80d3-18eda7ce8052, bf00525b-f8f5-4676-aa5a-6d31f592185c, e5f3f15c-9728-4db0-8924-574e317e2d3f, e945001a-0826-4b20-b5af-bcdd53633fb0, f7954fa9-d3ad-4f3c-b48f-b05b6b765b11 |
| 942756 | 2026-10-09-dundalk-942756-racecard-next-data.json · aa417295564a8c54dde696daf16ad6b6e4e4388fdb7c68061cf2e0270dfd09e7 | 0f1c1fe9-efb1-4bfa-a37d-f0100fb506bc, 28b5b778-ec17-449c-b1e4-62c25c33888d, 55448606-94cc-4482-8d17-229fb2c373a5, 6989278c-b621-47d9-9a2c-ab1bf56f87af, 7530268b-7d8b-40de-b282-d867f0c924bc, 8018c26e-1d84-42b0-be89-cf343aa51095, 88581ba9-d260-43f4-9875-edc4191a1db1, 894c987d-dfc1-446b-bf32-200f9878a097, 9a21b1bf-b23e-45dd-8c13-fa3bafa2b65a, abce54ed-70b8-4479-8f94-3749a5e42434, c5519195-2593-4e13-8b1d-beaca513c960, cf135a8f-c494-4eac-a8f9-1d5d0b47ef00, e4234858-cd1a-442f-b3e7-44b2be225cbe, e5968c69-3f4f-43cd-98de-cbea4a5c7fce |

</details>

| Race / evidence | Affected identity | Smallest proposed correction |
| --- | --- | --- |
| Galway, 2 August 2025. Provider count 19, classified starter roster 20. | 870278 · 221fe4f3-9669-42f1-af68-275455364c28 | Resolve the starter-count conflict against a final starter list before admitting the field. |
| Hamilton, 22 August 2025. Weighed in with an ambiguous zero for Faylaq. | 874915 · 68c0269e-3732-4a1f-8f15-5e8683e2ccee · ride 219327396 · runner 0e858ef6-aa8a-4205-bd12-ad808946f462 | Establish an explicit final status for that runner. Preserve unresolved until corroborated. |
| Worcester, 19 August 2026. Provider count 14, canonical roster 15 including Dreaming Of The Dr (RefusedToRace). | 933814 · f58b37eb-d2e7-4b66-a8f6-455850620089 · ride 251546546 | Verify starter orders and official status for that ride and reconcile the count before using rank or settlement for this field. |
| Uttoxeter, 24 July 2026. Explicit RACEVOID, nine stored runner statuses are other. | 929549 · 88172864-0152-4bda-8621-7bec49740971 | Require race-stage evidence in settlement readers. Canonical v3 refunds the race on the current evidence. Preserve original status and price fields. |
| Doncaster, 12 September 2026. Same scheduled slot, different race names and provider IDs. The second record has zero runners. | 932260 / 933615 · 201e554e-58eb-4497-babd-c82c7b97f262 / bcf5d9ed-5da0-4313-a211-144040da0abd | Retain the completed race. Verify the empty card's provenance before treating it as a duplicate or retiring it. |

**Unresolved October Jump cards.** 27 card-only Jump records on 15, 25 and 26 October had dormant local payloads. The 15 October subset includes the 14 previously documented races and 98 runner rows, including NH Flat outside the main tables. Preserve these as unresolved until complete result evidence exists. A partial horse-history entry does not establish a final race book. [Earlier affected runner IDs and partial-history evidence](../data/research/jump-2026-blocker-diagnostic-2026-11-11-VX8rfC/report.md)

<details>
<summary>Provider IDs for unresolved or absent results</summary>

| Date | Course | Race IDs · dormant Jump card and no full result |
| --- | --- | --- |
| 2026-10-15 | Fontwell | 943566, 943567, 943568, 943569, 943570, 943571 |
| 2026-10-15 | Perth | 943572, 943573, 943574, 943575, 943576, 943577, 943578, 944162 |
| 2026-10-25 | Aintree | 945188, 945189, 945190, 945191, 945192, 945193, 945194 |
| 2026-10-26 | Wexford | 945545, 945546, 945547, 945548, 945549, 945550 |

| Month | Stage | Provider IDs · result file without terminal evidence |
| --- | --- | --- |
| 2025-01 | DORMANT | 840553, 840554 |
| 2025-02 | DORMANT | 843237 |
| 2025-03 | DORMANT | 847921, 847928, 847934, 848826 |
| 2025-04 | DORMANT | 850766, 851841, 852867 |
| 2025-06 | DORMANT | 861151 |
| 2026-09 | DORMANT | 938589, 940937, 940938, 940939, 940940, 940941, 940942, 940943 |
| 2026-09 | RESULT | 940406 |
| 2026-10 | DORMANT | 942387, 942946, 942991, 942992, 942993, 942994, 942995, 942996, 942999, 943000, 943001, 943002, 943003, 943004, 944784, 945140, 945380, 945395, 946356, 946357, 946358, 946359, 946360, 946361 |
| 2026-10 | PARADING | 942998 |
| 2026-10 | RESULT | 942990 |
| 2026-11 | DORMANT | 946937, 947089, 947090 |

| Year / course | Final-listed provider IDs absent from database |
| --- | --- |
| 2025 / Down Royal | 839975, 839976, 839977, 839978, 839979, 839980, 839981, 848401, 848402, 848403, 848404, 848405, 848406, 848407, 853077, 853078, 853079, 853080, 853081, 853082, 853083, 856064, 856065, 856066, 856067, 856068, 856069, 856070, 856579, 860378, 860379, 860380, 860381, 860382, 860383, 860384, 863277, 864022, 864023, 864024, 864025, 864026, 864027, 864028, 864233, 864234, 864235, 864236, 864237, 864238, 864379, 868982, 868984, 868985, 868986, 868987, 868988, 869295, 876393, 876394, 876395, 876396, 876397, 876398, 876399, 877621, 877622, 877623, 877624, 877625, 877626, 877627, 881709, 881710, 881711, 881712, 881713, 881714, 881715, 884591, 887358, 887359, 887360, 887361, 887362, 887363, 887364, 887564, 887565, 887566, 887567, 887568, 887569, 887909, 895115, 895116, 895117, 895118, 895119, 895120, 895121 |
| 2025 / Downpatrick | 850382, 850383, 850384, 850385, 850386, 850387, 850388, 856836, 856837, 856838, 856839, 856840, 856841, 856842, 859086, 859087, 859088, 859089, 859090, 859091, 859092, 863035, 863036, 863037, 863038, 863039, 863040, 863041, 868147, 868148, 868149, 868150, 868151, 868152, 868153, 868301, 868302, 868303, 868304, 868305, 868306, 868307, 872915, 872916, 872917, 872918, 872919, 872920, 872921, 875563, 875564, 875565, 875566, 875567, 875568, 875569, 880074, 880075, 880076, 880077, 880078, 880079, 880080, 883767, 883768, 883769, 883770, 883771, 883772, 883773 |
| 2026 / Down Royal | 899234, 899235, 899236, 899237, 899238, 899239, 899240, 907864, 907865, 907866, 907867, 907868, 907869, 907870, 908291, 911875, 911876, 911877, 911878, 911879, 911880, 911881, 915399, 915400, 915401, 915402, 915403, 915404, 915405, 919793, 919794, 919795, 919796, 919797, 919798, 919799, 919800, 922746, 923509, 923510, 923511, 923512, 923513, 923514, 923515, 923650, 923651, 923652, 923653, 923654, 923655, 928512, 928513, 928514, 928515, 928516, 928517, 928518, 935615, 935616, 935617, 935618, 935619, 935620, 935621, 936887, 936888, 936889, 936890, 936891, 936892, 936893, 937218 |
| 2026 / Downpatrick | 909685, 909686, 909687, 909688, 909689, 909690, 909691, 916217, 916218, 916219, 916220, 916221, 916222, 916223, 918500, 918501, 918502, 918503, 918504, 918505, 918506, 922357, 922358, 922359, 922360, 922361, 922362, 922363, 922364, 922365, 922366, 922367, 922368, 922369, 922370, 922743, 927858, 927859, 927860, 927861, 927862, 927863, 927864, 932275, 932276, 932277, 932278, 932279, 932280, 932281, 936001, 936002, 936003, 936004, 936005, 936006, 936007 |

</details>

## C. Year-by-year market favourite benchmarks

Competition rank is one plus the number of starters at shorter final SP. Equal prices share a rank and leave gaps. For example, 2.00, 2.00, 3.00 and 4.00 yield ranks 1, 1, 3 and 4. Each tied starter within a requested rank receives £1, so some races have multiple favourites or no second favourite. Final fractional SP is converted exactly where corroborated by the result evidence and the stored decimal, which is rounded to three places. SP is used for rank, probabilities and uncapped settlement. Explicit non-finishers lose one stake. A dead-heat winner receives its gross SP divided by the number of winners and contributes the same fraction of one market win.

For each complete race, expected wins are the sum of runner probabilities proportional to 1/SP. Actual/expected (A/E) divides fractional winner credit by that sum. The ROI implied by the overround alone is the mean of 1/book − 1 over the selected runners, where book is the sum of raw inverse SP. This isolates the scale implied by the margin under proportional normalisation. Positive A/E may coexist with negative ROI. Final SP is end-of-market hindsight.

| Family | Year | Rank group | Races | Selections / settled | Winners | Strike | Exp. wins | A/E | £1 P/L | ROI | Mean / median SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chase | 2025 | Favourite | 1,702 | 1,832 / 1,832 | 600 | 32.8% | 599.6 | 1.00 | −£211.25 | -11.5% | 3.05 / 2.88 |
| Chase | 2026 | Favourite | 1,372 | 1,479 / 1,479 | 525 | 35.5% | 492.4 | 1.07 | −£99.52 | -6.7% | 2.97 / 2.88 |
| Hurdle | 2025 | Favourite | 2,906 | 3,102 / 3,102 | 1,181 | 38.1% | 1063.7 | 1.11 | −£217.17 | -7.0% | 2.89 / 2.75 |
| Hurdle | 2026 | Favourite | 2,397 | 2,574 / 2,574 | 897 | 34.8% | 856.2 | 1.05 | −£347.87 | -13.5% | 2.95 / 2.75 |
| All Weather | 2025 | Favourite | 3,102 | 3,310 / 3,310 | 1,128 | 34.1% | 1031.2 | 1.09 | −£290.47 | -8.8% | 3.08 / 3.00 |
| All Weather | 2026 | Favourite | 2,508 | 2,687 / 2,687 | 905 | 33.7% | 851.2 | 1.06 | −£321.26 | -12.0% | 3.01 / 2.88 |
| Turf | 2025 | Favourite | 4,737 | 5,081 / 5,081 | 1,604 | 31.6% | 1557.8 | 1.03 | −£645.29 | -12.7% | 3.18 / 3.00 |
| Turf | 2026 | Favourite | 4,719 | 5,157 / 5,157 | 1,702 | 33.0% | 1606.1 | 1.06 | −£576.40 | -11.2% | 3.14 / 3.00 |

| Family | Jan–18 Nov stakes | Strike | ROI | ROI implied by margin | A/E | 95% date-bootstrap A/E (2025 / 2026) |
| --- | --- | --- | --- | --- | --- | --- |
| Chase | 1,504 → 1,479 | 33.1% → 35.5% | -10.4% → -6.7% | -12.4% → -13.2% | 1.01 → 1.07 | 0.94 to 1.09 → 0.99 to 1.14 |
| Hurdle | 2,573 → 2,574 | 38.2% → 34.8% | -6.2% → -13.5% | -15.7% → -16.7% | 1.12 → 1.05 | 1.06 to 1.17 → 0.99 to 1.10 |
| All Weather | 2,719 → 2,687 | 34.2% → 33.7% | -8.8% → -12.0% | -14.8% → -15.8% | 1.09 → 1.06 | 1.04 to 1.14 → 1.01 to 1.12 |
| Turf | 5,081 → 5,157 | 31.6% → 33.0% | -12.7% → -11.2% | -15.1% → -15.9% | 1.03 → 1.06 | 0.99 to 1.07 → 1.02 to 1.09 |

## D. Non-favourite performance by market rank

| Family | Year | Rank group | Races | Selections / settled | Winners | Strike | Exp. wins | A/E | £1 P/L | ROI | Mean / median SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chase | 2025 | Second | 1,579 | 1,738 / 1,738 | 392 | 22.6% | 363.8 | 1.08 | −£84.12 | -4.8% | 4.49 / 4.33 |
| Chase | 2026 | Second | 1,267 | 1,393 / 1,393 | 303 | 21.8% | 299.9 | 1.01 | −£168.07 | -12.1% | 4.35 / 4.33 |
| Chase | 2025 | Third | 1,515 | 1,719 / 1,719 | 232 | 13.5% | 253.2 | 0.92 | −£338.23 | -19.7% | 6.46 / 6.00 |
| Chase | 2026 | Third | 1,235 | 1,341 / 1,341 | 178 | 13.3% | 206.5 | 0.86 | −£361.75 | -27.0% | 6.19 / 5.50 |
| Chase | 2025 | 2–3 | 1,686 | 3,457 / 3,457 | 624 | 18.1% | 617.0 | 1.01 | −£422.36 | -12.2% | 5.47 / 5.00 |
| Chase | 2026 | 2–3 | 1,368 | 2,734 / 2,734 | 481 | 17.6% | 506.3 | 0.95 | −£529.82 | -19.4% | 5.25 / 5.00 |
| Chase | 2025 | 4–6 | 1,600 | 4,253 / 4,253 | 375 | 8.8% | 361.1 | 1.04 | −£726.17 | -17.1% | 14.19 / 10.00 |
| Chase | 2026 | 4–6 | 1,278 | 3,283 / 3,283 | 277 | 8.4% | 281.6 | 0.98 | −£551.25 | -16.8% | 13.90 / 10.00 |
| Chase | 2025 | 7+ | 935 | 3,539 / 3,539 | 103 | 2.9% | 124.3 | 0.83 | −£1401.50 | -39.6% | 37.84 / 23.00 |
| Chase | 2026 | 7+ | 676 | 2,602 / 2,602 | 90 | 3.5% | 91.6 | 0.98 | −£775.50 | -29.8% | 35.75 / 23.00 |
| Chase | 2025 | Non-favourites | 1,697 | 11,249 / 11,249 | 1,102 | 9.8% | 1102.4 | 1.00 | −£2550.03 | -22.7% | 18.95 / 10.00 |
| Chase | 2026 | Non-favourites | 1,371 | 8,619 / 8,619 | 848 | 9.8% | 879.6 | 0.96 | −£1856.57 | -21.5% | 17.76 / 10.00 |
| Hurdle | 2025 | Second | 2,717 | 2,968 / 2,968 | 576 | 19.4% | 594.3 | 0.97 | −£562.88 | -19.0% | 4.62 / 4.50 |
| Hurdle | 2026 | Second | 2,232 | 2,439 / 2,439 | 520 | 21.3% | 497.0 | 1.05 | −£340.75 | -14.0% | 4.46 / 4.33 |
| Hurdle | 2025 | Third | 2,660 | 2,929 / 2,929 | 396 | 13.5% | 397.8 | 1.00 | −£586.82 | -20.0% | 7.13 / 6.00 |
| Hurdle | 2026 | Third | 2,184 | 2,393 / 2,393 | 304 | 12.7% | 327.3 | 0.93 | −£623.33 | -26.0% | 7.01 / 6.00 |
| Hurdle | 2025 | 2–3 | 2,898 | 5,897 / 5,897 | 972 | 16.5% | 992.1 | 0.98 | −£1149.70 | -19.5% | 5.87 / 5.00 |
| Hurdle | 2026 | 2–3 | 2,385 | 4,832 / 4,832 | 824 | 17.1% | 824.4 | 1.00 | −£964.08 | -20.0% | 5.72 / 5.00 |
| Hurdle | 2025 | 4–6 | 2,839 | 8,147 / 8,147 | 534 | 6.6% | 580.7 | 0.92 | −£2397.67 | -29.4% | 20.91 / 11.00 |
| Hurdle | 2026 | 4–6 | 2,350 | 6,774 / 6,774 | 464 | 6.8% | 488.2 | 0.95 | −£1879.17 | -27.7% | 20.43 / 11.00 |
| Hurdle | 2025 | 7+ | 2,145 | 10,657 / 10,657 | 219 | 2.1% | 269.5 | 0.81 | −£4884.00 | -45.8% | 70.14 / 34.00 |
| Hurdle | 2026 | 7+ | 1,836 | 9,027 / 9,027 | 214 | 2.4% | 228.2 | 0.94 | −£3812.00 | -42.2% | 74.53 / 34.00 |
| Hurdle | 2025 | Non-favourites | 2,905 | 24,701 / 24,701 | 1,725 | 7.0% | 1842.3 | 0.94 | −£8431.37 | -34.1% | 38.56 / 15.00 |
| Hurdle | 2026 | Non-favourites | 2,397 | 20,633 / 20,633 | 1,502 | 7.3% | 1540.8 | 0.97 | −£6655.25 | -32.3% | 40.66 / 15.00 |
| All Weather | 2025 | Second | 2,904 | 3,217 / 3,217 | 657 | 20.4% | 632.2 | 1.04 | −£404.73 | -12.6% | 4.61 / 4.50 |
| All Weather | 2026 | Second | 2,345 | 2,590 / 2,590 | 505 | 19.5% | 511.5 | 0.99 | −£483.58 | -18.7% | 4.55 / 4.50 |
| All Weather | 2025 | Third | 2,798 | 3,124 / 3,124 | 404 | 12.9% | 434.1 | 0.92 | −£720.03 | -23.0% | 6.76 / 6.00 |
| All Weather | 2026 | Third | 2,256 | 2,497 / 2,497 | 340 | 13.6% | 349.2 | 0.97 | −£469.35 | -18.8% | 6.59 / 6.00 |
| All Weather | 2025 | 2–3 | 3,092 | 6,341 / 6,341 | 1,061 | 16.7% | 1066.3 | 0.99 | −£1124.76 | -17.7% | 5.67 / 5.00 |
| All Weather | 2026 | 2–3 | 2,493 | 5,087 / 5,087 | 845 | 16.6% | 860.7 | 0.98 | −£952.93 | -18.7% | 5.55 / 5.00 |
| All Weather | 2025 | 4–6 | 3,081 | 9,041 / 9,041 | 658 | 7.3% | 708.0 | 0.93 | −£2441.75 | -27.0% | 16.24 / 11.00 |
| All Weather | 2026 | 4–6 | 2,496 | 7,362 / 7,362 | 548 | 7.4% | 566.9 | 0.96 | −£1805.08 | -24.5% | 16.61 / 11.00 |
| All Weather | 2025 | 7+ | 2,621 | 9,942 / 9,942 | 266 | 2.7% | 296.5 | 0.89 | −£3458.00 | -34.8% | 53.38 / 29.00 |
| All Weather | 2026 | 7+ | 2,105 | 7,967 / 7,967 | 216 | 2.7% | 229.2 | 0.94 | −£2690.00 | -33.8% | 56.37 / 34.00 |
| All Weather | 2025 | Non-favourites | 3,102 | 25,324 / 25,324 | 1,985 | 7.8% | 2070.8 | 0.95 | −£7024.51 | -27.7% | 28.17 / 13.00 |
| All Weather | 2026 | Non-favourites | 2,508 | 20,416 / 20,416 | 1,609 | 7.9% | 1656.8 | 0.97 | −£5448.02 | -26.7% | 29.37 / 13.00 |
| Turf | 2025 | Second | 4,412 | 4,909 / 4,909 | 996 | 20.3% | 955.1 | 1.04 | −£575.88 | -11.7% | 4.71 / 4.50 |
| Turf | 2026 | Second | 4,321 | 4,788 / 4,788 | 985 | 20.6% | 937.4 | 1.05 | −£556.42 | -11.6% | 4.67 / 4.50 |
| Turf | 2025 | Third | 4,252 | 4,714 / 4,714 | 620 | 13.2% | 652.8 | 0.95 | −£933.03 | -19.8% | 6.74 / 6.00 |
| Turf | 2026 | Third | 4,237 | 4,696 / 4,696 | 652 | 13.9% | 648.6 | 1.00 | −£828.94 | -17.7% | 6.80 / 6.00 |
| Turf | 2025 | 2–3 | 4,719 | 9,623 / 9,623 | 1,616 | 16.8% | 1607.9 | 1.00 | −£1508.92 | -15.7% | 5.70 / 5.50 |
| Turf | 2026 | 2–3 | 4,683 | 9,484 / 9,484 | 1,637 | 17.3% | 1586.0 | 1.03 | −£1385.36 | -14.6% | 5.72 / 5.50 |
| Turf | 2025 | 4–6 | 4,685 | 13,588 / 13,588 | 1,086 | 8.0% | 1072.3 | 1.01 | −£2389.48 | -17.6% | 14.86 / 11.00 |
| Turf | 2026 | 4–6 | 4,629 | 13,321 / 13,321 | 942 | 7.1% | 1035.6 | 0.91 | −£3522.50 | -26.4% | 15.99 / 11.00 |
| Turf | 2025 | 7+ | 3,699 | 16,262 / 16,262 | 440 | 2.7% | 499.1 | 0.88 | −£6043.75 | -37.2% | 48.69 / 29.00 |
| Turf | 2026 | 7+ | 3,559 | 16,524 / 16,524 | 443 | 2.7% | 491.3 | 0.90 | −£6140.00 | -37.2% | 50.45 / 29.00 |
| Turf | 2025 | Non-favourites | 4,737 | 39,473 / 39,473 | 3,142 | 8.0% | 3179.2 | 0.99 | −£9942.15 | -25.2% | 26.56 / 13.00 |
| Turf | 2026 | Non-favourites | 4,719 | 39,329 / 39,329 | 3,022 | 7.7% | 3112.9 | 0.97 | −£11047.86 | -28.1% | 27.99 / 13.00 |

| Family | Jan–18 Nov group | Stakes | Strike | Mean SP | A/E | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| Chase | Second | 1,428 → 1,393 | 22.6% → 21.8% | 4.52 → 4.35 | 1.08 → 1.01 | -3.6% → -12.1% |
| Chase | Third | 1,411 → 1,341 | 12.9% → 13.3% | 6.43 → 6.19 | 0.87 → 0.86 | -21.4% → -27.0% |
| Chase | 2–3 | 2,839 → 2,734 | 17.8% → 17.6% | 5.47 → 5.25 | 1.00 → 0.95 | -12.4% → -19.4% |
| Chase | 4–6 | 3,497 → 3,283 | 9.0% → 8.4% | 14.36 → 13.90 | 1.06 → 0.98 | -15.7% → -16.8% |
| Chase | 7+ | 2,898 → 2,602 | 2.8% → 3.5% | 37.46 → 35.75 | 0.80 → 0.98 | -40.6% → -29.8% |
| Chase | Non-favourites | 9,234 → 8,619 | 9.8% → 9.8% | 18.88 → 17.76 | 0.99 → 0.96 | -22.5% → -21.5% |
| Hurdle | Second | 2,463 → 2,439 | 18.9% → 21.3% | 4.65 → 4.46 | 0.95 → 1.05 | -20.1% → -14.0% |
| Hurdle | Third | 2,430 → 2,393 | 14.1% → 12.7% | 7.15 → 7.01 | 1.04 → 0.93 | -16.7% → -26.0% |
| Hurdle | 2–3 | 4,893 → 4,832 | 16.5% → 17.1% | 5.89 → 5.72 | 0.99 → 1.00 | -18.4% → -20.0% |
| Hurdle | 4–6 | 6,759 → 6,774 | 6.4% → 6.8% | 20.99 → 20.43 | 0.89 → 0.95 | -30.7% → -27.7% |
| Hurdle | 7+ | 8,838 → 9,027 | 2.2% → 2.4% | 68.05 → 74.53 | 0.83 → 0.94 | -47.7% → -42.2% |
| Hurdle | Non-favourites | 20,490 → 20,633 | 7.0% → 7.3% | 37.68 → 40.66 | 0.93 → 0.97 | -35.1% → -32.3% |
| All Weather | Second | 2,650 → 2,590 | 20.2% → 19.5% | 4.62 → 4.55 | 1.02 → 0.99 | -13.7% → -18.7% |
| All Weather | Third | 2,565 → 2,497 | 12.9% → 13.6% | 6.80 → 6.59 | 0.92 → 0.97 | -23.6% → -18.8% |
| All Weather | 2–3 | 5,215 → 5,087 | 16.6% → 16.6% | 5.69 → 5.55 | 0.98 → 0.98 | -18.6% → -18.7% |
| All Weather | 4–6 | 7,417 → 7,362 | 7.5% → 7.4% | 16.59 → 16.61 | 0.96 → 0.96 | -24.3% → -24.5% |
| All Weather | 7+ | 7,992 → 7,967 | 2.6% → 2.7% | 53.52 → 56.37 | 0.86 → 0.94 | -36.3% → -33.8% |
| All Weather | Non-favourites | 20,624 → 20,416 | 7.9% → 7.9% | 28.14 → 29.37 | 0.95 → 0.97 | -27.5% → -26.7% |
| Turf | Second | 4,909 → 4,788 | 20.3% → 20.6% | 4.71 → 4.67 | 1.04 → 1.05 | -11.7% → -11.6% |
| Turf | Third | 4,714 → 4,696 | 13.2% → 13.9% | 6.74 → 6.80 | 0.95 → 1.00 | -19.8% → -17.7% |
| Turf | 2–3 | 9,623 → 9,484 | 16.8% → 17.3% | 5.70 → 5.72 | 1.00 → 1.03 | -15.7% → -14.6% |
| Turf | 4–6 | 13,588 → 13,321 | 8.0% → 7.1% | 14.86 → 15.99 | 1.01 → 0.91 | -17.6% → -26.4% |
| Turf | 7+ | 16,262 → 16,524 | 2.7% → 2.7% | 48.69 → 50.45 | 0.88 → 0.90 | -37.2% → -37.2% |
| Turf | Non-favourites | 39,473 → 39,329 | 8.0% → 7.7% | 26.56 → 27.99 | 0.99 → 0.97 | -25.2% → -28.1% |

Turf second favourites are a useful market calibration check. Their proportional-SP A/E was 1.04 and 1.05, with approximate 95% ranges of 0.99–1.10 and 1.00–1.11 before rounding. ROI was −11.7% and −11.6%. Favourites were above proportional market expectation in all eight matched family-years, though some intervals include 1. Every predefined runner group lost at SP in both years. The A/E intervals leave uncertainty about persistent Turf second-favourite undervaluation.

## E. Existing system results excluding favourites

The rule evaluator was rerun on the original cache populations, with only evaluation dates changed for cross-year transfer. Chase uses the top 20 prior-year trainers, days since run ≥30, prior runs ≥5, trainer and jockey rates ≥14% and ≥15%, and OR ranks 1–3. Its saved name says non summer and its canonical rule contains no summer exclusion. The two Jump handicap records share one canonical identity. Both use top 20 prior-year trainers, handicaps, 154–163 lb, ≥14 days since run and trainer prior rate ≥14%. The Turf rule uses top 30 prior-year trainers, 1–50 days since run, latest Performance rank 2–5 and TPR_S2_V1 rank 1. Frozen selection indices and stage classification were computed before attaching the independent final-SP audit. [Saved rule replay and former settlement differences](research-filter-cross-year-2026-11-18.md)

Chase V2 reproduces the frozen Set A feature vector and coefficients on 2025 development inputs, with publication-time limits. The 2026 historical book uses all 1,220 stored promotion fields through 29 October. The 1,154 through 14 October match the pinned isolated reconstruction. The additional 66 match the audited database and locally retained final fields exactly on date, starter roster and winners. The matched comparison stops on 14 October. Model and base hashes agree and the live Chase adjustment is zero. AW Tissue V1 uses the original AW-T0 historical feature builder. AW V2 uses the frozen scorer and original audited vector builder. Its regenerated 45,250 rows and prior-source query exactly match the hashes recorded in the model. AW-D and AW-A use the existing rating implementations with the AW-D coverage gate and the existing historical AW-A minimum of two rated runners. All select native rank/leader before the SP join. [Chase promotion overlap](chase-tissue-all-ranks-earlier-2026.md) · [Frozen AW V2](../data/research/aw-tissue-model-v2.json)

| System | Year | Cut | Original selections in cut | SP settled / market n | Races / dates with stakes¹ | Wins | Strike | A/E | Mean SP | P/L (ROI) | After 2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Saved Chase filter | 2025 | Full | 450 | 450 / 450 | 385 / 206 | 110 | 24.4% | 1.07 | 6.48 | £32.51 (7.2%) | −£17.49 (-3.9%) |
| Saved Chase filter | 2026 | Full | 345 | 345 / 345 | 290 / 154 | 84 | 24.3% | 1.02 | 6.25 | −£56.40 (-16.3%) | −£70.90 (-20.7%) |
| Jump handicap (both saved names) | 2025 | Full | 2,010 | 1,882 / 1,882 | 1,263 / 296 | 274 | 14.6% | 1.03 | 10.62 | −£165.87 (-8.8%) | −£275.87 (-14.7%) |
| Jump handicap (both saved names) | 2026 | Full | 1,387 | 1,284 / 1,284 | 853 / 228 | 170 | 13.2% | 0.96 | 12.08 | −£212.44 (-16.5%) | −£318.44 (-25.0%) |
| Turf trainer / TPR | 2025 | Full | 515 | 514 / 514 | 515 / 166 | 115 | 22.4% | 1.12 | 9.35 | £131.17 (25.5%) | −£51.83 (-10.1%) |
| Turf trainer / TPR | 2026 | Full | 413 | 413 / 413 | 413 / 144 | 65 | 15.7% | 0.80 | 10.36 | £146.88 (35.6%) | −£93.12 (-22.7%) |
| Chase V2 T1 | 2025 | Full | 1,698 | 1,698 / 1,698 | 1,698 / 314 | 443 | 26.1% | 1.04 | 5.19 | −£141.55 (-8.3%) | −£186.55 (-11.0%) |
| Chase V2 T1 | 2026 | Full | 1,220 | 1,220 / 1,220 | 1,220 / 251 | 321 | 26.3% | 1.02 | 5.21 | −£152.65 (-12.5%) | −£196.65 (-16.1%) |
| Chase V2 T2 | 2025 | Full | 1,698 | 1,698 / 1,698 | 1,698 / 314 | 340 | 20.0% | 1.03 | 7.07 | −£121.12 (-7.1%) | −£176.12 (-10.4%) |
| Chase V2 T2 | 2026 | Full | 1,220 | 1,220 / 1,220 | 1,220 / 251 | 233 | 19.1% | 0.98 | 6.98 | −£191.99 (-15.7%) | −£239.99 (-19.7%) |
| Chase V2 T3 | 2025 | Full | 1,677 | 1,677 / 1,677 | 1,677 / 314 | 290 | 17.3% | 1.11 | 9.21 | −£31.93 (-1.9%) | −£125.93 (-7.5%) |
| Chase V2 T3 | 2026 | Full | 1,211 | 1,211 / 1,211 | 1,211 / 250 | 200 | 16.5% | 1.02 | 9.14 | −£176.01 (-14.5%) | −£218.01 (-18.0%) |
| Chase V2 T4 | 2025 | Full | 1,608 | 1,608 / 1,608 | 1,608 / 314 | 211 | 13.1% | 1.00 | 11.79 | −£275.95 (-17.2%) | −£319.95 (-19.9%) |
| Chase V2 T4 | 2026 | Full | 1,148 | 1,148 / 1,148 | 1,148 / 250 | 165 | 14.4% | 1.06 | 11.69 | −£87.53 (-7.6%) | −£203.53 (-17.8%) |
| Chase V2 T5 | 2025 | Full | 1,450 | 1,450 / 1,450 | 1,450 / 309 | 123 | 8.5% | 0.83 | 16.95 | −£400.31 (-27.6%) | −£483.31 (-33.4%) |
| Chase V2 T5 | 2026 | Full | 987 | 987 / 987 | 987 / 245 | 102 | 10.3% | 0.97 | 15.12 | −£188.43 (-19.1%) | −£263.43 (-26.7%) |
| AW Tissue V1 T1 | 2025 | Full | 3,091 | 3,091 / 3,091 | 3,091 / 259 | 717 | 23.2% | 1.06 | 6.38 | −£433.41 (-14.0%) | −£488.41 (-15.8%) |
| AW Tissue V1 T1 | 2026 | Full | 2,002 | 2,002 / 2,002 | 2,002 / 178 | 480 | 24.0% | 1.06 | 6.80 | −£178.30 (-8.9%) | −£291.30 (-14.6%) |
| AW Tissue V2 T1 | 2025 | Full | 3,028 | 3,028 / 3,028 | 3,028 / 259 | 764 | 25.2% | 1.09 | 5.97 | −£312.92 (-10.3%) | −£359.92 (-11.9%) |
| AW Tissue V2 T1 | 2026 | Full | 1,947 | 1,947 / 1,947 | 1,947 / 178 | 515 | 26.5% | 1.09 | 5.58 | −£257.57 (-13.2%) | −£298.57 (-15.4%) |
| AW-D leader | 2025 | Full | 2,957 | 2,957 / 2,957 | 2,957 / 259 | 594 | 20.1% | 1.05 | 8.85 | −£434.42 (-14.7%) | −£487.42 (-16.5%) |
| AW-D leader | 2026 | Full | 1,911 | 1,911 / 1,911 | 1,911 / 178 | 406 | 21.2% | 1.07 | 9.05 | −£218.41 (-11.4%) | −£279.41 (-14.6%) |
| AW-A leader | 2025 | Full | 2,968 | 2,968 / 2,968 | 2,968 / 259 | 545 | 18.4% | 1.00 | 10.16 | −£657.39 (-22.1%) | −£710.39 (-24.0%) |
| AW-A leader | 2026 | Full | 1,919 | 1,919 / 1,919 | 1,919 / 178 | 382 | 19.9% | 1.04 | 10.67 | −£300.69 (-15.7%) | −£353.69 (-18.5%) |

¹ Races counts all selections and dates counts SP stakes. An unranked or unpriced original selection remains in Full. Rank cuts require a complete market. The retained archived rule replay recalculated the same pre-audit full-year SP totals as the prior report. The stricter database join here can withhold stakes from an unreconciled field and uses exact fractional SP where verified, so small monetary differences are expected.

| Same calendar dates | Window | Full stakes | No-fav stakes | Full ROI | No-fav ROI | Full A/E | No-fav A/E | No-fav ROI after biggest two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Saved Chase filter | 01-01–10-14 | 281 → 345 | 200 → 230 | 12.7% → -16.3% | 22.0% → -23.2% | 1.11 → 1.02 | 1.18 → 1.02 | -1.1% → -29.9% |
| Jump handicap (both saved names) | 01-01–10-14 | 1,278 → 1,284 | 1,042 → 1,045 | -11.9% → -16.5% | -11.6% → -15.2% | 0.98 → 0.96 | 0.96 → 0.98 | -19.2% → -25.7% |
| Turf trainer / TPR | 02-15–09-19 | 424 → 413 | 293 → 285 | 41.4% → 35.6% | 56.0% → 70.1% | 1.22 → 0.80 | 1.18 → 0.91 | -6.5% → -14.2% |
| Chase V2 T1 | 01-01–10-14 | 1,181 → 1,154 | 669 → 644 | -9.0% → -12.5% | -12.0% → -13.4% | 1.02 → 1.03 | 0.98 → 1.05 | -18.8% → -20.0% |
| Chase V2 T2 | 01-01–10-14 | 1,181 → 1,154 | 877 → 883 | -6.6% → -14.5% | -6.3% → -18.6% | 1.03 → 0.99 | 1.03 → 0.90 | -12.6% → -24.0% |
| Chase V2 T3 | 01-01–10-14 | 1,171 → 1,145 | 995 → 974 | -1.7% → -15.4% | -0.4% → -17.4% | 1.12 → 1.01 | 1.16 → 0.99 | -9.5% → -21.8% |
| Chase V2 T4 | 01-01–10-14 | 1,128 → 1,084 | 1,017 → 955 | -14.0% → -8.8% | -13.8% → -10.6% | 1.00 → 1.04 | 1.03 → 0.96 | -18.1% → -22.8% |
| Chase V2 T5 | 01-01–10-14 | 1,008 → 934 | 949 → 870 | -27.2% → -15.8% | -25.7% → -15.8% | 0.84 → 1.00 | 0.89 → 1.00 | -34.6% → -24.4% |
| AW Tissue V1 T1 | 01-01–09-21 | 1,959 → 2,002 | 1,266 → 1,240 | -15.9% → -8.9% | -23.3% → -8.5% | 1.04 → 1.06 | 0.92 → 1.04 | -27.7% → -17.6% |
| AW Tissue V2 T1 | 01-01–09-21 | 1,926 → 1,947 | 1,146 → 1,087 | -6.5% → -13.2% | -13.3% → -18.6% | 1.11 → 1.09 | 1.00 → 1.04 | -17.4% → -22.4% |
| AW-D leader | 01-01–09-21 | 1,873 → 1,911 | 1,312 → 1,303 | -13.8% → -11.4% | -18.8% → -10.7% | 1.05 → 1.07 | 0.96 → 1.11 | -22.9% → -15.5% |
| AW-A leader | 01-01–09-21 | 1,877 → 1,919 | 1,380 → 1,371 | -23.0% → -15.7% | -29.4% → -15.5% | 1.00 → 1.04 | 0.89 → 1.07 | -32.1% → -19.4% |

<details>
<summary>Full five-way cuts by system and year</summary>

| System | Year | Cut | Original selections in cut | SP settled / market n | Races / dates with stakes¹ | Wins | Strike | A/E | Mean SP | P/L (ROI) | After 2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Saved Chase filter | 2025 | Full | 281 | 281 / 281 | 246 / 144 | 71 | 25.3% | 1.11 | 6.34 | £35.82 (12.7%) | −£10.18 (-3.7%) |
| Saved Chase filter | 2026 | Full | 345 | 345 / 345 | 290 / 154 | 84 | 24.3% | 1.02 | 6.25 | −£56.40 (-16.3%) | −£70.90 (-20.7%) |
| Saved Chase filter | 2025 | No fav | 200 | 200 / 200 | 182 / 114 | 37 | 18.5% | 1.18 | 7.89 | £43.92 (22.0%) | −£2.08 (-1.1%) |
| Saved Chase filter | 2026 | No fav | 230 | 230 / 230 | 209 / 124 | 37 | 16.1% | 1.02 | 8.07 | −£53.34 (-23.2%) | −£67.84 (-29.9%) |
| Saved Chase filter | 2025 | 2–3 | 111 | 111 / 111 | 107 / 85 | 27 | 24.3% | 1.16 | 4.73 | £10.43 (9.4%) | −£1.57 (-1.4%) |
| Saved Chase filter | 2026 | 2–3 | 134 | 134 / 134 | 131 / 99 | 30 | 22.4% | 1.07 | 4.69 | −£7.34 (-5.5%) | −£19.84 (-15.0%) |
| Saved Chase filter | 2025 | 4–6 | 72 | 72 / 72 | 71 / 54 | 8 | 11.1% | 1.10 | 9.83 | £1.50 (2.1%) | −£19.50 (-27.9%) |
| Saved Chase filter | 2026 | 4–6 | 71 | 71 / 71 | 71 / 57 | 7 | 9.9% | 0.97 | 9.79 | −£21.00 (-29.6%) | −£36.50 (-52.9%) |
| Saved Chase filter | 2025 | 7+ | 17 | 17 / 17 | 17 / 16 | 2 | 11.8% | 2.68 | 20.29 | £32.00 (188.2%) | −£15.00 (-100.0%) |
| Saved Chase filter | 2026 | 7+ | 25 | 25 / 25 | 24 / 19 | 0 | 0.0% | 0.00 | 21.32 | −£25.00 (-100.0%) | — |
| Jump handicap (both saved names) | 2025 | Full | 1,372 | 1,278 / 1,278 | 872 / 221 | 179 | 14.0% | 0.98 | 10.75 | −£151.70 (-11.9%) | −£229.70 (-18.1%) |
| Jump handicap (both saved names) | 2026 | Full | 1,387 | 1,284 / 1,284 | 853 / 228 | 170 | 13.2% | 0.96 | 12.08 | −£212.44 (-16.5%) | −£318.44 (-25.0%) |
| Jump handicap (both saved names) | 2025 | No fav | 1,042 | 1,042 / 1,042 | 704 / 211 | 107 | 10.3% | 0.96 | 12.44 | −£120.96 (-11.6%) | −£198.96 (-19.2%) |
| Jump handicap (both saved names) | 2026 | No fav | 1,045 | 1,045 / 1,045 | 680 / 214 | 105 | 10.0% | 0.98 | 14.09 | −£159.32 (-15.2%) | −£266.32 (-25.7%) |
| Jump handicap (both saved names) | 2025 | 2–3 | 368 | 368 / 368 | 348 / 167 | 61 | 16.6% | 0.94 | 5.41 | −£46.79 (-12.7%) | −£62.29 (-17.1%) |
| Jump handicap (both saved names) | 2026 | 2–3 | 341 | 341 / 341 | 320 / 163 | 63 | 18.5% | 1.02 | 5.26 | −£47.82 (-14.0%) | −£61.82 (-18.2%) |
| Jump handicap (both saved names) | 2025 | 4–6 | 378 | 378 / 378 | 323 / 155 | 30 | 7.9% | 0.86 | 10.37 | −£126.17 (-33.4%) | −£149.17 (-39.8%) |
| Jump handicap (both saved names) | 2026 | 4–6 | 349 | 349 / 349 | 312 / 166 | 27 | 7.7% | 0.83 | 9.79 | −£104.00 (-29.8%) | −£130.00 (-37.5%) |
| Jump handicap (both saved names) | 2025 | 7+ | 296 | 296 / 296 | 217 / 114 | 16 | 5.4% | 1.31 | 23.82 | £52.00 (17.6%) | −£28.00 (-9.6%) |
| Jump handicap (both saved names) | 2026 | 7+ | 355 | 355 / 355 | 240 / 135 | 15 | 4.2% | 1.12 | 26.79 | −£7.50 (-2.1%) | −£115.50 (-33.2%) |
| Turf trainer / TPR | 2025 | Full | 425 | 424 / 424 | 425 / 133 | 104 | 24.5% | 1.22 | 9.92 | £175.61 (41.4%) | −£7.39 (-1.8%) |
| Turf trainer / TPR | 2026 | Full | 413 | 413 / 413 | 413 / 144 | 65 | 15.7% | 0.80 | 10.36 | £146.88 (35.6%) | −£93.12 (-22.7%) |
| Turf trainer / TPR | 2025 | No fav | 293 | 293 / 293 | 293 / 117 | 44 | 15.0% | 1.18 | 13.14 | £164.13 (56.0%) | −£18.88 (-6.5%) |
| Turf trainer / TPR | 2026 | No fav | 285 | 285 / 285 | 285 / 122 | 34 | 11.9% | 0.91 | 13.74 | £199.88 (70.1%) | −£40.13 (-14.2%) |
| Turf trainer / TPR | 2025 | 2–3 | 148 | 148 / 148 | 148 / 83 | 30 | 20.3% | 1.08 | 5.07 | −£0.88 (-0.6%) | −£15.88 (-10.9%) |
| Turf trainer / TPR | 2026 | 2–3 | 147 | 147 / 147 | 147 / 84 | 20 | 13.6% | 0.74 | 5.04 | −£55.63 (-37.8%) | −£66.13 (-45.6%) |
| Turf trainer / TPR | 2025 | 4–6 | 85 | 85 / 85 | 85 / 64 | 11 | 12.9% | 1.47 | 12.79 | £171.00 (201.2%) | −£12.00 (-14.5%) |
| Turf trainer / TPR | 2026 | 4–6 | 96 | 96 / 96 | 96 / 70 | 9 | 9.4% | 1.05 | 14.14 | −£3.50 (-3.6%) | −£40.50 (-43.1%) |
| Turf trainer / TPR | 2025 | 7+ | 60 | 60 / 60 | 60 / 41 | 3 | 5.0% | 1.39 | 33.52 | −£6.00 (-10.0%) | −£45.00 (-77.6%) |
| Turf trainer / TPR | 2026 | 7+ | 42 | 42 / 42 | 42 / 36 | 5 | 11.9% | 3.44 | 43.29 | £259.00 (616.7%) | £19.00 (47.5%) |
| Chase V2 T1 | 2025 | Full | 1,181 | 1,181 / 1,181 | 1,181 / 239 | 304 | 25.7% | 1.02 | 5.15 | −£106.39 (-9.0%) | −£151.39 (-12.8%) |
| Chase V2 T1 | 2026 | Full | 1,154 | 1,154 / 1,154 | 1,154 / 237 | 306 | 26.5% | 1.03 | 5.20 | −£144.80 (-12.5%) | −£186.80 (-16.2%) |
| Chase V2 T1 | 2025 | No fav | 669 | 669 / 669 | 669 / 221 | 108 | 16.1% | 0.98 | 6.99 | −£80.38 (-12.0%) | −£125.38 (-18.8%) |
| Chase V2 T1 | 2026 | No fav | 644 | 644 / 644 | 644 / 220 | 112 | 17.4% | 1.05 | 7.20 | −£86.38 (-13.4%) | −£128.38 (-20.0%) |
| Chase V2 T1 | 2025 | 2–3 | 444 | 444 / 444 | 444 / 196 | 83 | 18.7% | 0.93 | 4.77 | −£71.72 (-16.2%) | −£87.72 (-19.8%) |
| Chase V2 T1 | 2026 | 2–3 | 406 | 406 / 406 | 406 / 197 | 92 | 22.7% | 1.09 | 4.62 | −£23.37 (-5.8%) | −£35.87 (-8.9%) |
| Chase V2 T1 | 2025 | 4–6 | 178 | 178 / 178 | 178 / 117 | 23 | 12.9% | 1.24 | 9.42 | −£8.67 (-4.9%) | −£27.67 (-15.7%) |
| Chase V2 T1 | 2026 | 4–6 | 191 | 191 / 191 | 191 / 124 | 18 | 9.4% | 0.88 | 8.95 | −£60.00 (-31.4%) | −£82.00 (-43.4%) |
| Chase V2 T1 | 2025 | 7+ | 47 | 47 / 47 | 47 / 36 | 2 | 4.3% | 0.81 | 18.69 | £0.00 (0.0%) | −£45.00 (-100.0%) |
| Chase V2 T1 | 2026 | 7+ | 47 | 47 / 47 | 47 / 42 | 2 | 4.3% | 0.92 | 22.38 | −£3.00 (-6.4%) | −£45.00 (-100.0%) |
| Chase V2 T2 | 2025 | Full | 1,181 | 1,181 / 1,181 | 1,181 / 239 | 238 | 20.2% | 1.03 | 7.08 | −£78.43 (-6.6%) | −£133.43 (-11.3%) |
| Chase V2 T2 | 2026 | Full | 1,154 | 1,154 / 1,154 | 1,154 / 237 | 223 | 19.3% | 0.99 | 7.02 | −£167.81 (-14.5%) | −£215.81 (-18.7%) |
| Chase V2 T2 | 2025 | No fav | 877 | 877 / 877 | 877 / 233 | 133 | 15.2% | 1.03 | 8.52 | −£55.67 (-6.3%) | −£110.67 (-12.6%) |
| Chase V2 T2 | 2026 | No fav | 883 | 883 / 883 | 883 / 232 | 121 | 13.7% | 0.90 | 8.29 | −£163.88 (-18.6%) | −£211.88 (-24.0%) |
| Chase V2 T2 | 2025 | 2–3 | 498 | 498 / 498 | 498 / 209 | 101 | 20.3% | 1.05 | 5.14 | −£27.17 (-5.5%) | −£42.17 (-8.5%) |
| Chase V2 T2 | 2026 | 2–3 | 503 | 503 / 503 | 503 / 212 | 86 | 17.1% | 0.84 | 4.85 | −£144.88 (-28.8%) | −£157.38 (-31.4%) |
| Chase V2 T2 | 2025 | 4–6 | 298 | 298 / 298 | 298 / 164 | 29 | 9.7% | 0.99 | 10.50 | −£23.50 (-7.9%) | −£53.50 (-18.1%) |
| Chase V2 T2 | 2026 | 4–6 | 290 | 290 / 290 | 290 / 161 | 30 | 10.3% | 1.09 | 10.53 | £7.00 (2.4%) | −£41.00 (-14.2%) |
| Chase V2 T2 | 2025 | 7+ | 81 | 81 / 81 | 81 / 67 | 3 | 3.7% | 0.82 | 22.02 | −£5.00 (-6.2%) | −£60.00 (-75.9%) |
| Chase V2 T2 | 2026 | 7+ | 90 | 90 / 90 | 90 / 73 | 5 | 5.6% | 1.16 | 20.28 | −£26.00 (-28.9%) | −£50.00 (-56.8%) |
| Chase V2 T3 | 2025 | Full | 1,171 | 1,171 / 1,171 | 1,171 / 239 | 202 | 17.3% | 1.12 | 9.48 | −£20.48 (-1.7%) | −£111.48 (-9.5%) |
| Chase V2 T3 | 2026 | Full | 1,145 | 1,145 / 1,145 | 1,145 / 236 | 187 | 16.3% | 1.01 | 9.19 | −£176.76 (-15.4%) | −£218.76 (-19.1%) |
| Chase V2 T3 | 2025 | No fav | 995 | 995 / 995 | 995 / 238 | 146 | 14.7% | 1.16 | 10.60 | −£3.73 (-0.4%) | −£94.73 (-9.5%) |
| Chase V2 T3 | 2026 | No fav | 974 | 974 / 974 | 974 / 235 | 129 | 13.2% | 0.99 | 10.28 | −£169.68 (-17.4%) | −£211.68 (-21.8%) |
| Chase V2 T3 | 2025 | 2–3 | 460 | 460 / 460 | 460 / 194 | 95 | 20.7% | 1.15 | 5.75 | −£9.73 (-2.1%) | −£29.23 (-6.4%) |
| Chase V2 T3 | 2026 | 2–3 | 480 | 480 / 480 | 480 / 196 | 90 | 18.8% | 1.00 | 5.43 | −£54.18 (-11.3%) | −£80.18 (-16.8%) |
| Chase V2 T3 | 2025 | 4–6 | 412 | 412 / 412 | 412 / 197 | 45 | 10.9% | 1.20 | 11.97 | −£29.00 (-7.0%) | −£65.00 (-15.9%) |
| Chase V2 T3 | 2026 | 4–6 | 399 | 399 / 399 | 399 / 198 | 34 | 8.5% | 0.94 | 12.33 | −£98.50 (-24.7%) | −£126.50 (-31.9%) |
| Chase V2 T3 | 2025 | 7+ | 123 | 123 / 123 | 123 / 91 | 6 | 4.9% | 1.09 | 24.16 | £35.00 (28.5%) | −£56.00 (-46.3%) |
| Chase V2 T3 | 2026 | 7+ | 95 | 95 / 95 | 95 / 76 | 5 | 5.3% | 1.17 | 26.17 | −£17.00 (-17.9%) | −£59.00 (-63.4%) |
| Chase V2 T4 | 2025 | Full | 1,128 | 1,128 / 1,128 | 1,128 / 239 | 147 | 13.0% | 1.00 | 11.56 | −£158.23 (-14.0%) | −£202.23 (-18.0%) |
| Chase V2 T4 | 2026 | Full | 1,084 | 1,084 / 1,084 | 1,084 / 236 | 151 | 13.9% | 1.04 | 11.84 | −£95.01 (-8.8%) | −£211.01 (-19.5%) |
| Chase V2 T4 | 2025 | No fav | 1,017 | 1,017 / 1,017 | 1,017 / 239 | 120 | 11.8% | 1.03 | 12.45 | −£139.92 (-13.8%) | −£183.92 (-18.1%) |
| Chase V2 T4 | 2026 | No fav | 955 | 955 / 955 | 955 / 233 | 106 | 11.1% | 0.96 | 12.99 | −£101.01 (-10.6%) | −£217.01 (-22.8%) |
| Chase V2 T4 | 2025 | 2–3 | 371 | 371 / 371 | 371 / 189 | 63 | 17.0% | 0.96 | 5.44 | −£42.92 (-11.6%) | −£72.42 (-19.6%) |
| Chase V2 T4 | 2026 | 2–3 | 341 | 341 / 341 | 341 / 173 | 62 | 18.2% | 0.99 | 5.23 | −£58.51 (-17.2%) | −£72.01 (-21.2%) |
| Chase V2 T4 | 2025 | 4–6 | 496 | 496 / 496 | 496 / 199 | 51 | 10.3% | 1.14 | 13.02 | −£47.00 (-9.5%) | −£83.00 (-16.8%) |
| Chase V2 T4 | 2026 | 4–6 | 470 | 470 / 470 | 470 / 203 | 38 | 8.1% | 0.92 | 14.40 | −£1.50 (-0.3%) | −£117.50 (-25.1%) |
| Chase V2 T4 | 2025 | 7+ | 150 | 150 / 150 | 150 / 105 | 6 | 4.0% | 0.93 | 27.85 | −£50.00 (-33.3%) | −£94.00 (-63.5%) |
| Chase V2 T4 | 2026 | 7+ | 144 | 144 / 144 | 144 / 96 | 6 | 4.2% | 1.02 | 26.76 | −£41.00 (-28.5%) | −£84.00 (-59.2%) |
| Chase V2 T5 | 2025 | Full | 1,008 | 1,008 / 1,008 | 1,008 / 234 | 87 | 8.6% | 0.84 | 16.90 | −£274.63 (-27.2%) | −£357.63 (-35.6%) |
| Chase V2 T5 | 2026 | Full | 934 | 934 / 934 | 934 / 231 | 99 | 10.6% | 1.00 | 15.28 | −£147.93 (-15.8%) | −£222.93 (-23.9%) |
| Chase V2 T5 | 2025 | No fav | 949 | 949 / 949 | 949 / 234 | 79 | 8.3% | 0.89 | 17.72 | −£244.22 (-25.7%) | −£327.22 (-34.6%) |
| Chase V2 T5 | 2026 | No fav | 870 | 870 / 870 | 870 / 229 | 82 | 9.4% | 1.00 | 16.15 | −£137.08 (-15.8%) | −£212.08 (-24.4%) |
| Chase V2 T5 | 2025 | 2–3 | 245 | 245 / 245 | 245 / 148 | 34 | 13.9% | 0.85 | 5.70 | −£65.72 (-26.8%) | −£80.22 (-33.0%) |
| Chase V2 T5 | 2026 | 2–3 | 224 | 224 / 224 | 224 / 139 | 34 | 15.2% | 0.93 | 5.64 | −£55.58 (-24.8%) | −£71.58 (-32.2%) |
| Chase V2 T5 | 2025 | 4–6 | 522 | 522 / 522 | 522 / 207 | 40 | 7.7% | 0.98 | 19.72 | −£110.50 (-21.2%) | −£176.50 (-33.9%) |
| Chase V2 T5 | 2026 | 4–6 | 492 | 492 / 492 | 492 / 199 | 41 | 8.3% | 1.05 | 16.87 | −£79.50 (-16.2%) | −£122.50 (-25.0%) |
| Chase V2 T5 | 2025 | 7+ | 182 | 182 / 182 | 182 / 115 | 5 | 2.7% | 0.66 | 28.15 | −£68.00 (-37.4%) | −£123.00 (-68.3%) |
| Chase V2 T5 | 2026 | 7+ | 154 | 154 / 154 | 154 / 111 | 7 | 4.5% | 1.14 | 29.15 | −£2.00 (-1.3%) | −£77.00 (-50.7%) |
| AW Tissue V1 T1 | 2025 | Full | 1,959 | 1,959 / 1,959 | 1,959 / 177 | 445 | 22.7% | 1.04 | 6.48 | −£310.87 (-15.9%) | −£365.87 (-18.7%) |
| AW Tissue V1 T1 | 2026 | Full | 2,002 | 2,002 / 2,002 | 2,002 / 178 | 480 | 24.0% | 1.06 | 6.80 | −£178.30 (-8.9%) | −£291.30 (-14.6%) |
| AW Tissue V1 T1 | 2025 | No fav | 1,266 | 1,266 / 1,266 | 1,266 / 176 | 166 | 13.1% | 0.92 | 8.52 | −£294.71 (-23.3%) | −£349.71 (-27.7%) |
| AW Tissue V1 T1 | 2026 | No fav | 1,240 | 1,240 / 1,240 | 1,240 / 178 | 183 | 14.8% | 1.04 | 9.33 | −£105.02 (-8.5%) | −£218.02 (-17.6%) |
| AW Tissue V1 T1 | 2025 | 2–3 | 724 | 724 / 724 | 724 / 173 | 118 | 16.3% | 0.87 | 5.04 | −£202.21 (-27.9%) | −£217.71 (-30.2%) |
| AW Tissue V1 T1 | 2026 | 2–3 | 711 | 711 / 711 | 711 / 176 | 143 | 20.1% | 1.07 | 4.90 | −£97.02 (-13.6%) | −£110.52 (-15.6%) |
| AW Tissue V1 T1 | 2025 | 4–6 | 394 | 394 / 394 | 394 / 157 | 41 | 10.4% | 1.07 | 9.71 | −£60.50 (-15.4%) | −£84.50 (-21.6%) |
| AW Tissue V1 T1 | 2026 | 4–6 | 394 | 394 / 394 | 394 / 150 | 31 | 7.9% | 0.85 | 11.50 | −£117.00 (-29.7%) | −£164.00 (-41.8%) |
| AW Tissue V1 T1 | 2025 | 7+ | 148 | 148 / 148 | 148 / 95 | 7 | 4.7% | 1.05 | 22.42 | −£32.00 (-21.6%) | −£87.00 (-59.6%) |
| AW Tissue V1 T1 | 2026 | 7+ | 135 | 135 / 135 | 135 / 92 | 9 | 6.7% | 1.50 | 26.29 | £109.00 (80.7%) | −£4.00 (-3.0%) |
| AW Tissue V2 T1 | 2025 | Full | 1,926 | 1,926 / 1,926 | 1,926 / 177 | 495 | 25.7% | 1.11 | 6.07 | −£125.34 (-6.5%) | −£172.34 (-9.0%) |
| AW Tissue V2 T1 | 2026 | Full | 1,947 | 1,947 / 1,947 | 1,947 / 178 | 515 | 26.5% | 1.09 | 5.58 | −£257.57 (-13.2%) | −£298.57 (-15.4%) |
| AW Tissue V2 T1 | 2025 | No fav | 1,146 | 1,146 / 1,146 | 1,146 / 176 | 170 | 14.8% | 1.00 | 8.32 | −£152.49 (-13.3%) | −£199.49 (-17.4%) |
| AW Tissue V2 T1 | 2026 | No fav | 1,087 | 1,087 / 1,087 | 1,087 / 177 | 170 | 15.6% | 1.04 | 7.88 | −£201.85 (-18.6%) | −£242.85 (-22.4%) |
| AW Tissue V2 T1 | 2025 | 2–3 | 703 | 703 / 703 | 703 / 170 | 129 | 18.3% | 0.97 | 4.96 | −£109.99 (-15.6%) | −£128.49 (-18.3%) |
| AW Tissue V2 T1 | 2026 | 2–3 | 668 | 668 / 668 | 668 / 172 | 140 | 21.0% | 1.09 | 4.80 | −£59.35 (-8.9%) | −£74.85 (-11.2%) |
| AW Tissue V2 T1 | 2025 | 4–6 | 338 | 338 / 338 | 338 / 156 | 35 | 10.4% | 1.10 | 10.56 | −£43.50 (-12.9%) | −£69.50 (-20.7%) |
| AW Tissue V2 T1 | 2026 | 4–6 | 332 | 332 / 332 | 332 / 144 | 26 | 7.8% | 0.82 | 10.45 | −£122.50 (-36.9%) | −£148.50 (-45.0%) |
| AW Tissue V2 T1 | 2025 | 7+ | 105 | 105 / 105 | 105 / 74 | 6 | 5.7% | 1.21 | 23.64 | £1.00 (1.0%) | −£46.00 (-44.7%) |
| AW Tissue V2 T1 | 2026 | 7+ | 87 | 87 / 87 | 87 / 67 | 4 | 4.6% | 0.98 | 21.71 | −£20.00 (-23.0%) | −£61.00 (-71.8%) |
| AW-D leader | 2025 | Full | 1,873 | 1,873 / 1,873 | 1,873 / 177 | 380 | 20.3% | 1.05 | 8.73 | −£258.11 (-13.8%) | −£311.11 (-16.6%) |
| AW-D leader | 2026 | Full | 1,911 | 1,911 / 1,911 | 1,911 / 178 | 406 | 21.2% | 1.07 | 9.05 | −£218.41 (-11.4%) | −£279.41 (-14.6%) |
| AW-D leader | 2025 | No fav | 1,312 | 1,312 / 1,312 | 1,312 / 177 | 165 | 12.6% | 0.96 | 11.25 | −£246.89 (-18.8%) | −£299.89 (-22.9%) |
| AW-D leader | 2026 | No fav | 1,303 | 1,303 / 1,303 | 1,303 / 178 | 186 | 14.3% | 1.11 | 11.99 | −£140.01 (-10.7%) | −£201.01 (-15.5%) |
| AW-D leader | 2025 | 2–3 | 679 | 679 / 679 | 679 / 170 | 106 | 15.6% | 0.86 | 5.27 | −£182.39 (-26.9%) | −£197.39 (-29.2%) |
| AW-D leader | 2026 | 2–3 | 635 | 635 / 635 | 635 / 168 | 134 | 21.1% | 1.15 | 5.15 | −£36.51 (-5.7%) | −£54.01 (-8.5%) |
| AW-D leader | 2025 | 4–6 | 448 | 448 / 448 | 448 / 160 | 52 | 11.6% | 1.26 | 11.58 | −£2.50 (-0.6%) | −£30.50 (-6.8%) |
| AW-D leader | 2026 | 4–6 | 480 | 480 / 480 | 480 / 163 | 42 | 8.8% | 0.99 | 11.88 | −£105.50 (-22.0%) | −£133.50 (-27.9%) |
| AW-D leader | 2025 | 7+ | 185 | 185 / 185 | 185 / 109 | 7 | 3.8% | 0.92 | 32.40 | −£62.00 (-33.5%) | −£115.00 (-62.8%) |
| AW-D leader | 2026 | 7+ | 188 | 188 / 188 | 188 / 116 | 10 | 5.3% | 1.32 | 35.39 | £2.00 (1.1%) | −£59.00 (-31.7%) |
| AW-A leader | 2025 | Full | 1,877 | 1,877 / 1,877 | 1,877 / 177 | 343 | 18.3% | 1.00 | 10.15 | −£430.98 (-23.0%) | −£466.98 (-24.9%) |
| AW-A leader | 2026 | Full | 1,919 | 1,919 / 1,919 | 1,919 / 178 | 382 | 19.9% | 1.04 | 10.67 | −£300.69 (-15.7%) | −£353.69 (-18.5%) |
| AW-A leader | 2025 | No fav | 1,380 | 1,380 / 1,380 | 1,380 / 177 | 153 | 11.1% | 0.89 | 12.78 | −£406.36 (-29.4%) | −£442.36 (-32.1%) |
| AW-A leader | 2026 | No fav | 1,371 | 1,371 / 1,371 | 1,371 / 178 | 186 | 13.6% | 1.07 | 13.85 | −£212.87 (-15.5%) | −£265.88 (-19.4%) |
| AW-A leader | 2025 | 2–3 | 642 | 642 / 642 | 642 / 169 | 99 | 15.4% | 0.85 | 5.24 | −£180.36 (-28.1%) | −£198.86 (-31.1%) |
| AW-A leader | 2026 | 2–3 | 688 | 688 / 688 | 688 / 173 | 132 | 19.2% | 1.06 | 5.21 | −£75.87 (-11.0%) | −£92.87 (-13.5%) |
| AW-A leader | 2025 | 4–6 | 512 | 512 / 512 | 512 / 167 | 47 | 9.2% | 1.01 | 11.97 | −£99.00 (-19.3%) | −£129.00 (-25.3%) |
| AW-A leader | 2026 | 4–6 | 478 | 478 / 478 | 478 / 161 | 47 | 9.8% | 1.11 | 13.03 | −£70.00 (-14.6%) | −£107.00 (-22.5%) |
| AW-A leader | 2025 | 7+ | 226 | 226 / 226 | 226 / 119 | 7 | 3.1% | 0.79 | 36.04 | −£127.00 (-56.2%) | −£163.00 (-72.8%) |
| AW-A leader | 2026 | 7+ | 205 | 205 / 205 | 205 / 118 | 7 | 3.4% | 0.90 | 44.71 | −£67.00 (-32.7%) | −£120.00 (-59.1%) |

The detail above uses matched dates. Below, the same cuts use the full covered annual replay where it extends beyond the matched window.

| System | Year | Cut | Original selections in cut | SP settled / market n | Races / dates with stakes¹ | Wins | Strike | A/E | Mean SP | P/L (ROI) | After 2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Saved Chase filter | 2025 | No fav | 319 | 319 / 319 | 287 / 169 | 62 | 19.4% | 1.25 | 8.12 | £62.55 (19.6%) | £12.55 (4.0%) |
| Saved Chase filter | 2025 | 2–3 | 172 | 172 / 172 | 166 / 124 | 45 | 26.2% | 1.23 | 4.64 | £17.05 (9.9%) | £4.05 (2.4%) |
| Saved Chase filter | 2025 | 4–6 | 116 | 116 / 116 | 115 / 87 | 14 | 12.1% | 1.21 | 9.72 | £8.50 (7.3%) | −£12.50 (-11.0%) |
| Saved Chase filter | 2025 | 7+ | 31 | 31 / 31 | 29 / 26 | 3 | 9.7% | 2.20 | 21.39 | £37.00 (119.4%) | −£14.00 (-48.3%) |
| Jump handicap (both saved names) | 2025 | No fav | 1,535 | 1,535 / 1,535 | 1,039 / 285 | 168 | 10.9% | 1.01 | 12.27 | −£131.76 (-8.6%) | −£241.76 (-15.8%) |
| Jump handicap (both saved names) | 2025 | 2–3 | 552 | 552 / 552 | 522 / 231 | 101 | 18.3% | 1.04 | 5.37 | −£36.59 (-6.6%) | −£52.09 (-9.5%) |
| Jump handicap (both saved names) | 2025 | 4–6 | 555 | 555 / 555 | 477 / 218 | 45 | 8.1% | 0.88 | 10.38 | −£166.17 (-29.9%) | −£192.17 (-34.7%) |
| Jump handicap (both saved names) | 2025 | 7+ | 428 | 428 / 428 | 315 / 162 | 22 | 5.1% | 1.24 | 23.63 | £71.00 (16.6%) | −£39.00 (-9.3%) |
| Turf trainer / TPR | 2025 | No fav | 352 | 352 / 352 | 352 / 146 | 48 | 13.6% | 1.07 | 12.39 | £132.21 (37.6%) | −£50.79 (-14.5%) |
| Turf trainer / TPR | 2025 | 2–3 | 174 | 174 / 174 | 174 / 102 | 33 | 19.0% | 1.02 | 5.10 | −£12.79 (-7.4%) | −£27.79 (-16.2%) |
| Turf trainer / TPR | 2025 | 4–6 | 113 | 113 / 113 | 113 / 83 | 12 | 10.6% | 1.17 | 11.94 | £156.00 (138.1%) | −£27.00 (-24.3%) |
| Turf trainer / TPR | 2025 | 7+ | 65 | 65 / 65 | 65 / 46 | 3 | 4.6% | 1.26 | 32.68 | −£11.00 (-16.9%) | −£50.00 (-79.4%) |
| Chase V2 T1 | 2025 | No fav | 985 | 985 / 985 | 985 / 294 | 165 | 16.8% | 1.02 | 6.98 | −£108.92 (-11.1%) | −£153.92 (-15.7%) |
| Chase V2 T1 | 2026 | No fav | 680 | 680 / 680 | 680 / 232 | 116 | 17.1% | 1.03 | 7.23 | −£87.88 (-12.9%) | −£131.88 (-19.5%) |
| Chase V2 T1 | 2025 | 2–3 | 657 | 657 / 657 | 657 / 263 | 131 | 19.9% | 0.99 | 4.78 | −£83.75 (-12.7%) | −£99.75 (-15.2%) |
| Chase V2 T1 | 2026 | 2–3 | 428 | 428 / 428 | 428 / 209 | 94 | 22.0% | 1.06 | 4.61 | −£35.87 (-8.4%) | −£48.37 (-11.4%) |
| Chase V2 T1 | 2025 | 4–6 | 262 | 262 / 262 | 262 / 163 | 32 | 12.2% | 1.20 | 9.55 | −£6.17 (-2.4%) | −£29.17 (-11.2%) |
| Chase V2 T1 | 2026 | 4–6 | 202 | 202 / 202 | 202 / 133 | 19 | 9.4% | 0.89 | 9.00 | −£63.00 (-31.2%) | −£85.00 (-42.5%) |
| Chase V2 T1 | 2025 | 7+ | 66 | 66 / 66 | 66 / 52 | 2 | 3.0% | 0.58 | 18.70 | −£19.00 (-28.8%) | −£64.00 (-100.0%) |
| Chase V2 T1 | 2026 | 7+ | 50 | 50 / 50 | 50 / 45 | 3 | 6.0% | 1.30 | 22.46 | £11.00 (22.0%) | −£33.00 (-68.8%) |
| Chase V2 T2 | 2025 | No fav | 1,262 | 1,262 / 1,262 | 1,262 / 308 | 198 | 15.7% | 1.07 | 8.50 | −£69.96 (-5.5%) | −£124.96 (-9.9%) |
| Chase V2 T2 | 2026 | No fav | 934 | 934 / 934 | 934 / 246 | 126 | 13.5% | 0.89 | 8.24 | −£188.00 (-20.1%) | −£236.00 (-25.3%) |
| Chase V2 T2 | 2025 | 2–3 | 707 | 707 / 707 | 707 / 279 | 145 | 20.5% | 1.06 | 5.11 | −£51.96 (-7.3%) | −£66.96 (-9.5%) |
| Chase V2 T2 | 2026 | 2–3 | 531 | 531 / 531 | 531 / 223 | 89 | 16.8% | 0.83 | 4.86 | −£160.50 (-30.2%) | −£173.00 (-32.7%) |
| Chase V2 T2 | 2025 | 4–6 | 442 | 442 / 442 | 442 / 225 | 49 | 11.1% | 1.14 | 10.40 | £2.00 (0.5%) | −£28.00 (-6.4%) |
| Chase V2 T2 | 2026 | 4–6 | 311 | 311 / 311 | 311 / 173 | 32 | 10.3% | 1.07 | 10.37 | £0.50 (0.2%) | −£47.50 (-15.4%) |
| Chase V2 T2 | 2025 | 7+ | 113 | 113 / 113 | 113 / 95 | 4 | 3.5% | 0.78 | 22.22 | −£20.00 (-17.7%) | −£75.00 (-67.6%) |
| Chase V2 T2 | 2026 | 7+ | 92 | 92 / 92 | 92 / 75 | 5 | 5.4% | 1.14 | 20.55 | −£28.00 (-30.4%) | −£52.00 (-57.8%) |
| Chase V2 T3 | 2025 | No fav | 1,424 | 1,424 / 1,424 | 1,424 / 313 | 208 | 14.6% | 1.14 | 10.29 | −£9.84 (-0.7%) | −£103.84 (-7.3%) |
| Chase V2 T3 | 2026 | No fav | 1,030 | 1,030 / 1,030 | 1,030 / 249 | 139 | 13.5% | 1.01 | 10.22 | −£168.43 (-16.4%) | −£210.43 (-20.5%) |
| Chase V2 T3 | 2025 | 2–3 | 670 | 670 / 670 | 670 / 260 | 139 | 20.7% | 1.14 | 5.65 | £0.16 (0.0%) | −£19.34 (-2.9%) |
| Chase V2 T3 | 2026 | 2–3 | 510 | 510 / 510 | 510 / 210 | 98 | 19.2% | 1.03 | 5.42 | −£45.93 (-9.0%) | −£71.93 (-14.2%) |
| Chase V2 T3 | 2025 | 4–6 | 591 | 591 / 591 | 591 / 261 | 60 | 10.2% | 1.10 | 11.76 | −£60.00 (-10.2%) | −£106.00 (-18.0%) |
| Chase V2 T3 | 2026 | 4–6 | 421 | 421 / 421 | 421 / 209 | 36 | 8.6% | 0.94 | 12.36 | −£101.50 (-24.1%) | −£129.50 (-30.9%) |
| Chase V2 T3 | 2025 | 7+ | 163 | 163 / 163 | 163 / 120 | 9 | 5.5% | 1.24 | 24.06 | £50.00 (30.7%) | −£41.00 (-25.5%) |
| Chase V2 T3 | 2026 | 7+ | 99 | 99 / 99 | 99 / 79 | 5 | 5.1% | 1.12 | 25.86 | −£21.00 (-21.2%) | −£63.00 (-64.9%) |
| Chase V2 T4 | 2025 | No fav | 1,434 | 1,434 / 1,434 | 1,434 / 314 | 169 | 11.8% | 1.04 | 12.80 | −£233.34 (-16.3%) | −£277.34 (-19.4%) |
| Chase V2 T4 | 2026 | No fav | 1,011 | 1,011 / 1,011 | 1,011 / 247 | 115 | 11.4% | 0.98 | 12.83 | −£98.26 (-9.7%) | −£214.26 (-21.2%) |
| Chase V2 T4 | 2025 | 2–3 | 526 | 526 / 526 | 526 / 246 | 94 | 17.9% | 1.02 | 5.53 | −£42.84 (-8.1%) | −£72.84 (-13.9%) |
| Chase V2 T4 | 2026 | 2–3 | 359 | 359 / 359 | 359 / 182 | 67 | 18.7% | 1.01 | 5.21 | −£51.26 (-14.3%) | −£66.26 (-18.6%) |
| Chase V2 T4 | 2025 | 4–6 | 704 | 704 / 704 | 704 / 269 | 67 | 9.5% | 1.08 | 13.98 | −£118.50 (-16.8%) | −£154.50 (-22.0%) |
| Chase V2 T4 | 2026 | 4–6 | 499 | 499 / 499 | 499 / 215 | 42 | 8.4% | 0.95 | 14.20 | £3.00 (0.6%) | −£113.00 (-22.7%) |
| Chase V2 T4 | 2025 | 7+ | 204 | 204 / 204 | 204 / 148 | 8 | 3.9% | 0.90 | 27.46 | −£72.00 (-35.3%) | −£116.00 (-57.4%) |
| Chase V2 T4 | 2026 | 7+ | 153 | 153 / 153 | 153 / 104 | 6 | 3.9% | 0.94 | 26.21 | −£50.00 (-32.7%) | −£93.00 (-61.6%) |
| Chase V2 T5 | 2025 | No fav | 1,364 | 1,364 / 1,364 | 1,364 / 309 | 110 | 8.1% | 0.88 | 17.80 | −£355.47 (-26.1%) | −£438.47 (-32.2%) |
| Chase V2 T5 | 2026 | No fav | 920 | 920 / 920 | 920 / 243 | 84 | 9.1% | 0.97 | 15.98 | −£178.58 (-19.4%) | −£253.58 (-27.6%) |
| Chase V2 T5 | 2025 | 2–3 | 339 | 339 / 339 | 339 / 202 | 45 | 13.3% | 0.81 | 5.66 | −£97.47 (-28.8%) | −£111.97 (-33.2%) |
| Chase V2 T5 | 2026 | 2–3 | 242 | 242 / 242 | 242 / 150 | 36 | 14.9% | 0.92 | 5.65 | −£65.08 (-26.9%) | −£81.08 (-33.8%) |
| Chase V2 T5 | 2025 | 4–6 | 756 | 756 / 756 | 756 / 279 | 56 | 7.4% | 0.95 | 19.73 | −£169.00 (-22.4%) | −£239.00 (-31.7%) |
| Chase V2 T5 | 2026 | 4–6 | 513 | 513 / 513 | 513 / 210 | 41 | 8.0% | 1.00 | 16.76 | −£100.50 (-19.6%) | −£143.50 (-28.1%) |
| Chase V2 T5 | 2025 | 7+ | 269 | 269 / 269 | 269 / 160 | 9 | 3.3% | 0.83 | 27.65 | −£89.00 (-33.1%) | −£144.00 (-53.9%) |
| Chase V2 T5 | 2026 | 7+ | 165 | 165 / 165 | 165 / 118 | 7 | 4.2% | 1.05 | 28.69 | −£13.00 (-7.9%) | −£88.00 (-54.0%) |
| AW Tissue V1 T1 | 2025 | No fav | 1,980 | 1,980 / 1,980 | 1,980 / 258 | 277 | 14.0% | 0.98 | 8.42 | −£370.61 (-18.7%) | −£425.61 (-21.5%) |
| AW Tissue V1 T1 | 2025 | 2–3 | 1,148 | 1,148 / 1,148 | 1,148 / 255 | 208 | 18.1% | 0.97 | 4.99 | −£205.61 (-17.9%) | −£222.11 (-19.4%) |
| AW Tissue V1 T1 | 2025 | 4–6 | 609 | 609 / 609 | 609 / 233 | 58 | 9.5% | 0.99 | 9.84 | −£118.00 (-19.4%) | −£148.00 (-24.4%) |
| AW Tissue V1 T1 | 2025 | 7+ | 223 | 223 / 223 | 223 / 144 | 11 | 4.9% | 1.09 | 22.25 | −£47.00 (-21.1%) | −£102.00 (-46.2%) |
| AW Tissue V2 T1 | 2025 | No fav | 1,782 | 1,782 / 1,782 | 1,782 / 257 | 269 | 15.1% | 1.03 | 8.21 | −£267.93 (-15.0%) | −£314.93 (-17.7%) |
| AW Tissue V2 T1 | 2025 | 2–3 | 1,082 | 1,082 / 1,082 | 1,082 / 250 | 212 | 19.6% | 1.04 | 4.94 | −£107.93 (-10.0%) | −£126.43 (-11.7%) |
| AW Tissue V2 T1 | 2025 | 4–6 | 537 | 537 / 537 | 537 / 225 | 49 | 9.1% | 0.99 | 10.51 | −£126.00 (-23.5%) | −£152.00 (-28.4%) |
| AW Tissue V2 T1 | 2025 | 7+ | 163 | 163 / 163 | 163 / 116 | 8 | 4.9% | 1.05 | 22.39 | −£34.00 (-20.9%) | −£81.00 (-50.3%) |
| AW-D leader | 2025 | No fav | 2,082 | 2,082 / 2,082 | 2,082 / 259 | 268 | 12.9% | 1.00 | 11.37 | −£384.29 (-18.5%) | −£437.29 (-21.0%) |
| AW-D leader | 2025 | 2–3 | 1,080 | 1,080 / 1,080 | 1,080 / 251 | 189 | 17.5% | 0.98 | 5.29 | −£184.29 (-17.1%) | −£200.79 (-18.6%) |
| AW-D leader | 2025 | 4–6 | 703 | 703 / 703 | 703 / 237 | 65 | 9.2% | 1.02 | 11.78 | −£134.00 (-19.1%) | −£168.00 (-24.0%) |
| AW-D leader | 2025 | 7+ | 299 | 299 / 299 | 299 / 169 | 14 | 4.7% | 1.13 | 32.36 | −£66.00 (-22.1%) | −£119.00 (-40.1%) |
| AW-A leader | 2025 | No fav | 2,162 | 2,162 / 2,162 | 2,162 / 259 | 256 | 11.8% | 0.95 | 12.89 | −£568.41 (-26.3%) | −£621.41 (-28.8%) |
| AW-A leader | 2025 | 2–3 | 1,021 | 1,021 / 1,021 | 1,021 / 251 | 183 | 17.9% | 0.99 | 5.21 | −£160.41 (-15.7%) | −£178.91 (-17.6%) |
| AW-A leader | 2025 | 4–6 | 775 | 775 / 775 | 775 / 243 | 60 | 7.7% | 0.87 | 12.18 | −£247.00 (-31.9%) | −£281.00 (-36.4%) |
| AW-A leader | 2025 | 7+ | 366 | 366 / 366 | 366 / 185 | 13 | 3.6% | 0.91 | 35.82 | −£161.00 (-44.0%) | −£214.00 (-58.8%) |

</details>

<details>
<summary>Chase V2 ranks T6 and deeper</summary>
Sparse ranks are included as fixed outputs. One cell gives stakes, A/E, mean SP, £1 P/L and ROI, then ROI after the two largest winning races. A dash means the denominator or second winning race is absent.

| Model rank / year | Full | No fav | SP 2–3 | SP 4–6 | SP 7+ |
| --- | --- | --- | --- | --- | --- |
| Chase V2 T6 / 2025 | 846 · 0.93 · 19.56 · −£266.42 (-31.5%) · -36.5% | 802 · 0.83 · 20.42 · −£274.75 (-34.3%) · -39.6% | 144 · 0.88 · 6.06 · −£30.25 (-21.0%) · -31.5% | 439 · 0.92 · 18.46 · −£73.50 (-16.7%) · -26.4% | 219 · 0.35 · 33.79 · −£171.00 (-78.1%) · -94.5% |
| Chase V2 T6 / 2026 | 760 · 0.84 · 20.08 · −£252.92 (-33.3%) · -42.3% | 719 · 0.77 · 21.01 · −£253.54 (-35.3%) · -44.8% | 120 · 0.69 · 5.79 · −£57.54 (-48.0%) · -59.4% | 400 · 0.78 · 18.87 · −£156.00 (-39.0%) · -49.2% | 199 · 0.95 · 34.47 · −£40.00 (-20.1%) · -54.8% |
| Chase V2 T7 / 2025 | 655 · 0.90 · 23.69 · −£200.82 (-30.7%) · -38.0% | 632 · 0.92 · 24.41 · −£191.67 (-30.3%) · -37.9% | 76 · 0.65 · 6.40 · −£30.17 (-39.7%) · -64.4% | 246 · 0.99 · 13.13 · −£50.50 (-20.5%) · -32.2% | 310 · 1.07 · 37.78 · −£111.00 (-35.8%) · -51.3% |
| Chase V2 T7 / 2026 | 588 · 1.17 · 22.64 · −£26.88 (-4.6%) · -15.8% | 570 · 1.15 · 23.23 · −£26.00 (-4.6%) · -16.2% | 93 · 1.04 · 6.07 · −£6.00 (-6.5%) · -22.5% | 186 · 1.16 · 12.84 · −£21.00 (-11.3%) · -26.6% | 291 · 1.29 · 35.35 · £1.00 (0.3%) · -22.5% |
| Chase V2 T8 / 2025 | 500 · 0.93 · 25.76 · −£160.86 (-32.2%) · -45.6% | 487 · 0.86 · 26.34 · −£167.83 (-34.5%) · -48.2% | 66 · 1.06 · 6.23 · −£14.83 (-22.5%) · -41.1% | 146 · 0.75 · 11.41 · −£65.50 (-44.9%) · -62.8% | 275 · 0.81 · 39.10 · −£87.50 (-31.8%) · -56.2% |
| Chase V2 T8 / 2026 | 446 · 0.84 · 25.10 · −£138.00 (-30.9%) · -43.7% | 431 · 0.91 · 25.82 · −£125.00 (-29.0%) · -42.2% | 43 · 0.71 · 6.50 · −£20.50 (-47.7%) · -74.4% | 140 · 1.03 · 12.32 · −£2.50 (-1.8%) · -29.3% | 248 · 0.88 · 36.80 · −£102.00 (-41.1%) · -64.2% |
| Chase V2 T9 / 2025 | 371 · 0.68 · 32.10 · −£175.67 (-47.3%) · -68.7% | 362 · 0.68 · 32.79 · −£171.00 (-47.2%) · -69.2% | 36 · 0.84 · 6.62 · −£12.50 (-34.7%) · -70.6% | 77 · 0.86 · 11.75 · −£30.50 (-39.6%) · -68.7% | 249 · 0.47 · 43.08 · −£128.00 (-51.4%) · -83.4% |
| Chase V2 T9 / 2026 | 340 · 1.03 · 30.18 · −£142.46 (-41.9%) · -56.1% | 333 · 0.94 · 30.73 · −£149.29 (-44.8%) · -59.3% | 34 · 1.28 · 6.36 · −£3.79 (-11.2%) · -46.2% | 84 · 0.77 · 11.54 · −£37.50 (-44.6%) · -68.9% | 215 · 0.87 · 42.08 · −£108.00 (-50.2%) · -72.8% |
| Chase V2 T10 / 2025 | 280 · 1.00 · 32.32 · −£74.00 (-26.4%) · -46.4% | 273 · 1.08 · 33.03 · −£67.00 (-24.5%) · -45.0% | 22 · 1.08 · 6.75 · −£2.00 (-9.1%) · -75.0% | 62 · 1.01 · 10.81 · −£22.00 (-35.5%) · -65.8% | 189 · 1.14 · 43.38 · −£43.00 (-22.8%) · -52.4% |
| Chase V2 T10 / 2026 | 256 · 0.82 · 29.87 · −£123.00 (-48.0%) · -65.0% | 248 · 0.85 · 30.69 · −£118.50 (-47.8%) · -65.2% | 28 · 0.54 · 6.21 · −£17.50 (-62.5%) · -100.0% | 50 · 1.59 · 10.95 · £12.00 (24.0%) · -25.0% | 170 · 0.54 · 40.53 · −£113.00 (-66.5%) · -92.3% |
| Chase V2 T11 / 2025 | 210 · 1.27 · 35.69 · −£65.50 (-31.2%) · -49.8% | 206 · 1.23 · 36.26 · −£69.00 (-33.5%) · -52.5% | 17 · 1.08 · 7.38 · −£2.00 (-11.8%) · -100.0% | 34 · 2.36 · 11.03 · £33.00 (97.1%) · 28.1% | 155 · 0.66 · 44.97 · −£100.00 (-64.5%) · -90.2% |
| Chase V2 T11 / 2026 | 199 · 0.80 · 33.64 · −£54.00 (-27.1%) · -60.4% | 197 · 0.72 · 33.94 · −£58.00 (-29.4%) · -63.1% | 10 · 0.00 · 6.58 · −£10.00 (-100.0%) · — | 34 · 0.40 · 11.29 · −£26.00 (-76.5%) · — | 153 · 1.08 · 40.76 · −£22.00 (-14.4%) · -57.6% |
| Chase V2 T12 / 2025 | 153 · 1.49 · 33.93 · −£5.50 (-3.6%) · -44.0% | 149 · 1.66 · 34.71 · −£1.50 (-1.0%) · -42.5% | 4 · 2.20 · 7.00 · £3.00 (75.0%) · — | 28 · 2.39 · 10.82 · £19.50 (69.6%) · -5.8% | 117 · 1.14 · 41.38 · −£24.00 (-20.5%) · -73.9% |
| Chase V2 T12 / 2026 | 144 · 1.34 · 34.86 · −£25.00 (-17.4%) · -50.7% | 142 · 1.23 · 35.28 · −£28.00 (-19.7%) · -53.6% | 8 · 1.19 · 7.44 · −£1.50 (-18.8%) · — | 22 · 0.65 · 11.95 · −£13.50 (-61.4%) · — | 112 · 1.51 · 41.85 · −£13.00 (-11.6%) · -54.5% |
| Chase V2 T13 / 2025 | 115 · 0.92 · 40.44 · −£37.00 (-32.2%) · -77.0% | 115 · 0.92 · 40.44 · −£37.00 (-32.2%) · -77.0% | 5 · 0.00 · 6.50 · −£5.00 (-100.0%) · — | 8 · 1.54 · 10.00 · £3.00 (37.5%) · — | 102 · 0.98 · 44.49 · −£35.00 (-34.3%) · -85.0% |
| Chase V2 T13 / 2026 | 112 · 0.43 · 34.38 · −£96.50 (-86.2%) · -100.0% | 109 · 0.48 · 35.19 · −£93.50 (-85.8%) · -100.0% | 5 · 1.50 · 6.45 · £0.50 (10.0%) · — | 13 · 1.06 · 11.00 · −£3.00 (-23.1%) · — | 91 · 0.00 · 40.23 · −£91.00 (-100.0%) · — |
| Chase V2 T14 / 2025 | 84 · 0.00 · 45.02 · −£84.00 (-100.0%) · — | 84 · 0.00 · 45.02 · −£84.00 (-100.0%) · — | 6 · 0.00 · 7.50 · −£6.00 (-100.0%) · — | 8 · 0.00 · 10.69 · −£8.00 (-100.0%) · — | 70 · 0.00 · 52.16 · −£70.00 (-100.0%) · — |
| Chase V2 T14 / 2026 | 87 · 0.70 · 39.66 · −£60.00 (-69.0%) · -100.0% | 87 · 0.70 · 39.66 · −£60.00 (-69.0%) · -100.0% | 4 · 0.00 · 8.00 · −£4.00 (-100.0%) · — | 10 · 0.00 · 12.10 · −£10.00 (-100.0%) · — | 73 · 1.10 · 45.16 · −£46.00 (-63.0%) · -100.0% |
| Chase V2 T15 / 2025 | 56 · 1.68 · 43.35 · −£17.50 (-31.3%) · -88.0% | 55 · 1.83 · 44.05 · −£16.50 (-30.0%) · -87.7% | 2 · 4.57 · 6.75 · £4.50 (225.0%) · — | 4 · 0.00 · 12.00 · −£4.00 (-100.0%) · — | 49 · 1.72 · 48.18 · −£17.00 (-34.7%) · -100.0% |
| Chase V2 T15 / 2026 | 56 · 0.00 · 29.78 · −£56.00 (-100.0%) · — | 55 · 0.00 · 30.21 · −£55.00 (-100.0%) · — | 4 · 0.00 · 7.75 · −£4.00 (-100.0%) · — | 8 · 0.00 · 10.81 · −£8.00 (-100.0%) · — | 43 · 0.00 · 35.91 · −£43.00 (-100.0%) · — |
| Chase V2 T16 / 2025 | 39 · 0.00 · 40.86 · −£39.00 (-100.0%) · — | 39 · 0.00 · 40.86 · −£39.00 (-100.0%) · — | 3 · 0.00 · 7.50 · −£3.00 (-100.0%) · — | 5 · 0.00 · 12.00 · −£5.00 (-100.0%) · — | 31 · 0.00 · 48.74 · −£31.00 (-100.0%) · — |
| Chase V2 T16 / 2026 | 44 · 2.70 · 32.43 · £8.00 (18.2%) · -61.9% | 43 · 2.17 · 33.02 · £2.00 (4.7%) · -78.0% | 1 · 12.65 · 9.00 · £8.00 (800.0%) · — | 4 · 0.00 · 11.25 · −£4.00 (-100.0%) · — | 38 · 1.93 · 35.95 · −£2.00 (-5.3%) · -100.0% |
| Chase V2 T17 / 2025 | 25 · 0.00 · 30.82 · −£25.00 (-100.0%) · — | 24 · 0.00 · 31.75 · −£24.00 (-100.0%) · — | 1 · 0.00 · 10.00 · −£1.00 (-100.0%) · — | 6 · 0.00 · 10.33 · −£6.00 (-100.0%) · — | 17 · 0.00 · 40.59 · −£17.00 (-100.0%) · — |
| Chase V2 T17 / 2026 | 26 · 1.21 · 34.59 · £15.00 (57.7%) · — | 25 · 1.63 · 35.84 · £16.00 (64.0%) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 12.00 · −£1.00 (-100.0%) · — | 24 · 1.81 · 36.83 · £17.00 (70.8%) · — |
| Chase V2 T18 / 2025 | 23 · 0.00 · 39.20 · −£23.00 (-100.0%) · — | 23 · 0.00 · 39.20 · −£23.00 (-100.0%) · — | 1 · 0.00 · 6.50 · −£1.00 (-100.0%) · — | 1 · 0.00 · 12.00 · −£1.00 (-100.0%) · — | 21 · 0.00 · 42.05 · −£21.00 (-100.0%) · — |
| Chase V2 T18 / 2026 | 21 · 2.22 · 42.86 · £46.00 (219.0%) · — | 21 · 2.22 · 42.86 · £46.00 (219.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 21 · 2.22 · 42.86 · £46.00 (219.0%) · — |
| Chase V2 T19 / 2025 | 17 · 1.92 · 36.82 · −£4.00 (-23.5%) · — | 17 · 1.92 · 36.82 · −£4.00 (-23.5%) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 13.00 · −£1.00 (-100.0%) · — | 16 · 2.12 · 38.31 · −£3.00 (-18.8%) · — |
| Chase V2 T19 / 2026 | 17 · 2.20 · 47.26 · £0.00 (0.0%) · — | 16 · 2.91 · 49.81 · £1.00 (6.3%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 16 · 2.91 · 49.81 · £1.00 (6.3%) · — |
| Chase V2 T20 / 2025 | 14 · 2.25 · 37.86 · £7.00 (50.0%) · — | 14 · 2.25 · 37.86 · £7.00 (50.0%) · — | 2 · 0.00 · 9.00 · −£2.00 (-100.0%) · — | 1 · 0.00 · 15.00 · −£1.00 (-100.0%) · — | 11 · 4.26 · 45.18 · £10.00 (90.9%) · — |
| Chase V2 T20 / 2026 | 16 · 0.00 · 38.69 · −£16.00 (-100.0%) · — | 16 · 0.00 · 38.69 · −£16.00 (-100.0%) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 12.00 · −£1.00 (-100.0%) · — | 15 · 0.00 · 40.47 · −£15.00 (-100.0%) · — |
| Chase V2 T21 / 2025 | 11 · 0.00 · 36.41 · −£11.00 (-100.0%) · — | 11 · 0.00 · 36.41 · −£11.00 (-100.0%) · — | 2 · 0.00 · 7.25 · −£2.00 (-100.0%) · — | 1 · 0.00 · 13.00 · −£1.00 (-100.0%) · — | 8 · 0.00 · 46.63 · −£8.00 (-100.0%) · — |
| Chase V2 T21 / 2026 | 12 · 0.00 · 45.58 · −£12.00 (-100.0%) · — | 12 · 0.00 · 45.58 · −£12.00 (-100.0%) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 12.00 · −£1.00 (-100.0%) · — | 11 · 0.00 · 48.64 · −£11.00 (-100.0%) · — |
| Chase V2 T22 / 2025 | 11 · 0.00 · 44.73 · −£11.00 (-100.0%) · — | 10 · 0.00 · 48.80 · −£10.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 10 · 0.00 · 48.80 · −£10.00 (-100.0%) · — |
| Chase V2 T22 / 2026 | 11 · 0.00 · 63.18 · −£11.00 (-100.0%) · — | 11 · 0.00 · 63.18 · −£11.00 (-100.0%) · — | 0 · — · — · — (—) · — | 2 · 0.00 · 11.50 · −£2.00 (-100.0%) · — | 9 · 0.00 · 74.67 · −£9.00 (-100.0%) · — |
| Chase V2 T23 / 2025 | 10 · 0.00 · 54.40 · −£10.00 (-100.0%) · — | 10 · 0.00 · 54.40 · −£10.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 10 · 0.00 · 54.40 · −£10.00 (-100.0%) · — |
| Chase V2 T23 / 2026 | 8 · 0.00 · 80.25 · −£8.00 (-100.0%) · — | 8 · 0.00 · 80.25 · −£8.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 8 · 0.00 · 80.25 · −£8.00 (-100.0%) · — |
| Chase V2 T24 / 2025 | 6 · 0.00 · 102.92 · −£6.00 (-100.0%) · — | 6 · 0.00 · 102.92 · −£6.00 (-100.0%) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 9.50 · −£1.00 (-100.0%) · — | 5 · 0.00 · 121.60 · −£5.00 (-100.0%) · — |
| Chase V2 T24 / 2026 | 4 · 0.00 · 58.50 · −£4.00 (-100.0%) · — | 4 · 0.00 · 58.50 · −£4.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 4 · 0.00 · 58.50 · −£4.00 (-100.0%) · — |
| Chase V2 T25 / 2025 | 4 · 0.00 · 75.00 · −£4.00 (-100.0%) · — | 4 · 0.00 · 75.00 · −£4.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 4 · 0.00 · 75.00 · −£4.00 (-100.0%) · — |
| Chase V2 T25 / 2026 | 3 · 0.00 · 53.00 · −£3.00 (-100.0%) · — | 3 · 0.00 · 53.00 · −£3.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 3 · 0.00 · 53.00 · −£3.00 (-100.0%) · — |
| Chase V2 T26 / 2025 | 4 · 0.00 · 100.50 · −£4.00 (-100.0%) · — | 4 · 0.00 · 100.50 · −£4.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 4 · 0.00 · 100.50 · −£4.00 (-100.0%) · — |
| Chase V2 T26 / 2026 | 3 · 0.00 · 49.00 · −£3.00 (-100.0%) · — | 3 · 0.00 · 49.00 · −£3.00 (-100.0%) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 15.00 · −£1.00 (-100.0%) · — | 2 · 0.00 · 66.00 · −£2.00 (-100.0%) · — |
| Chase V2 T27 / 2025 | 4 · 0.00 · 66.75 · −£4.00 (-100.0%) · — | 4 · 0.00 · 66.75 · −£4.00 (-100.0%) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 15.00 · −£1.00 (-100.0%) · — | 3 · 0.00 · 84.00 · −£3.00 (-100.0%) · — |
| Chase V2 T27 / 2026 | 3 · 0.00 · 53.67 · −£3.00 (-100.0%) · — | 3 · 0.00 · 53.67 · −£3.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 3 · 0.00 · 53.67 · −£3.00 (-100.0%) · — |
| Chase V2 T28 / 2025 | 4 · 0.00 · 75.50 · −£4.00 (-100.0%) · — | 4 · 0.00 · 75.50 · −£4.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 4 · 0.00 · 75.50 · −£4.00 (-100.0%) · — |
| Chase V2 T28 / 2026 | 2 · 0.00 · 96.50 · −£2.00 (-100.0%) · — | 2 · 0.00 · 96.50 · −£2.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 2 · 0.00 · 96.50 · −£2.00 (-100.0%) · — |
| Chase V2 T29 / 2025 | 4 · 0.00 · 98.50 · −£4.00 (-100.0%) · — | 4 · 0.00 · 98.50 · −£4.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 4 · 0.00 · 98.50 · −£4.00 (-100.0%) · — |
| Chase V2 T29 / 2026 | 2 · 0.00 · 88.50 · −£2.00 (-100.0%) · — | 2 · 0.00 · 88.50 · −£2.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 2 · 0.00 · 88.50 · −£2.00 (-100.0%) · — |
| Chase V2 T30 / 2025 | 3 · 0.00 · 40.33 · −£3.00 (-100.0%) · — | 3 · 0.00 · 40.33 · −£3.00 (-100.0%) · — | 1 · 0.00 · 11.00 · −£1.00 (-100.0%) · — | 0 · — · — · — (—) · — | 2 · 0.00 · 55.00 · −£2.00 (-100.0%) · — |
| Chase V2 T30 / 2026 | 2 · 0.00 · 65.00 · −£2.00 (-100.0%) · — | 2 · 0.00 · 65.00 · −£2.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 2 · 0.00 · 65.00 · −£2.00 (-100.0%) · — |
| Chase V2 T31 / 2025 | 1 · 0.00 · 51.00 · −£1.00 (-100.0%) · — | 1 · 0.00 · 51.00 · −£1.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 51.00 · −£1.00 (-100.0%) · — |
| Chase V2 T31 / 2026 | 1 · 0.00 · 51.00 · −£1.00 (-100.0%) · — | 1 · 0.00 · 51.00 · −£1.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 51.00 · −£1.00 (-100.0%) · — |
| Chase V2 T32 / 2025 | 1 · 0.00 · 101.00 · −£1.00 (-100.0%) · — | 1 · 0.00 · 101.00 · −£1.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 101.00 · −£1.00 (-100.0%) · — |
| Chase V2 T32 / 2026 | 1 · 0.00 · 51.00 · −£1.00 (-100.0%) · — | 1 · 0.00 · 51.00 · −£1.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 51.00 · −£1.00 (-100.0%) · — |
| Chase V2 T33 / 2025 | 1 · 0.00 · 41.00 · −£1.00 (-100.0%) · — | 1 · 0.00 · 41.00 · −£1.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 41.00 · −£1.00 (-100.0%) · — |
| Chase V2 T33 / 2026 | 1 · 0.00 · 101.00 · −£1.00 (-100.0%) · — | 1 · 0.00 · 101.00 · −£1.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 101.00 · −£1.00 (-100.0%) · — |
| Chase V2 T34 / 2025 | 1 · 0.00 · 21.00 · −£1.00 (-100.0%) · — | 1 · 0.00 · 21.00 · −£1.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 21.00 · −£1.00 (-100.0%) · — |
| Chase V2 T34 / 2026 | 1 · 0.00 · 23.00 · −£1.00 (-100.0%) · — | 1 · 0.00 · 23.00 · −£1.00 (-100.0%) · — | 0 · — · — · — (—) · — | 0 · — · — · — (—) · — | 1 · 0.00 · 23.00 · −£1.00 (-100.0%) · — |

</details>

### Same-race comparisons and additional frozen captures

| Rule | Year | Same-race original stakes / ROI | No-fav stakes / ROI | SP favourites in those races, stakes / ROI |
| --- | --- | --- | --- | --- |
| Saved Chase filter | 2025 | 217 / 18.4% | 200 / 22.0% | 189 / 4.4% |
| Saved Chase filter | 2026 | 264 / -18.5% | 230 / -23.2% | 223 / 4.1% |
| Jump handicap (both saved names) | 2025 | 1,139 / -11.1% | 1,042 / -11.6% | 755 / -9.0% |
| Jump handicap (both saved names) | 2026 | 1,157 / -15.7% | 1,045 / -15.2% | 737 / -16.4% |
| Turf trainer / TPR | 2025 | 293 / 56.0% | 293 / 56.0% | 311 / -19.4% |
| Turf trainer / TPR | 2026 | 285 / 70.1% | 285 / 70.1% | 301 / -4.5% |

The pair comparison keeps the complete races where the original system admits at least one non-favourite. For a single pick per race, retained bets are identical before and after the filter in these races. The difference reported for a single-pick system comes from dropping races in which its selection was an SP favourite. Same-race market favourites are a descriptive control with different stakes and prices.

| 2026 capture cohort | Cut | Selections / final-SP stakes | Winners | SP A/E | P/L (ROI) | After two |
| --- | --- | --- | --- | --- | --- | --- |
| Hurdle Tissue V2 T1 (captured) | Full | 157 / 152 | 38 | 0.92 | −£41.16 (-27.1%) | −£55.66 (-37.1%) |
| Hurdle Tissue V2 T1 (captured) | No fav | 80 / 80 | 9 | 0.69 | −£33.63 (-42.0%) | −£48.13 (-61.7%) |
| Hurdle Tissue V2 T1 (captured) | 2–3 | 53 / 53 | 7 | 0.65 | −£23.13 (-43.6%) | −£33.63 (-65.9%) |
| Hurdle Tissue V2 T1 (captured) | 4–6 | 24 / 24 | 2 | 0.98 | −£7.50 (-31.3%) | −£22.00 (-100.0%) |
| Hurdle Tissue V2 T1 (captured) | 7+ | 3 / 3 | 0 | 0.00 | −£3.00 (-100.0%) | — |
| AW Tissue V3 T1 (captured) | Full | 88 / 87 | 14 | 0.74 | −£27.06 (-31.1%) | −£46.06 (-54.2%) |
| AW Tissue V3 T1 (captured) | No fav | 54 / 54 | 6 | 0.81 | −£10.50 (-19.4%) | −£29.50 (-56.7%) |
| AW Tissue V3 T1 (captured) | 2–3 | 30 / 30 | 3 | 0.54 | −£12.00 (-40.0%) | −£25.00 (-89.3%) |
| AW Tissue V3 T1 (captured) | 4–6 | 15 / 15 | 3 | 2.06 | £10.50 (70.0%) | −£8.50 (-65.4%) |
| AW Tissue V3 T1 (captured) | 7+ | 9 / 9 | 0 | 0.00 | −£9.00 (-100.0%) | — |
| Turf Tissue V4 T1 (captured) | Full | 8 / 8 | 1 | 0.68 | −£6.67 (-83.3%) | — |
| Turf Tissue V4 T1 (captured) | No fav | 5 / 5 | 0 | 0.00 | −£5.00 (-100.0%) | — |
| Turf Tissue V4 T1 (captured) | 2–3 | 0 / 0 | 0 | — | — (—) | — |
| Turf Tissue V4 T1 (captured) | 4–6 | 2 / 2 | 0 | 0.00 | −£2.00 (-100.0%) | — |
| Turf Tissue V4 T1 (captured) | 7+ | 3 / 3 | 0 | 0.00 | −£3.00 (-100.0%) | — |
| Chase V2 T1 (captured) | Full | 92 / 85 | 21 | 0.89 | −£17.46 (-20.5%) | −£32.96 (-39.7%) |
| Chase V2 T1 (captured) | No fav | 43 / 43 | 8 | 1.01 | −£3.75 (-8.7%) | −£19.25 (-47.0%) |
| Chase V2 T1 (captured) | 2–3 | 26 / 26 | 6 | 1.00 | −£4.25 (-16.3%) | −£12.75 (-53.1%) |
| Chase V2 T1 (captured) | 4–6 | 14 / 14 | 2 | 1.13 | £3.50 (25.0%) | −£12.00 (-100.0%) |
| Chase V2 T1 (captured) | 7+ | 3 / 3 | 0 | 0.00 | −£3.00 (-100.0%) | — |

The latest genuine pre-off book per race supplies ranks for these 2026-only cohorts, and all return calculations join final SP. Equivalent 2025 books are unavailable for these model generations. Historical selected VALUE rules that require a qualifying captured price or an original price ledger cannot be replayed for both years at their exact original eligibility. Final SP cannot substitute for the qualifying-time input. [Model-rank and capture availability](tissue-generation-ranks-3-5-2026-11-18.md)

## F. Trainer seasonal-run and layoff patterns

Before comparing trainer outcomes, the primary definition was an observed gap of at least 90 calendar days between any two starts. A qualifying spell starts on the return and advances one start at a time. A new qualifying gap starts a new spell. The trainer/horse pair must be the same at the run preceding the break and throughout the observed spell to the target. Sixty and 120 days are the fixed sensitivity checks. Non-runners and voids are skipped. A possible intervening unresolved start or an unavailable earlier run breaks the inference. Calendar seasons are research definitions beginning 1 October for both Jump families, 1 March for Turf and 1 January for All Weather. A reappearance requires a prior confirmed start in that family in an earlier season and no observed unresolved record in between. Use 2024 starts to anchor 2025 when observed. Starts abroad, gaps in the corpus and trainer ID changes can still hide history.

Class changes and distance changes compare the immediately preceding confirmed start when both starts are in the same family. Lower class number is a move up. The distance change threshold is one furlong. Repeat pair means the same trainer ID as the preceding confirmed start. Trainer results use complete final-SP fields in the matched calendar window. All trainer or horse transitions are based on events before the target. Eligibility for a first or second run never depends on that horse returning later.

Trainer cells show trainer count · stakes · wins · strike · mean decimal SP · A/E · £1 P/L (ROI) · ROI after the top two winning races.

| Group | 2025 all | 2026 all | 2025 no fav | 2026 no fav |
| --- | --- | --- | --- | --- |
| Run 1 | 969 · 11,065 · 1,156 · 10.4% · 26.51 · 1.02 · −£3319.37 (-30.0%) · -31.9% | 936 · 11,323 · 1,136 · 10.0% · 28.85 · 1.01 · −£2940.30 (-26.0%) · -27.8% | 964 · 9,978 · 730 · 7.3% · 29.08 · 0.96 · −£3274.51 (-32.8%) · -34.9% | 931 · 10,265 · 735 · 7.2% · 31.53 · 0.96 · −£2860.24 (-27.9%) · -29.9% |
| Run 2 | 890 · 8,658 · 919 · 10.6% · 23.75 · 0.96 · −£2040.76 (-23.6%) · -28.2% | 862 · 8,907 · 982 · 11.0% · 26.02 · 1.00 · −£2612.04 (-29.3%) · -30.3% | 878 · 7,619 · 566 · 7.4% · 26.57 · 0.91 · −£1905.58 (-25.0%) · -30.2% | 851 · 7,779 · 608 · 7.8% · 29.35 · 0.99 · −£2466.19 (-31.7%) · -32.9% |
| Run 3 | 840 · 7,295 · 862 · 11.8% · 18.98 · 1.01 · −£1491.31 (-20.4%) · -23.5% | 825 · 7,723 · 936 · 12.1% · 20.05 · 1.04 · −£1595.03 (-20.7%) · -23.9% | 832 · 6,332 · 554 · 8.7% · 21.38 · 0.99 · −£1367.83 (-21.6%) · -25.2% | 813 · 6,673 · 592 · 8.9% · 22.71 · 1.04 · −£1431.40 (-21.5%) · -25.2% |
| Other/unproved | 1,148 · 74,680 · 8,181 · 11.0% · 26.44 · 1.00 · −£19238.07 (-25.8%) · -26.1% | 1,097 · 72,941 · 7,956 · 10.9% · 27.63 · 1.00 · −£19205.37 (-26.3%) · -27.0% | 1,143 · 65,892 · 5,255 · 8.0% · 29.56 · 0.97 · −£18341.81 (-27.8%) · -28.2% | 1,090 · 64,280 · 5,046 · 7.9% · 30.94 · 0.96 · −£18249.86 (-28.4%) · -29.2% |

| Group | 2025 all | 2026 all | 2025 no fav | 2026 no fav |
| --- | --- | --- | --- | --- |
| Chase · run 1 | 417 · 1,633 · 200 · 12.2% · 18.25 · 1.05 · −£352.99 (-21.6%) · -25.0% | 387 · 1,558 · 171 · 11.0% · 17.73 · 0.87 · −£559.48 (-35.9%) · -39.1% | 410 · 1,480 · 153 · 10.3% · 19.83 · 1.11 · −£319.26 (-21.6%) · -25.3% | 376 · 1,389 · 114 · 8.2% · 19.55 · 0.84 · −£536.63 (-38.6%) · -42.2% |
| Chase · run 2 | 363 · 1,212 · 147 · 12.1% · 16.67 · 0.95 · −£353.27 (-29.1%) · -34.5% | 345 · 1,095 · 146 · 13.3% · 17.32 · 1.00 · −£320.66 (-29.3%) · -34.6% | 348 · 1,051 · 87 · 8.3% · 18.77 · 0.86 · −£348.99 (-33.2%) · -39.4% | 328 · 936 · 87 · 9.3% · 19.76 · 0.95 · −£316.54 (-33.8%) · -40.1% |
| Chase · run 3 | 319 · 1,098 · 149 · 13.6% · 13.63 · 1.00 · −£209.77 (-19.1%) · -24.1% | 314 · 1,158 · 163 · 14.1% · 14.15 · 1.00 · −£234.57 (-20.3%) · -26.4% | 308 · 933 · 91 · 9.8% · 15.51 · 0.97 · −£194.63 (-20.9%) · -26.7% | 300 · 961 · 94 · 9.8% · 16.44 · 0.97 · −£213.00 (-22.2%) · -29.5% |
| Hurdle · run 1 | 576 · 3,278 · 328 · 10.0% · 32.79 · 1.00 · −£1233.29 (-37.6%) · -42.5% | 532 · 3,256 · 296 · 9.1% · 37.14 · 1.00 · −£979.70 (-30.1%) · -33.6% | 571 · 2,960 · 185 · 6.3% · 36.03 · 0.87 · −£1236.80 (-41.8%) · -47.1% | 530 · 3,008 · 197 · 6.5% · 39.97 · 0.94 · −£952.97 (-31.7%) · -35.5% |
| Hurdle · run 2 | 506 · 2,178 · 252 · 11.6% · 30.76 · 1.07 · −£368.79 (-16.9%) · -24.5% | 487 · 2,288 · 251 · 11.0% · 34.64 · 1.03 · −£726.00 (-31.7%) · -34.9% | 500 · 1,919 · 148 · 7.7% · 34.52 · 1.00 · −£358.50 (-18.7%) · -27.3% | 477 · 2,000 · 150 · 7.5% · 39.20 · 1.02 · −£687.97 (-34.4%) · -38.0% |
| Hurdle · run 3 | 463 · 1,801 · 211 · 11.7% · 26.16 · 1.02 · −£465.02 (-25.8%) · -30.8% | 453 · 1,901 · 241 · 12.7% · 26.96 · 1.08 · −£562.85 (-29.6%) · -34.3% | 454 · 1,567 · 130 · 8.3% · 29.60 · 0.99 · −£437.21 (-27.9%) · -33.6% | 438 · 1,623 · 134 · 8.3% · 31.07 · 1.02 · −£551.80 (-34.0%) · -39.5% |
| All Weather · run 1 | 399 · 2,108 · 248 · 11.8% · 26.04 · 1.07 · −£375.97 (-17.8%) · -24.0% | 400 · 2,213 · 253 · 11.4% · 28.84 · 1.07 · −£268.54 (-12.1%) · -21.3% | 390 · 1,866 · 141 · 7.6% · 29.06 · 0.98 · −£379.31 (-20.3%) · -27.3% | 395 · 1,976 · 155 · 7.8% · 31.99 · 1.06 · −£254.63 (-12.9%) · -23.2% |
| All Weather · run 2 | 353 · 1,452 · 133 · 9.2% · 24.98 · 0.85 · −£409.47 (-28.2%) · -46.5% | 365 · 1,479 · 153 · 10.3% · 28.36 · 0.99 · −£402.33 (-27.2%) · -32.7% | 346 · 1,292 · 83 · 6.4% · 27.70 · 0.81 · −£367.57 (-28.4%) · -49.1% | 360 · 1,308 · 99 · 7.6% · 31.68 · 1.00 · −£374.71 (-28.6%) · -34.8% |
| All Weather · run 3 | 314 · 1,064 · 125 · 11.7% · 18.37 · 1.06 · −£262.18 (-24.6%) · -38.3% | 325 · 1,140 · 125 · 11.0% · 21.22 · 1.01 · −£306.23 (-26.9%) · -32.6% | 302 · 932 · 77 · 8.3% · 20.53 · 0.98 · −£260.38 (-27.9%) · -43.6% | 318 · 1,000 · 86 · 8.6% · 23.77 · 1.07 · −£260.59 (-26.1%) · -32.7% |
| Turf · run 1 | 527 · 4,046 · 380 · 9.4% · 25.00 · 0.98 · −£1357.12 (-33.5%) · -35.5% | 520 · 4,296 · 416 · 9.7% · 26.62 · 1.03 · −£1132.58 (-26.4%) · -29.0% | 524 · 3,672 · 251 · 6.8% · 27.22 · 0.93 · −£1339.14 (-36.5%) · -38.6% | 517 · 3,892 · 269 · 6.9% · 29.06 · 0.99 · −£1116.01 (-28.7%) · -31.6% |
| Turf · run 2 | 492 · 3,816 · 387 · 10.1% · 21.53 · 0.94 · −£909.22 (-23.8%) · -31.1% | 497 · 4,045 · 432 · 10.7% · 22.63 · 0.99 · −£1163.05 (-28.8%) · -31.0% | 484 · 3,357 · 248 · 7.4% · 24.03 · 0.91 · −£830.52 (-24.7%) · -33.0% | 488 · 3,535 · 272 · 7.7% · 25.45 · 0.99 · −£1086.97 (-30.7%) · -33.3% |
| Turf · run 3 | 472 · 3,332 · 377 · 11.3% · 17.06 · 1.00 · −£554.34 (-16.6%) · -23.0% | 465 · 3,524 · 407 · 11.5% · 17.87 · 1.04 · −£491.38 (-13.9%) · -21.0% | 468 · 2,900 · 256 · 8.8% · 19.10 · 1.01 · −£475.61 (-16.4%) · -23.7% | 460 · 3,089 · 278 · 9.0% · 19.93 · 1.06 · −£406.01 (-13.1%) · -21.2% |

The second run gives no cross-year improvement over SP expectation. Hurdle second runs slightly exceed expectation in both years, with A/E 1.07 and 1.03, and ROI −16.9% and −31.7%. After favourites are excluded the A/E moves to 1.00 and 1.02. Turf third runs have the clearest difference from Turf second runs, but third-run non-favourites still lose in both years. First-run All Weather A/E is above 1 in both years on the broad population, with negative SP returns.

<details>
<summary>Break thresholds and other broad trainer patterns</summary>

#### 60-day return spell

| Group | 2025 all | 2026 all | 2025 no fav | 2026 no fav |
| --- | --- | --- | --- | --- |
| Other/unproved | 1,138 · 66,520 · 7,297 · 11.0% · 26.65 · 1.00 · −£17452.71 (-26.2%) · -26.6% | 1,089 · 64,630 · 7,096 · 11.0% · 27.72 · 1.00 · −£17054.06 (-26.4%) · -27.1% | 1,132 · 58,667 · 4,679 · 8.0% · 29.80 · 0.97 · −£16678.92 (-28.4%) · -28.8% | 1,082 · 56,827 · 4,477 · 7.9% · 31.11 · 0.96 · −£16187.59 (-28.5%) · -29.4% |
| Run 1 | 1,010 · 15,455 · 1,614 · 10.4% · 26.62 · 1.02 · −£4239.21 (-27.4%) · -28.8% | 984 · 15,870 · 1,556 · 9.8% · 28.81 · 0.99 · −£4337.98 (-27.3%) · -28.6% | 1,004 · 13,916 · 1,020 · 7.3% · 29.24 · 0.96 · −£4165.67 (-29.9%) · -31.4% | 977 · 14,410 · 1,016 · 7.1% · 31.43 · 0.94 · −£4215.24 (-29.3%) · -30.7% |
| Run 2 | 926 · 11,229 · 1,214 · 10.8% · 23.75 · 0.97 · −£2572.86 (-22.9%) · -26.4% | 898 · 11,523 · 1,279 · 11.1% · 25.93 · 1.01 · −£3259.79 (-28.3%) · -29.1% | 917 · 9,865 · 764 · 7.7% · 26.61 · 0.94 · −£2372.25 (-24.0%) · -28.1% | 886 · 10,106 · 798 · 7.9% · 29.14 · 0.99 · −£3090.52 (-30.6%) · -31.6% |
| Run 3 | 865 · 8,494 · 993 · 11.7% · 19.02 · 1.00 · −£1824.74 (-21.5%) · -24.2% | 839 · 8,871 · 1,079 · 12.2% · 20.40 · 1.05 · −£1700.92 (-19.2%) · -22.0% | 857 · 7,373 · 642 · 8.7% · 21.42 · 0.99 · −£1672.88 (-22.7%) · -25.8% | 828 · 7,654 · 690 · 9.0% · 23.15 · 1.05 · −£1514.33 (-19.8%) · -23.0% |

#### 120-day return spell

| Group | 2025 all | 2026 all | 2025 no fav | 2026 no fav |
| --- | --- | --- | --- | --- |
| Other/unproved | 1,156 · 79,003 · 8,668 · 11.0% · 26.36 · 1.01 · −£19991.71 (-25.3%) · -25.7% | 1,106 · 77,194 · 8,384 · 10.9% · 27.55 · 0.99 · −£20274.43 (-26.3%) · -26.9% | 1,151 · 69,738 · 5,568 · 8.0% · 29.45 · 0.98 · −£19067.13 (-27.3%) · -27.8% | 1,099 · 68,066 · 5,327 · 7.8% · 30.83 · 0.96 · −£19235.31 (-28.3%) · -29.0% |
| Run 1 | 928 · 9,050 · 962 · 10.6% · 26.34 · 1.02 · −£2666.71 (-29.5%) · -31.7% | 898 · 9,263 · 954 · 10.3% · 28.66 · 1.01 · −£2287.93 (-24.7%) · -26.9% | 924 · 8,135 · 606 · 7.4% · 28.98 · 0.96 · −£2620.16 (-32.2%) · -34.7% | 892 · 8,378 · 615 · 7.3% · 31.38 · 0.97 · −£2226.95 (-26.6%) · -29.0% |
| Run 2 | 848 · 7,242 · 758 · 10.5% · 23.60 · 0.94 · −£2003.92 (-27.7%) · -31.8% | 838 · 7,529 · 834 · 11.1% · 26.07 · 1.00 · −£2124.20 (-28.2%) · -29.4% | 837 · 6,366 · 460 · 7.2% · 26.42 · 0.88 · −£1884.87 (-29.6%) · -34.3% | 826 · 6,570 · 517 · 7.9% · 29.44 · 1.00 · −£1988.48 (-30.3%) · -31.6% |
| Run 3 | 801 · 6,403 · 730 · 11.4% · 18.82 · 0.98 · −£1427.17 (-22.3%) · -25.6% | 806 · 6,908 · 838 · 12.1% · 20.30 · 1.04 · −£1666.19 (-24.1%) · -26.3% | 794 · 5,582 · 471 · 8.4% · 21.12 · 0.95 · −£1317.57 (-23.6%) · -27.4% | 793 · 5,983 · 522 · 8.7% · 22.96 · 1.02 · −£1556.95 (-26.0%) · -28.5% |

#### Days since prior start

| Group | 2025 all | 2026 all | 2025 no fav | 2026 no fav |
| --- | --- | --- | --- | --- |
| 1–14d | 902 · 19,439 · 2,320 · 11.9% · 25.26 · 1.02 · −£4551.84 (-23.4%) · -25.1% | 873 · 18,801 · 2,280 · 12.1% · 26.98 · 1.01 · −£4897.16 (-26.0%) · -27.9% | 895 · 16,650 · 1,414 · 8.5% · 28.97 · 1.00 · −£4245.78 (-25.5%) · -27.4% | 863 · 15,947 · 1,329 · 8.3% · 31.25 · 0.97 · −£4627.23 (-29.0%) · -31.2% |
| 15–30d | 987 · 36,686 · 4,202 · 11.5% · 23.75 · 1.01 · −£8995.58 (-24.5%) · -25.3% | 973 · 36,262 · 4,113 · 11.3% · 24.66 · 0.99 · −£9816.46 (-27.1%) · -27.7% | 981 · 32,260 · 2,731 · 8.5% · 26.58 · 0.98 · −£8611.95 (-26.7%) · -27.6% | 963 · 31,674 · 2,623 · 8.3% · 27.79 · 0.97 · −£9177.53 (-29.0%) · -29.7% |
| 31–59d | 971 · 20,589 · 2,235 · 10.9% · 22.89 · 0.97 · −£4993.50 (-24.3%) · -25.6% | 949 · 20,455 · 2,357 · 11.5% · 24.09 · 1.05 · −£3840.21 (-18.8%) · -20.5% | 963 · 18,127 · 1,431 · 7.9% · 25.57 · 0.94 · −£4669.01 (-25.8%) · -27.2% | 943 · 18,127 · 1,533 · 8.5% · 26.79 · 1.02 · −£3652.67 (-20.2%) · -22.1% |
| 60–89d | 792 · 4,823 · 502 · 10.4% · 27.20 · 1.04 · −£939.18 (-19.5%) · -22.2% | 791 · 4,920 · 456 · 9.3% · 28.66 · 0.94 · −£1514.16 (-30.8%) · -34.0% | 785 · 4,328 · 325 · 7.5% · 29.97 · 1.01 · −£892.04 (-20.6%) · -23.7% | 782 · 4,475 · 302 · 6.7% · 31.21 · 0.89 · −£1467.50 (-32.8%) · -36.4% |
| 90–119d | 654 · 2,308 · 213 · 9.2% · 27.75 · 0.98 · −£832.17 (-36.1%) · -39.2% | 636 · 2,356 · 207 · 8.8% · 30.54 · 0.98 · −£768.85 (-32.6%) · -35.8% | 642 · 2,107 · 136 · 6.5% · 30.11 · 0.90 · −£824.93 (-39.2%) · -42.6% | 631 · 2,160 · 140 · 6.5% · 33.04 · 0.94 · −£739.26 (-34.2%) · -37.6% |
| 120+d | 1,038 · 10,920 · 1,113 · 10.2% · 27.97 · 1.01 · −£3039.12 (-27.8%) · -30.1% | 1,010 · 11,134 · 1,089 · 9.8% · 30.33 · 1.00 · −£2504.97 (-22.5%) · -26.3% | 1,034 · 9,851 · 706 · 7.2% · 30.69 · 0.96 · −£2963.41 (-30.1%) · -32.6% | 1,004 · 10,108 · 711 · 7.0% · 33.12 · 0.97 · −£2407.74 (-23.8%) · -28.0% |
| Unknown | 873 · 6,933 · 533 · 7.7% · 40.05 · 0.94 · −£2738.12 (-39.5%) · -41.7% | 802 · 6,966 · 508 · 7.3% · 40.73 · 0.89 · −£3010.94 (-43.2%) · -45.8% | 864 · 6,498 · 362 · 5.6% · 42.56 · 0.91 · −£2682.60 (-41.3%) · -43.6% | 793 · 6,506 · 343 · 5.3% · 43.42 · 0.84 · −£2935.76 (-45.1%) · -47.9% |

#### Seasonal appearance

| Group | 2025 all | 2026 all | 2025 no fav | 2026 no fav |
| --- | --- | --- | --- | --- |
| Later in family season | 1,069 · 71,870 · 8,243 · 11.5% · 23.18 · 1.00 · −£17006.59 (-23.7%) · -24.2% | 1,053 · 71,258 · 8,219 · 11.5% · 24.48 · 1.01 · −£17249.23 (-24.2%) · -24.8% | 1,064 · 62,729 · 5,236 · 8.3% · 26.10 · 0.98 · −£16056.38 (-25.6%) · -26.2% | 1,048 · 62,048 · 5,166 · 8.3% · 27.65 · 0.98 · −£16164.38 (-26.1%) · -26.7% |
| Seasonal reappearance | 1,029 · 15,295 · 1,551 · 10.1% · 23.53 · 1.00 · −£3811.74 (-24.9%) · -26.5% | 1,007 · 16,218 · 1,600 · 9.9% · 25.44 · 1.01 · −£4130.96 (-25.5%) · -26.7% | 1,023 · 13,790 · 1,055 · 7.7% · 25.75 · 0.97 · −£3655.98 (-26.5%) · -28.3% | 1,001 · 14,704 · 1,076 · 7.3% · 27.74 · 0.96 · −£4044.10 (-27.5%) · -28.9% |
| Unknown | 1,050 · 14,533 · 1,324 · 9.1% · 40.33 · 0.98 · −£5271.19 (-36.3%) · -37.5% | 959 · 13,418 · 1,191 · 8.9% · 42.62 · 0.94 · −£4972.56 (-37.1%) · -40.0% | 1,039 · 13,302 · 814 · 6.1% · 43.82 · 0.91 · −£5177.36 (-38.9%) · -40.2% | 951 · 12,245 · 739 · 6.0% · 46.46 · 0.90 · −£4799.21 (-39.2%) · -42.4% |

#### Race status

| Group | 2025 all | 2026 all | 2025 no fav | 2026 no fav |
| --- | --- | --- | --- | --- |
| Handicap | 1,008 · 69,106 · 7,383 · 10.7% · 16.87 · 1.00 · −£15511.80 (-22.4%) · -22.8% | 981 · 68,665 · 7,307 · 10.6% · 17.36 · 1.00 · −£15793.21 (-23.0%) · -23.2% | 1,006 · 61,109 · 5,094 · 8.3% · 18.63 · 0.98 · −£14633.32 (-23.9%) · -24.4% | 979 · 60,629 · 4,994 · 8.2% · 19.22 · 0.98 · −£14741.43 (-24.3%) · -24.6% |
| Non-handicap | 1,108 · 32,592 · 3,735 · 11.5% · 44.38 · 1.00 · −£10577.71 (-32.5%) · -33.5% | 1,076 · 32,229 · 3,703 · 11.5% · 47.67 · 1.00 · −£10559.54 (-32.8%) · -34.3% | 1,104 · 28,712 · 2,011 · 7.0% · 50.05 · 0.94 · −£10256.40 (-35.7%) · -36.9% | 1,071 · 28,368 · 1,987 · 7.0% · 53.84 · 0.94 · −£10266.26 (-36.2%) · -37.9% |

#### Change in class

| Group | 2025 all | 2026 all | 2025 no fav | 2026 no fav |
| --- | --- | --- | --- | --- |
| Down in class | 581 · 10,707 · 1,402 · 13.1% · 18.39 · 1.00 · −£2216.84 (-20.7%) · -21.6% | 568 · 10,491 · 1,377 · 13.1% · 18.61 · 1.01 · −£2128.79 (-20.3%) · -23.1% | 574 · 9,100 · 834 · 9.2% · 21.11 · 0.96 · −£2057.28 (-22.6%) · -23.7% | 558 · 8,962 · 815 · 9.1% · 21.27 · 0.95 · −£2047.47 (-22.8%) · -26.2% |
| Same class | 701 · 33,806 · 4,156 · 12.3% · 21.43 · 1.00 · −£7462.17 (-22.1%) · -22.8% | 690 · 33,915 · 4,222 · 12.4% · 21.98 · 1.00 · −£7482.73 (-22.1%) · -22.9% | 694 · 29,145 · 2,598 · 8.9% · 24.36 · 0.97 · −£6940.65 (-23.8%) · -24.7% | 682 · 29,130 · 2,620 · 9.0% · 25.09 · 0.98 · −£6839.31 (-23.5%) · -24.5% |
| Unknown | 1,145 · 47,413 · 4,418 · 9.3% · 31.17 · 1.00 · −£14617.54 (-30.8%) · -31.5% | 1,083 · 47,097 · 4,361 · 9.3% · 33.16 · 1.00 · −£14434.91 (-30.6%) · -31.7% | 1,137 · 42,965 · 2,922 · 6.8% · 34.07 · 0.96 · −£14172.82 (-33.0%) · -33.7% | 1,076 · 42,630 · 2,857 · 6.7% · 36.31 · 0.96 · −£13949.87 (-32.7%) · -33.9% |
| Up in class | 543 · 9,772 · 1,142 · 11.7% · 21.80 · 1.03 · −£1792.98 (-18.3%) · -21.9% | 540 · 9,391 · 1,050 · 11.2% · 24.10 · 0.99 · −£2306.31 (-24.6%) · -26.7% | 539 · 8,611 · 751 · 8.7% · 24.32 · 1.01 · −£1718.98 (-20.0%) · -24.0% | 537 · 8,275 · 689 · 8.3% · 26.94 · 0.98 · −£2171.04 (-26.2%) · -28.7% |

#### Change in distance

| Group | 2025 all | 2026 all | 2025 no fav | 2026 no fav |
| --- | --- | --- | --- | --- |
| Down ≥1f | 984 · 13,695 · 1,420 · 10.4% · 26.62 · 0.98 · −£3338.15 (-24.4%) · -26.0% | 955 · 13,571 · 1,526 · 11.2% · 27.27 · 1.06 · −£2631.35 (-19.4%) · -22.0% | 980 · 12,201 · 947 · 7.8% · 29.49 · 0.97 · −£3126.40 (-25.6%) · -27.5% | 949 · 12,047 · 992 · 8.2% · 30.33 · 1.03 · −£2535.54 (-21.0%) · -23.9% |
| Unknown | 1,102 · 28,791 · 2,761 · 9.6% · 30.63 · 1.00 · −£8245.90 (-28.6%) · -29.7% | 1,041 · 28,427 · 2,623 · 9.2% · 32.43 · 0.97 · −£8576.63 (-30.2%) · -31.9% | 1,092 · 26,237 · 1,848 · 7.0% · 33.33 · 0.96 · −£8038.49 (-30.6%) · -31.8% | 1,032 · 25,902 · 1,744 · 6.7% · 35.31 · 0.94 · −£8268.53 (-31.9%) · -33.9% |
| Up ≥1f | 1,013 · 17,942 · 1,895 · 10.6% · 25.77 · 0.99 · −£4699.90 (-26.2%) · -27.7% | 988 · 18,013 · 2,020 · 11.2% · 27.32 · 1.03 · −£4334.13 (-24.1%) · -25.3% | 1,007 · 15,922 · 1,193 · 7.5% · 28.65 · 0.93 · −£4577.13 (-28.7%) · -30.5% | 983 · 15,899 · 1,313 · 8.3% · 30.54 · 1.02 · −£4131.77 (-26.0%) · -27.4% |
| Within 1f | 1,003 · 41,270 · 5,042 · 12.2% · 21.89 · 1.01 · −£9805.57 (-23.8%) · -24.4% | 1,000 · 40,883 · 4,841 · 11.8% · 23.10 · 0.98 · −£10810.63 (-26.4%) · -27.1% | 995 · 35,461 · 3,117 · 8.8% · 24.96 · 0.99 · −£9147.71 (-25.8%) · -26.6% | 985 · 35,149 · 2,932 · 8.3% · 26.37 · 0.94 · −£10071.84 (-28.7%) · -29.4% |

#### Trainer and horse partnership

| Group | 2025 all | 2026 all | 2025 no fav | 2026 no fav |
| --- | --- | --- | --- | --- |
| Changed trainer | 752 · 3,431 · 301 · 8.8% · 32.43 · 1.00 · −£592.83 (-17.3%) · -23.8% | 751 · 3,393 · 293 · 8.6% · 34.51 · 1.04 · −£386.23 (-11.4%) · -22.6% | 737 · 3,114 · 205 · 6.6% · 35.42 · 1.03 · −£519.44 (-16.7%) · -23.9% | 739 · 3,115 · 210 · 6.7% · 37.32 · 1.07 · −£333.43 (-10.7%) · -22.9% |
| Same trainer/horse | 1,101 · 91,334 · 10,284 · 11.3% · 24.34 · 1.00 · −£22758.56 (-24.9%) · -25.3% | 1,084 · 90,535 · 10,209 · 11.3% · 25.71 · 1.01 · −£22955.58 (-25.4%) · -25.8% | 1,098 · 80,209 · 6,538 · 8.2% · 27.29 · 0.97 · −£21687.68 (-27.0%) · -27.5% | 1,081 · 79,376 · 6,428 · 8.1% · 28.90 · 0.97 · −£21738.50 (-27.4%) · -27.9% |
| Unknown | 873 · 6,933 · 533 · 7.7% · 40.05 · 0.94 · −£2738.12 (-39.5%) · -41.7% | 802 · 6,966 · 508 · 7.3% · 40.73 · 0.89 · −£3010.94 (-43.2%) · -45.8% | 864 · 6,498 · 362 · 5.6% · 42.56 · 0.91 · −£2682.60 (-41.3%) · -43.6% | 793 · 6,506 · 343 · 5.3% · 43.42 · 0.84 · −£2935.76 (-45.1%) · -47.9% |

#### Seasonal reappearance by family

| Group | 2025 all | 2026 all | 2025 no fav | 2026 no fav |
| --- | --- | --- | --- | --- |
| Chase · Unknown | 504 · 1,608 · 201 · 12.5% · 22.33 · 0.98 · −£387.44 (-24.1%) · -29.9% | 427 · 1,367 · 165 · 12.1% · 21.11 · 0.91 · −£387.56 (-28.4%) · -33.0% | 487 · 1,393 · 125 · 9.0% · 25.35 · 0.98 · −£351.96 (-25.3%) · -32.1% | 414 · 1,164 · 96 · 8.2% · 24.29 · 0.87 · −£357.88 (-30.7%) · -36.2% |
| Chase · Later in family season | 541 · 7,592 · 1,008 · 13.3% · 15.31 · 1.00 · −£1548.50 (-20.4%) · -21.6% | 531 · 7,265 · 1,016 · 14.0% · 14.35 · 1.01 · −£1245.78 (-17.1%) · -18.8% | 534 · 6,480 · 635 · 9.8% · 17.40 · 0.98 · −£1469.65 (-22.7%) · -24.1% | 523 · 6,170 · 625 · 10.1% · 16.36 · 0.98 · −£1182.32 (-19.2%) · -21.1% |
| Chase · Seasonal reappearance | 473 · 1,538 · 190 · 12.4% · 17.43 · 1.01 · −£299.89 (-19.5%) · -22.9% | 445 · 1,466 · 192 · 13.1% · 16.62 · 1.02 · −£322.75 (-22.0%) · -27.3% | 462 · 1,361 · 141 · 10.4% · 19.30 · 1.09 · −£257.77 (-18.9%) · -22.9% | 429 · 1,285 · 127 · 9.9% · 18.54 · 0.99 · −£316.38 (-24.6%) · -30.7% |
| Hurdle · Later in family season | 717 · 16,437 · 1,821 · 11.1% · 30.41 · 1.01 · −£4812.94 (-29.3%) · -30.3% | 690 · 16,832 · 1,853 · 11.0% · 32.86 · 1.01 · −£4702.04 (-27.9%) · -29.3% | 713 · 14,455 · 1,085 · 7.5% · 34.17 · 0.95 · −£4683.82 (-32.4%) · -33.6% | 689 · 14,786 · 1,158 · 7.8% · 36.99 · 1.00 · −£4410.77 (-29.8%) · -31.3% |
| Hurdle · Seasonal reappearance | 576 · 3,266 · 327 · 10.0% · 28.20 · 0.97 · −£987.15 (-30.2%) · -35.4% | 588 · 3,481 · 322 · 9.3% · 31.47 · 0.98 · −£1164.60 (-33.5%) · -36.8% | 571 · 2,923 · 201 · 6.9% · 31.16 · 0.91 · −£960.04 (-32.8%) · -38.7% | 583 · 3,158 · 209 · 6.6% · 34.36 · 0.90 · −£1149.26 (-36.4%) · -40.1% |
| Hurdle · Unknown | 641 · 3,360 · 264 · 7.9% · 55.86 · 0.98 · −£1549.25 (-46.1%) · -51.0% | 570 · 2,894 · 224 · 7.7% · 63.52 · 0.95 · −£1136.48 (-39.3%) · -53.0% | 635 · 3,112 · 144 · 4.6% · 60.13 · 0.86 · −£1545.68 (-49.7%) · -54.9% | 570 · 2,689 · 135 · 5.0% · 68.20 · 0.91 · −£1095.22 (-40.7%) · -55.6% |
| All Weather · Seasonal reappearance | 514 · 4,435 · 466 · 10.5% · 24.67 · 1.00 · −£1025.80 (-23.1%) · -26.0% | 539 · 4,734 · 500 · 10.6% · 25.77 · 1.04 · −£913.96 (-19.3%) · -23.2% | 509 · 3,974 · 315 · 7.9% · 27.19 · 0.99 · −£956.79 (-24.1%) · -27.3% | 533 · 4,274 · 338 · 7.9% · 28.22 · 1.02 · −£875.92 (-20.5%) · -24.9% |
| All Weather · Later in family season | 517 · 14,971 · 1,686 · 11.3% · 22.16 · 1.00 · −£3539.63 (-23.6%) · -25.5% | 539 · 14,637 · 1,643 · 11.2% · 23.21 · 1.00 · −£3625.07 (-24.8%) · -26.1% | 516 · 13,119 · 1,092 · 8.3% · 24.83 · 0.96 · −£3378.89 (-25.8%) · -27.9% | 535 · 12,801 · 1,059 · 8.3% · 26.09 · 0.97 · −£3383.11 (-26.4%) · -28.0% |
| All Weather · Unknown | 498 · 3,937 · 409 · 10.4% · 37.50 · 0.99 · −£1351.48 (-34.3%) · -38.0% | 463 · 3,732 · 371 · 9.9% · 39.14 · 0.96 · −£1230.25 (-33.0%) · -38.1% | 495 · 3,531 · 225 · 6.4% · 41.52 · 0.88 · −£1342.97 (-38.0%) · -42.2% | 459 · 3,341 · 212 · 6.3% · 43.43 · 0.89 · −£1188.98 (-35.6%) · -41.4% |
| Turf · Seasonal reappearance | 611 · 6,056 · 568 · 9.4% · 21.71 · 1.00 · −£1498.90 (-24.8%) · -27.8% | 622 · 6,537 · 586 · 9.0% · 23.97 · 1.00 · −£1729.65 (-26.5%) · -28.7% | 608 · 5,532 · 398 · 7.2% · 23.46 · 0.96 · −£1481.38 (-26.8%) · -30.2% | 619 · 5,987 · 402 · 6.7% · 25.87 · 0.95 · −£1702.54 (-28.4%) · -30.9% |
| Turf · Later in family season | 647 · 32,870 · 3,728 · 11.3% · 21.86 · 1.01 · −£7105.51 (-21.6%) · -22.6% | 642 · 32,524 · 3,707 · 11.4% · 22.97 · 1.01 · −£7676.34 (-23.6%) · -24.8% | 643 · 28,675 · 2,424 · 8.5% · 24.58 · 1.00 · −£6524.03 (-22.8%) · -23.9% | 639 · 28,291 · 2,324 · 8.2% · 25.94 · 0.98 · −£7188.18 (-25.4%) · -26.8% |
| Turf · Unknown | 601 · 5,628 · 450 · 8.0% · 38.17 · 0.96 · −£1983.02 (-35.2%) · -38.0% | 560 · 5,425 · 431 · 7.9% · 39.30 · 0.93 · −£2218.27 (-40.9%) · -43.5% | 599 · 5,266 · 320 · 6.1% · 40.61 · 0.94 · −£1936.75 (-36.8%) · -39.7% | 556 · 5,051 · 296 · 5.9% · 42.01 · 0.90 · −£2157.13 (-42.7%) · -45.5% |

</details>

Across all four families, third runs on the 90-day definition are less loss-making than first and second runs in both years, with A/E 1.01 and 1.04. At 120 days the 2025 third-run A/E falls below 1. Seasonal reappearance is near A/E 1. The comparison between handicaps and non-handicaps over whole fields has A/E exactly 1 by construction. Handicap/non-handicap ROI differs with field prices and margin. Class or distance changes do not produce a consistent positive return. Changed-trainer non-favourites show A/E 1.03 and 1.07 with ROI −16.7% and −10.7%, weaker evidence than the point estimates suggest given payout concentration.

### Individual trainers

The prespecified second-run screen requires at least 40 SP stakes and three normalised market-expected wins in each year. 28 trainers met both. The table is ordered by combined exposure. The comparison column is each trainer's other starts on the same calendar scope and complete-book basis. Use stable ID to reproduce a row. The second-run cells use the same eight measures as above.

| Group | 2025 all | 2026 all | 2025 no fav | 2026 no fav | Other starts A/E |
| --- | --- | --- | --- | --- | --- |
| H De Bromhead | 1 · 112 · 13 · 11.6% · 14.56 · 0.82 · −£47.74 (-42.6%) · -70.7% | 1 · 127 · 22 · 17.3% · 12.39 · 1.14 · −£1.35 (-1.1%) · -52.3% | 1 · 91 · 5 · 5.5% · 17.30 · 0.59 · −£45.25 (-49.7%) · -84.6% | 1 · 100 · 11 · 11.0% · 14.96 · 1.05 · £0.33 (0.3%) · -65.0% | 1.08 → 0.92 |
| A M Balding | 1 · 105 · 12 · 11.4% · 13.65 · 0.74 · −£53.81 (-51.3%) · -66.3% | 1 · 122 · 20 · 16.4% · 10.23 · 0.95 · −£26.67 (-21.9%) · -45.1% | 1 · 84 · 6 · 7.1% · 16.32 · 0.65 · −£47.67 (-56.7%) · -75.8% | 1 · 88 · 11 · 12.5% · 13.12 · 1.12 · −£19.00 (-21.6%) · -54.1% | 1.19 → 1.13 |
| W P Mullins | 1 · 113 · 33 · 29.2% · 8.16 · 1.38 · −£15.26 (-13.5%) · -26.4% | 1 · 113 · 21 · 18.6% · 10.40 · 0.91 · −£23.69 (-21.0%) · -51.1% | 1 · 71 · 8 · 11.3% · 11.45 · 0.95 · −£30.63 (-43.1%) · -64.7% | 1 · 79 · 8 · 10.1% · 13.96 · 1.03 · −£13.13 (-16.6%) · -59.9% | 1.12 → 1.02 |
| G Elliott | 1 · 95 · 12 · 12.6% · 14.93 · 0.98 · −£33.61 (-35.4%) · -63.0% | 1 · 104 · 16 · 15.4% · 16.69 · 1.08 · −£60.55 (-58.2%) · -65.9% | 1 · 84 · 6 · 7.1% · 16.52 · 0.72 · −£39.38 (-46.9%) · -78.5% | 1 · 91 · 8 · 8.8% · 18.81 · 0.98 · −£61.50 (-67.6%) · -76.6% | 0.96 → 0.94 |
| J P O'Brien | 1 · 88 · 12 · 13.6% · 12.39 · 0.87 · −£30.60 (-34.8%) · -58.3% | 1 · 110 · 22 · 20.0% · 10.86 · 1.07 · −£26.36 (-24.0%) · -40.5% | 1 · 67 · 6 · 9.0% · 15.40 · 0.90 · −£24.00 (-35.8%) · -66.9% | 1 · 73 · 6 · 8.2% · 14.95 · 0.80 · −£32.50 (-44.5%) · -70.7% | 0.95 → 1.15 |
| T D Easterby | 1 · 94 · 9 · 9.6% · 16.83 · 0.86 · −£35.45 (-37.7%) · -73.3% | 1 · 82 · 7 · 8.5% · 19.60 · 0.93 · −£21.63 (-26.4%) · -59.5% | 1 · 83 · 6 · 7.2% · 18.61 · 0.79 · −£33.00 (-39.8%) · -80.2% | 1 · 73 · 6 · 8.2% · 21.59 · 1.16 · −£15.00 (-20.5%) · -57.7% | 1.00 → 0.96 |
| W J Haggas | 1 · 66 · 17 · 25.8% · 6.82 · 1.17 · −£5.77 (-8.7%) · -27.8% | 1 · 96 · 20 · 20.8% · 7.84 · 0.99 · −£5.86 (-6.1%) · -40.7% | 1 · 42 · 6 · 14.3% · 9.07 · 1.00 · −£13.38 (-31.8%) · -63.4% | 1 · 57 · 7 · 12.3% · 11.21 · 0.96 · −£1.25 (-2.2%) · -61.6% | 1.09 → 0.98 |
| R M Beckett | 1 · 87 · 13 · 14.9% · 9.74 · 0.84 · −£55.49 (-63.8%) · -71.7% | 1 · 71 · 15 · 21.1% · 13.03 · 1.19 · −£8.73 (-12.3%) · -38.0% | 1 · 69 · 5 · 7.2% · 11.58 · 0.53 · −£52.63 (-76.3%) · -86.8% | 1 · 52 · 7 · 13.5% · 16.84 · 1.34 · −£12.00 (-23.1%) · -59.0% | 0.95 → 0.95 |
| G P Cromwell | 1 · 72 · 3 · 4.2% · 14.35 · 0.32 · −£51.33 (-71.3%) · -97.6% | 1 · 83 · 5 · 6.0% · 21.86 · 0.62 · −£60.02 (-72.3%) · -92.0% | 1 · 56 · 1 · 1.8% · 17.52 · 0.22 · −£39.00 (-69.6%) · — | 1 · 78 · 2 · 2.6% · 23.11 · 0.35 · −£61.50 (-78.8%) · -100.0% | 0.93 → 0.99 |
| D Skelton | 1 · 69 · 8 · 11.6% · 16.39 · 0.66 · −£4.58 (-6.6%) · -77.0% | 1 · 80 · 22 · 27.5% · 21.48 · 1.20 · −£10.66 (-13.3%) · -31.6% | 1 · 57 · 3 · 5.3% · 19.31 · 0.47 · £0.50 (0.9%) · -84.5% | 1 · 53 · 9 · 17.0% · 31.30 · 1.44 · −£10.13 (-19.1%) · -47.3% | 1.00 → 1.09 |
| J & T Gosden | 1 · 74 · 20 · 27.0% · 8.53 · 1.25 · £14.84 (20.1%) · -3.7% | 1 · 67 · 11 · 16.4% · 6.69 · 0.66 · −£44.22 (-66.0%) · -76.1% | 1 · 46 · 9 · 19.6% · 12.06 · 1.66 · £17.00 (37.0%) · -1.1% | 1 · 44 · 1 · 2.3% · 9.07 · 0.16 · −£40.50 (-92.0%) · — | 1.10 → 1.12 |
| K R Burke | 1 · 60 · 8 · 13.3% · 19.87 · 1.19 · −£21.18 (-35.3%) · -61.5% | 1 · 74 · 12 · 16.2% · 13.53 · 1.14 · £2.83 (3.8%) · -35.4% | 1 · 53 · 5 · 9.4% · 22.15 · 1.20 · −£21.17 (-39.9%) · -69.9% | 1 · 63 · 9 · 14.3% · 15.45 · 1.39 · £4.58 (7.3%) · -39.0% | 1.15 → 1.08 |

<details>
<summary>All qualifying trainer IDs and second-run results</summary>

| Trainer · ID | 2025 all | 2026 all | 2025 no fav | 2026 no fav | Other starts A/E |
| --- | --- | --- | --- | --- | --- |
| H De Bromhead · 92242599-2e05-4111-a8bf-e5e9d8eba614 | 1 · 112 · 13 · 11.6% · 14.56 · 0.82 · −£47.74 (-42.6%) · -70.7% | 1 · 127 · 22 · 17.3% · 12.39 · 1.14 · −£1.35 (-1.1%) · -52.3% | 1 · 91 · 5 · 5.5% · 17.30 · 0.59 · −£45.25 (-49.7%) · -84.6% | 1 · 100 · 11 · 11.0% · 14.96 · 1.05 · £0.33 (0.3%) · -65.0% | 1.08 → 0.92 |
| A M Balding · 296f2c74-c55d-4d7c-b8ad-f8f147987afd | 1 · 105 · 12 · 11.4% · 13.65 · 0.74 · −£53.81 (-51.3%) · -66.3% | 1 · 122 · 20 · 16.4% · 10.23 · 0.95 · −£26.67 (-21.9%) · -45.1% | 1 · 84 · 6 · 7.1% · 16.32 · 0.65 · −£47.67 (-56.7%) · -75.8% | 1 · 88 · 11 · 12.5% · 13.12 · 1.12 · −£19.00 (-21.6%) · -54.1% | 1.19 → 1.13 |
| W P Mullins · 3f1e3564-c1b9-4ea1-b98b-038382ce5242 | 1 · 113 · 33 · 29.2% · 8.16 · 1.38 · −£15.26 (-13.5%) · -26.4% | 1 · 113 · 21 · 18.6% · 10.40 · 0.91 · −£23.69 (-21.0%) · -51.1% | 1 · 71 · 8 · 11.3% · 11.45 · 0.95 · −£30.63 (-43.1%) · -64.7% | 1 · 79 · 8 · 10.1% · 13.96 · 1.03 · −£13.13 (-16.6%) · -59.9% | 1.12 → 1.02 |
| G Elliott · 20074e34-4f38-4315-98ea-d102140eee00 | 1 · 95 · 12 · 12.6% · 14.93 · 0.98 · −£33.61 (-35.4%) · -63.0% | 1 · 104 · 16 · 15.4% · 16.69 · 1.08 · −£60.55 (-58.2%) · -65.9% | 1 · 84 · 6 · 7.1% · 16.52 · 0.72 · −£39.38 (-46.9%) · -78.5% | 1 · 91 · 8 · 8.8% · 18.81 · 0.98 · −£61.50 (-67.6%) · -76.6% | 0.96 → 0.94 |
| J P O'Brien · 4e19abfb-37dd-4ebf-baf7-90af76274132 | 1 · 88 · 12 · 13.6% · 12.39 · 0.87 · −£30.60 (-34.8%) · -58.3% | 1 · 110 · 22 · 20.0% · 10.86 · 1.07 · −£26.36 (-24.0%) · -40.5% | 1 · 67 · 6 · 9.0% · 15.40 · 0.90 · −£24.00 (-35.8%) · -66.9% | 1 · 73 · 6 · 8.2% · 14.95 · 0.80 · −£32.50 (-44.5%) · -70.7% | 0.95 → 1.15 |
| T D Easterby · bb3fb0ff-a448-4892-9d86-3533d8c5b207 | 1 · 94 · 9 · 9.6% · 16.83 · 0.86 · −£35.45 (-37.7%) · -73.3% | 1 · 82 · 7 · 8.5% · 19.60 · 0.93 · −£21.63 (-26.4%) · -59.5% | 1 · 83 · 6 · 7.2% · 18.61 · 0.79 · −£33.00 (-39.8%) · -80.2% | 1 · 73 · 6 · 8.2% · 21.59 · 1.16 · −£15.00 (-20.5%) · -57.7% | 1.00 → 0.96 |
| W J Haggas · 86c6d619-04d4-49c9-8565-74fcefabc61e | 1 · 66 · 17 · 25.8% · 6.82 · 1.17 · −£5.77 (-8.7%) · -27.8% | 1 · 96 · 20 · 20.8% · 7.84 · 0.99 · −£5.86 (-6.1%) · -40.7% | 1 · 42 · 6 · 14.3% · 9.07 · 1.00 · −£13.38 (-31.8%) · -63.4% | 1 · 57 · 7 · 12.3% · 11.21 · 0.96 · −£1.25 (-2.2%) · -61.6% | 1.09 → 0.98 |
| R M Beckett · 8c04984a-b33c-49ce-a9b8-0c53a8dd2d21 | 1 · 87 · 13 · 14.9% · 9.74 · 0.84 · −£55.49 (-63.8%) · -71.7% | 1 · 71 · 15 · 21.1% · 13.03 · 1.19 · −£8.73 (-12.3%) · -38.0% | 1 · 69 · 5 · 7.2% · 11.58 · 0.53 · −£52.63 (-76.3%) · -86.8% | 1 · 52 · 7 · 13.5% · 16.84 · 1.34 · −£12.00 (-23.1%) · -59.0% | 0.95 → 0.95 |
| G P Cromwell · 3a208bee-2650-448d-b9c3-79e5d5913154 | 1 · 72 · 3 · 4.2% · 14.35 · 0.32 · −£51.33 (-71.3%) · -97.6% | 1 · 83 · 5 · 6.0% · 21.86 · 0.62 · −£60.02 (-72.3%) · -92.0% | 1 · 56 · 1 · 1.8% · 17.52 · 0.22 · −£39.00 (-69.6%) · — | 1 · 78 · 2 · 2.6% · 23.11 · 0.35 · −£61.50 (-78.8%) · -100.0% | 0.93 → 0.99 |
| D Skelton · 3e45973a-1e76-499a-acb1-aea7db1a051d | 1 · 69 · 8 · 11.6% · 16.39 · 0.66 · −£4.58 (-6.6%) · -77.0% | 1 · 80 · 22 · 27.5% · 21.48 · 1.20 · −£10.66 (-13.3%) · -31.6% | 1 · 57 · 3 · 5.3% · 19.31 · 0.47 · £0.50 (0.9%) · -84.5% | 1 · 53 · 9 · 17.0% · 31.30 · 1.44 · −£10.13 (-19.1%) · -47.3% | 1.00 → 1.09 |
| J & T Gosden · ca204761-ca91-41a6-aaba-d6b92179ae57 | 1 · 74 · 20 · 27.0% · 8.53 · 1.25 · £14.84 (20.1%) · -3.7% | 1 · 67 · 11 · 16.4% · 6.69 · 0.66 · −£44.22 (-66.0%) · -76.1% | 1 · 46 · 9 · 19.6% · 12.06 · 1.66 · £17.00 (37.0%) · -1.1% | 1 · 44 · 1 · 2.3% · 9.07 · 0.16 · −£40.50 (-92.0%) · — | 1.10 → 1.12 |
| K R Burke · 8844bab0-78f2-4e0e-b0ff-aaa60e92bc5d | 1 · 60 · 8 · 13.3% · 19.87 · 1.19 · −£21.18 (-35.3%) · -61.5% | 1 · 74 · 12 · 16.2% · 13.53 · 1.14 · £2.83 (3.8%) · -35.4% | 1 · 53 · 5 · 9.4% · 22.15 · 1.20 · −£21.17 (-39.9%) · -69.9% | 1 · 63 · 9 · 14.3% · 15.45 · 1.39 · £4.58 (7.3%) · -39.0% | 1.15 → 1.08 |
| R A Fahey · 73554a5f-160d-46d3-8972-eb7e1e8daefa | 1 · 63 · 6 · 9.5% · 23.86 · 1.21 · £177.75 (282.1%) · -54.5% | 1 · 69 · 11 · 15.9% · 19.84 · 1.54 · £16.85 (24.4%) · -19.6% | 1 · 58 · 5 · 8.6% · 25.55 · 1.31 · £179.00 (308.6%) · -57.1% | 1 · 62 · 8 · 12.9% · 21.76 · 1.72 · £16.75 (27.0%) · -22.1% | 0.81 → 0.90 |
| R Hannon · cefdfb13-4c20-4604-932d-18fd2ab52dcb | 1 · 75 · 9 · 12.0% · 15.34 · 0.97 · −£24.42 (-32.6%) · -60.8% | 1 · 57 · 11 · 19.3% · 13.81 · 1.53 · £26.83 (47.1%) · -14.8% | 1 · 64 · 6 · 9.4% · 17.43 · 1.02 · −£19.67 (-30.7%) · -64.0% | 1 · 51 · 9 · 17.6% · 14.94 · 1.53 · £23.50 (46.1%) · -23.5% | 1.02 → 0.94 |
| A P O'Brien · 9231cdb3-1ad1-408d-ba2a-940e9f3e350d | 1 · 64 · 17 · 26.6% · 11.22 · 1.25 · −£17.90 (-28.0%) · -40.8% | 1 · 67 · 11 · 16.4% · 12.85 · 0.88 · −£32.19 (-48.1%) · -63.4% | 1 · 44 · 5 · 11.4% · 15.38 · 1.05 · −£22.17 (-50.4%) · -71.1% | 1 · 51 · 4 · 7.8% · 16.18 · 0.73 · −£30.67 (-60.1%) · -81.0% | 1.13 → 1.01 |
| C Johnston · ba194edc-6771-41b3-a1f5-ea19b0baeb0a | 1 · 69 · 11 · 15.9% · 13.20 · 1.22 · −£18.29 (-26.5%) · -46.7% | 1 · 52 · 7 · 13.5% · 13.35 · 0.99 · −£27.55 (-53.0%) · -72.1% | 1 · 56 · 7 · 12.5% · 15.50 · 1.29 · −£16.25 (-29.0%) · -54.2% | 1 · 47 · 5 · 10.6% · 14.49 · 0.97 · −£26.13 (-55.6%) · -76.9% | 1.09 → 0.94 |
| Mrs J Harrington · 1efcdfdb-3fd6-45ec-bd84-e4090d62f982 | 1 · 62 · 6 · 9.7% · 15.09 · 0.81 · −£25.87 (-41.7%) · -84.8% | 1 · 55 · 5 · 9.1% · 16.42 · 0.77 · −£30.67 (-55.8%) · -85.7% | 1 · 53 · 2 · 3.8% · 17.19 · 0.46 · −£26.00 (-49.1%) · -100.0% | 1 · 47 · 2 · 4.3% · 18.67 · 0.46 · −£31.00 (-66.0%) · -100.0% | 0.84 → 0.90 |
| E Walker · f23cc793-f5c2-4745-9767-0b316adb3f62 | 1 · 46 · 6 · 13.0% · 9.88 · 0.84 · −£22.27 (-48.4%) · -71.3% | 1 · 71 · 13 · 18.3% · 14.05 · 1.24 · £9.07 (12.8%) · -24.5% | 1 · 38 · 4 · 10.5% · 11.46 · 0.94 · −£19.65 (-51.7%) · -79.9% | 1 · 56 · 9 · 16.1% · 17.05 · 1.56 · £13.57 (24.2%) · -23.0% | 0.84 → 1.08 |
| G & J Moore · 014d5da5-22a9-4122-ae76-f2192cc89fbd | 1 · 65 · 14 · 21.5% · 16.29 · 1.60 · £9.67 (14.9%) · -22.7% | 1 · 51 · 7 · 13.7% · 22.71 · 1.24 · £17.38 (34.1%) · -17.6% | 1 · 55 · 7 · 12.7% · 18.81 · 1.39 · £3.00 (5.5%) · -39.6% | 1 · 45 · 6 · 13.3% · 25.29 · 1.53 · £20.50 (45.6%) · -12.8% | 0.90 → 0.87 |
| R Varian · ffe015e8-cc61-4bcd-8603-c7108e51a193 | 1 · 59 · 8 · 13.6% · 9.11 · 0.65 · −£43.57 (-73.9%) · -83.2% | 1 · 48 · 10 · 20.8% · 12.26 · 1.18 · −£13.69 (-28.5%) · -52.6% | 1 · 37 · 0 · 0.0% · 12.95 · 0.00 · −£37.00 (-100.0%) · — | 1 · 36 · 5 · 13.9% · 15.52 · 1.38 · −£12.42 (-34.5%) · -67.4% | 1.01 → 1.11 |
| M & D Easterby · b98a6827-ac10-4292-8a8f-5ea1cbe8f714 | 1 · 52 · 3 · 5.8% · 20.49 · 0.60 · −£42.30 (-81.3%) · -96.0% | 1 · 52 · 6 · 11.5% · 16.84 · 1.16 · −£8.00 (-15.4%) · -53.0% | 1 · 48 · 1 · 2.1% · 21.99 · 0.28 · −£42.50 (-88.5%) · — | 1 · 48 · 5 · 10.4% · 17.94 · 1.19 · −£7.00 (-14.6%) · -55.4% | 0.79 → 1.01 |
| D O'Meara · ab5d1880-b300-494f-b6a0-97223b8839ef | 1 · 52 · 8 · 15.4% · 14.76 · 1.17 · −£11.59 (-22.3%) · -65.2% | 1 · 51 · 5 · 9.8% · 14.74 · 0.85 · −£20.63 (-40.4%) · -76.3% | 1 · 44 · 3 · 6.8% · 16.91 · 0.72 · −£17.00 (-38.6%) · -90.5% | 1 · 46 · 4 · 8.7% · 16.03 · 0.94 · −£18.88 (-41.0%) · -81.1% | 0.85 → 0.91 |
| J & A O'Neill · fcc64168-394a-4d3c-9f96-f1bf8e9a56c5 | 1 · 44 · 1 · 2.3% · 14.76 · 0.19 · −£40.25 (-91.5%) · — | 1 · 52 · 9 · 17.3% · 9.91 · 1.27 · −£10.75 (-20.7%) · -44.5% | 1 · 40 · 1 · 2.5% · 15.81 · 0.23 · −£36.25 (-90.6%) · — | 1 · 43 · 4 · 9.3% · 11.27 · 0.85 · −£21.00 (-48.8%) · -79.3% | 0.80 → 1.05 |
| F O'Brien · af88938f-1d43-41f5-8f4a-772111436cff | 1 · 47 · 7 · 14.9% · 13.53 · 1.24 · £20.00 (42.6%) · -35.6% | 1 · 47 · 5 · 10.6% · 24.46 · 1.10 · −£10.93 (-23.2%) · -73.2% | 1 · 46 · 7 · 15.2% · 13.78 · 1.34 · £21.00 (45.7%) · -34.1% | 1 · 45 · 4 · 8.9% · 25.44 · 1.04 · −£11.80 (-26.2%) · -78.6% | 1.12 → 0.99 |
| K A Ryan · 11311673-b6c9-421e-b96c-a98503ed1aef | 1 · 41 · 3 · 7.3% · 12.26 · 0.51 · −£32.80 (-80.0%) · -96.9% | 1 · 49 · 3 · 6.1% · 22.33 · 0.65 · −£36.42 (-74.3%) · -93.1% | 1 · 35 · 1 · 2.9% · 13.80 · 0.26 · −£31.50 (-90.0%) · — | 1 · 44 · 1 · 2.3% · 24.42 · 0.28 · −£39.00 (-88.6%) · — | 0.93 → 0.94 |
| A W Carroll · c462a982-b2ce-4804-b2d2-fc9e417d992e | 1 · 43 · 2 · 4.7% · 30.02 · 0.61 · −£27.63 (-64.2%) · -100.0% | 1 · 46 · 4 · 8.7% · 31.72 · 1.21 · −£29.25 (-63.6%) · -88.1% | 1 · 41 · 1 · 2.4% · 31.33 · 0.37 · −£28.00 (-68.3%) · — | 1 · 41 · 1 · 2.4% · 35.15 · 0.49 · −£32.50 (-79.3%) · — | 1.09 → 1.02 |
| O Murphy · 686ca5ed-ea4a-4804-aa21-724c5bdefcb1 | 1 · 45 · 9 · 20.0% · 15.93 · 0.93 · −£23.29 (-51.8%) · -64.6% | 1 · 41 · 10 · 24.4% · 11.81 · 1.18 · £8.81 (21.5%) · -42.8% | 1 · 30 · 3 · 10.0% · 22.53 · 0.70 · −£21.63 (-72.1%) · -91.1% | 1 · 28 · 5 · 17.9% · 16.12 · 1.36 · £11.33 (40.5%) · -54.5% | 1.13 → 0.96 |
| N Meade · 26df729a-b15a-4a5f-a8b5-bfc6b87e1660 | 1 · 40 · 4 · 10.0% · 20.27 · 0.92 · −£17.43 (-43.6%) · -86.6% | 1 · 45 · 5 · 11.1% · 15.14 · 1.13 · −£14.25 (-31.7%) · -73.8% | 1 · 35 · 3 · 8.6% · 22.82 · 1.17 · −£14.63 (-41.8%) · -91.3% | 1 · 40 · 3 · 7.5% · 16.61 · 0.94 · −£15.50 (-38.8%) · -86.8% | 0.87 → 0.88 |

</details>

R A Fahey and G & J Moore had positive second-run headline ROI in both years. Both lost in both years after the two highest-return races were removed, including when SP favourites were excluded. Their A/E intervals are wide and neither trainer supplies a repeatable market-adjusted profit finding.

### Did Tissue miss a trainer signal?

On exact starter-roster joins, compare the same fractional wins with frozen Tissue expectation and normalised SP expectation. The baseline for all complete fields is mechanically one. On non-favourites, compare each spell's A/model with the model's all-non-favourite calibration in that same book population.

| Frozen probability book | Group | 2025 all | 2026 all | 2025 no fav | 2026 no fav |
| --- | --- | --- | --- | --- | --- |
| Chase | All | 9,122 · 1,181 · 1.00 · 1.00 | 8,637 · 1,154 · 1.00 · 1.00 | 7,853 · 762 · 0.84 · 0.99 | 7,392 · 713 · 0.81 · 0.96 |
| Chase | First | 939 · 93 · 0.87 · 0.96 | 974 · 90 · 0.77 · 0.84 | 874 · 79 · 0.83 · 1.03 | 888 · 62 · 0.64 · 0.80 |
| Chase | Second | 915 · 109 · 0.95 · 0.94 | 862 · 108 · 0.95 · 1.01 | 799 · 68 · 0.76 · 0.89 | 751 · 63 · 0.71 · 0.91 |
| Chase | Third | 1,012 · 145 · 1.09 · 1.05 | 1,079 · 155 · 1.05 · 1.02 | 857 · 88 · 0.88 · 1.02 | 898 · 88 · 0.83 · 0.97 |
| AW V1 | All | 17,699 · 1,959 · 1.00 · 1.00 | 17,916 · 2,002 · 1.00 · 1.00 | 15,613 · 1,227 · 0.76 · 0.94 | 15,761 · 1,269 · 0.78 · 0.96 |
| AW V1 | First | 1,799 · 213 · 1.12 · 1.07 | 1,909 · 227 · 1.12 · 1.08 | 1,586 · 123 · 0.80 · 1.00 | 1,696 · 134 · 0.82 · 1.04 |
| AW V1 | Second | 1,165 · 103 · 0.80 · 0.82 | 1,241 · 139 · 0.99 · 1.03 | 1,038 · 63 · 0.59 · 0.76 | 1,090 · 90 · 0.80 · 1.06 |
| AW V1 | Third | 818 · 96 · 1.03 · 1.01 | 961 · 109 · 1.02 · 1.02 | 709 · 57 · 0.75 · 0.92 | 839 · 74 · 0.87 · 1.08 |
| AW V2 | All | 17,381 · 1,926 · 1.00 · 1.00 | 17,370 · 1,947 · 1.00 · 1.00 | 15,330 · 1,199 · 0.78 · 0.94 | 15,272 · 1,235 · 0.80 · 0.97 |
| AW V2 | First | 1,774 · 211 · 1.12 · 1.07 | 1,852 · 225 · 1.10 · 1.10 | 1,563 · 121 · 0.81 · 1.00 | 1,642 · 133 · 0.83 · 1.06 |
| AW V2 | Second | 1,140 · 102 · 0.83 · 0.83 | 1,186 · 129 · 0.98 · 1.00 | 1,015 · 62 · 0.63 · 0.76 | 1,044 · 83 · 0.81 · 1.02 |
| AW V2 | Third | 803 · 94 · 1.02 · 1.00 | 934 · 105 · 1.01 · 1.00 | 697 · 55 · 0.76 · 0.90 | 814 · 71 · 0.89 · 1.07 |

Cells show stakes · winner records · A/Tissue · A/SP. On the matched Chase replay, Tissue slightly underpredicted third-run winners overall in both years and markedly overpredicted for the first run. Non-favourite third runs were below Tissue expectation and closer to the non-favourite base rate. AW Tissue V1 and V2 underpredicted first-run winners overall, while the SP market also underpredicted them on those fields. AW second runs were weaker in 2025 and roughly at expectation in 2026. A full verification of the current Hurdle and Turf Tissue generations is limited by the 2025 forecast-book gap.

## G. Cross-year consistency

For race-mix sensitivity, compare shared cells defined by month, family, handicap, field size (≤7, 8–11, 12+) and numeric class band (1–3, 4–5, 6+, unknown). Use the lower annual selection count as each cell's weight, with equal weight per selection within that cell and year. These are common-support comparisons. Sparse cells can drop races or increase the influence of single finishes.

| Group | Equivalent stakes per year | Matched A/E | Race-mix A/E | Matched ROI | Race-mix ROI | Matched mean SP |
| --- | --- | --- | --- | --- | --- | --- |
| Chase Favourite | 1,288 | 1.01 → 1.07 | 1.01 → 1.06 | -10.4% → -6.7% | -9.8% → -6.9% | 3.06 → 2.97 |
| Chase Second | 1,199 | 1.08 → 1.01 | 1.08 → 1.02 | -3.6% → -12.1% | -3.2% → -11.4% | 4.52 → 4.35 |
| Hurdle Favourite | 2,218 | 1.12 → 1.05 | 1.13 → 1.05 | -6.2% → -13.5% | -5.4% → -13.4% | 2.92 → 2.95 |
| Hurdle Second | 2,103 | 0.95 → 1.05 | 0.94 → 1.03 | -20.1% → -14.0% | -20.9% → -15.5% | 4.65 → 4.46 |
| All Weather Favourite | 2,232 | 1.09 → 1.06 | 1.08 → 1.07 | -8.8% → -12.0% | -9.4% → -11.2% | 3.08 → 3.01 |
| All Weather Second | 2,159 | 1.02 → 0.99 | 1.04 → 0.99 | -13.7% → -18.7% | -11.9% → -18.4% | 4.62 → 4.55 |
| Turf Favourite | 4,503 | 1.03 → 1.06 | 1.03 → 1.05 | -12.7% → -11.2% | -12.7% → -11.6% | 3.18 → 3.14 |
| Turf Second | 4,276 | 1.04 → 1.05 | 1.04 → 1.06 | -11.7% → -11.6% | -11.8% → -11.1% | 4.71 → 4.67 |
| Saved Chase filter · Full | 211 | 1.11 → 1.02 | 1.08 → 1.02 | 12.7% → -16.3% | 11.4% → -16.4% | 6.34 → 6.25 |
| Saved Chase filter · No fav | 140 | 1.18 → 1.02 | 1.14 → 1.00 | 22.0% → -23.2% | 25.4% → -22.7% | 7.89 → 8.07 |
| Jump handicap (both saved names) · Full | 1,003 | 0.98 → 0.96 | 0.97 → 0.95 | -11.9% → -16.5% | -11.7% → -12.5% | 10.75 → 12.08 |
| Jump handicap (both saved names) · No fav | 792 | 0.96 → 0.98 | 0.96 → 0.98 | -11.6% → -15.2% | -10.5% → -10.1% | 12.44 → 14.09 |
| Turf trainer / TPR · Full | 313 | 1.22 → 0.80 | 1.25 → 0.76 | 41.4% → 35.6% | 57.9% → 33.9% | 9.92 → 10.36 |
| Turf trainer / TPR · No fav | 198 | 1.18 → 0.91 | 1.19 → 0.91 | 56.0% → 70.1% | 72.4% → 51.7% | 13.14 → 13.74 |

Chase and Hurdle favourite changes persist after reweighting. All Weather and Turf remain fairly close in strike. Turf second favourites remain around 1.05 A/E, while the returns remain negative. The drift in the saved Chase rule is larger than the changes in the matched market baseline and persists after balancing observed race mix. The saved Turf rule has a lower strike and A/E in 2026 despite positive raw profit. Its annual returns depend on different prices and winners across years.

| 90-day trainer group | Cut | Equivalent stakes per year | Race- and SP-mix A/E | Race- and SP-mix ROI |
| --- | --- | --- | --- | --- |
| Run 1 | All | 8,026 | 1.01 → 1.00 | -27.9% → -28.1% |
| Run 1 | No fav | 7,303 | 0.97 → 0.95 | -29.9% → -30.1% |
| Run 2 | All | 6,169 | 0.95 → 0.99 | -28.1% → -29.8% |
| Run 2 | No fav | 5,463 | 0.89 → 0.99 | -30.1% → -31.6% |
| Run 3 | All | 5,177 | 1.02 → 1.04 | -16.1% → -20.6% |
| Run 3 | No fav | 4,504 | 1.01 → 1.05 | -16.7% → -21.7% |

The balance for the trainer table additionally uses fixed broad SP bands. There was no search for price cutoffs. Its ROI remains negative and second-run A/E still lacks a consistent uplift.

## H. Robustness and potential data leakage

Remove the whole race with the largest selected winning gross, then the two such races. The remaining sample loses every selection in those races, including any losing stakes. Gross-share figures divide the two gross payouts by all gross payouts in that group. Approximate 95% intervals resample distinct racing dates as clusters 2,000 times with the existing deterministic seed. Runners from the same date stay together. Dates are the resampling unit. Dependence across dates, especially from repeat trainers and horses, can leave the intervals too narrow.

| Group | Year | Stakes | Race dates | ROI | 95% ROI | 95% A/E | Top two gross share | After largest P/L (ROI) | After two P/L (ROI) | After two A/E | Removed source race IDs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chase favourites | 2025 | 1,504 | 274 | -10.4% | -17.7% to -2.6% | 0.94 to 1.09 | 1.2% | −£162.95 (-10.8%) | −£169.45 (-11.3%) | 1.01 | 855894, 838513 |
| Chase favourites | 2026 | 1,479 | 272 | -6.7% | -13.7% to 0.3% | 0.99 to 1.14 | 0.9% | −£105.52 (-7.1%) | −£110.52 (-7.5%) | 1.06 | 908745, 930862 |
| Hurdle favourites | 2025 | 2,573 | 281 | -6.2% | -11.7% to -0.9% | 1.06 to 1.17 | 0.6% | −£165.30 (-6.4%) | −£169.80 (-6.6%) | 1.12 | 852906, 865915 |
| Hurdle favourites | 2026 | 2,574 | 281 | -13.5% | -18.5% to -8.4% | 0.99 to 1.10 | 0.6% | −£353.87 (-13.8%) | −£359.37 (-14.0%) | 1.04 | 914457, 947664 |
| All Weather favourites | 2025 | 2,719 | 224 | -8.8% | -13.7% to -3.8% | 1.04 to 1.14 | 0.5% | −£242.26 (-8.9%) | −£245.76 (-9.1%) | 1.09 | 843591, 860741 |
| All Weather favourites | 2026 | 2,687 | 222 | -12.0% | -17.1% to -6.5% | 1.01 to 1.12 | 0.5% | −£325.76 (-12.1%) | −£330.26 (-12.3%) | 1.06 | 941442, 931655 |
| Turf favourites | 2025 | 5,081 | 219 | -12.7% | -16.6% to -8.4% | 0.99 to 1.07 | 0.4% | −£651.29 (-12.8%) | −£657.29 (-12.9%) | 1.03 | 854703, 874120 |
| Turf favourites | 2026 | 5,157 | 218 | -11.2% | -14.8% to -7.7% | 1.02 to 1.09 | 0.3% | −£580.90 (-11.3%) | −£585.40 (-11.4%) | 1.06 | 912355, 930042 |
| Saved Chase filter · No fav | 2025 | 200 | 114 | 22.0% | -17.4% to 77.0% | 0.87 to 1.55 | 20.1% | £11.92 (6.0%) | −£2.08 (-1.1%) | 1.12 | 841819, 849309 |
| Saved Chase filter · No fav | 2026 | 230 | 124 | -23.2% | -45.6% to 3.2% | 0.75 to 1.31 | 9.9% | −£62.34 (-27.2%) | −£67.84 (-29.9%) | 0.97 | 917295, 915598 |
| Jump handicap · No fav | 2025 | 1,042 | 211 | -11.6% | -30.1% to 8.7% | 0.81 to 1.12 | 9.2% | −£169.96 (-16.3%) | −£198.96 (-19.2%) | 0.94 | 876460, 847079 |
| Jump handicap · No fav | 2026 | 1,045 | 214 | -15.2% | -36.4% to 11.1% | 0.81 to 1.15 | 13.0% | −£235.32 (-22.6%) | −£266.32 (-25.7%) | 0.96 | 910722, 917313 |
| Turf trainer / TPR · Full | 2025 | 424 | 133 | 41.4% | -10.9% to 129.7% | 1.05 to 1.40 | 30.9% | £25.61 (6.1%) | −£7.39 (-1.8%) | 1.20 | 860892, 879039 |
| Turf trainer / TPR · Full | 2026 | 413 | 144 | 35.6% | -36.4% to 143.0% | 0.62 to 0.99 | 43.2% | −£53.12 (-12.9%) | −£93.12 (-22.7%) | 0.78 | 923209, 934204 |
| Turf trainer / TPR · No fav | 2025 | 293 | 117 | 56.0% | -20.2% to 190.5% | 0.89 to 1.50 | 40.5% | £14.13 (4.8%) | −£18.88 (-6.5%) | 1.12 | 860892, 879039 |
| Turf trainer / TPR · No fav | 2026 | 285 | 122 | 70.1% | -33.4% to 248.8% | 0.65 to 1.23 | 49.9% | −£0.13 (-0.0%) | −£40.13 (-14.2%) | 0.86 | 923209, 934204 |
| Turf trainer / TPR · 7+ | 2025 | 60 | 41 | -10.0% | -100.0% to 83.3% | 0.00 to 2.79 | 75.9% | −£31.00 (-52.5%) | −£45.00 (-77.6%) | 0.48 | 859366, 865461 |
| Turf trainer / TPR · 7+ | 2026 | 42 | 36 | 616.7% | -43.2% to 1790.0% | 0.70 to 6.63 | 80.4% | £59.00 (143.9%) | £19.00 (47.5%) | 2.10 | 923209, 934204 |
| Chase V2 T3 · No fav | 2025 | 995 | 238 | -0.4% | -19.0% to 19.0% | 0.99 to 1.33 | 9.4% | −£69.73 (-7.0%) | −£94.73 (-9.5%) | 1.14 | 842190, 840389 |
| Chase V2 T3 · No fav | 2026 | 974 | 235 | -17.4% | -31.8% to -2.7% | 0.84 to 1.13 | 5.5% | −£191.68 (-19.7%) | −£211.68 (-21.8%) | 0.98 | 915101, 921372 |
| AW Tissue V1 T1 · 7+ | 2025 | 148 | 95 | -21.6% | -76.8% to 49.6% | 0.40 to 1.88 | 49.1% | −£65.00 (-44.2%) | −£87.00 (-59.6%) | 0.75 | 836789, 877611 |
| AW Tissue V1 T1 · 7+ | 2026 | 135 | 92 | 80.7% | -40.4% to 234.0% | 0.64 to 2.60 | 47.1% | £29.00 (21.6%) | −£4.00 (-3.0%) | 1.18 | 936884, 907324 |
| AW Tissue V2 T1 · No fav | 2025 | 1,146 | 176 | -13.3% | -25.5% to 0.2% | 0.88 to 1.13 | 4.9% | −£177.49 (-15.5%) | −£199.49 (-17.4%) | 0.99 | 839281, 877611 |
| AW Tissue V2 T1 · No fav | 2026 | 1,087 | 177 | -18.6% | -32.1% to -4.5% | 0.89 to 1.18 | 4.9% | −£226.85 (-20.9%) | −£242.85 (-22.4%) | 1.02 | 904888, 932623 |
| 90d Run 1 | 2025 | 11,065 | 322 | -30.0% | -35.0% to -24.8% | 0.98 to 1.06 | 2.7% | −£3443.37 (-31.1%) | −£3523.37 (-31.9%) | 1.02 | 886082, 849352 |
| 90d Run 1 | 2026 | 11,323 | 321 | -26.0% | -32.0% to -19.7% | 0.96 to 1.05 | 2.5% | −£3064.30 (-27.1%) | −£3143.30 (-27.8%) | 1.00 | 930628, 936884 |
| 90d Run 2 | 2025 | 8,658 | 322 | -23.6% | -32.5% to -12.9% | 0.91 to 1.01 | 6.1% | −£2240.76 (-25.9%) | −£2437.76 (-28.2%) | 0.96 | 853229, 872905 |
| 90d Run 2 | 2026 | 8,907 | 321 | -29.3% | -35.0% to -23.3% | 0.95 to 1.05 | 1.5% | −£2662.04 (-29.9%) | −£2700.04 (-30.3%) | 1.00 | 917465, 913049 |
| 90d Run 3 | 2025 | 7,295 | 322 | -20.4% | -28.2% to -11.8% | 0.96 to 1.07 | 4.0% | −£1638.31 (-22.5%) | −£1716.31 (-23.5%) | 1.01 | 860892, 852406 |
| 90d Run 3 | 2026 | 7,723 | 320 | -20.7% | -28.2% to -12.6% | 0.99 to 1.09 | 4.1% | −£1745.03 (-22.6%) | −£1844.03 (-23.9%) | 1.03 | 917508, 944195 |
| Trainer changed · no fav | 2025 | 3,114 | 321 | -16.7% | -33.2% to 1.5% | 0.91 to 1.15 | 8.7% | −£644.44 (-20.7%) | −£742.44 (-23.9%) | 1.02 | 865873, 838525 |
| R A Fahey · second run | 2025 | 63 | 50 | 282.1% | -75.0% to 1042.9% | 0.39 to 2.26 | 88.5% | −£22.25 (-35.9%) | −£33.25 (-54.5%) | 0.82 | 872905, 882338 |
| G & J Moore · second run | 2025 | 65 | 52 | 14.9% | -43.1% to 83.6% | 1.05 to 2.17 | 34.8% | −£2.33 (-3.6%) | −£14.33 (-22.7%) | 1.39 | 864401, 847030 |
| Trainer changed · no fav | 2026 | 3,115 | 320 | -10.7% | -29.0% to 13.5% | 0.95 to 1.20 | 13.7% | −£633.43 (-20.3%) | −£713.43 (-22.9%) | 1.06 | 910239, 919051 |
| R A Fahey · second run | 2026 | 69 | 53 | 24.4% | -50.6% to 116.7% | 0.78 to 2.47 | 37.3% | −£1.15 (-1.7%) | −£13.15 (-19.6%) | 1.28 | 916264, 913937 |
| G & J Moore · second run | 2026 | 51 | 44 | 34.1% | -53.1% to 139.3% | 0.46 to 2.24 | 41.0% | £3.38 (6.8%) | −£8.63 (-17.6%) | 0.90 | 919257, 940399 |

Turf no-fav returns turn negative after removal in both years. Qirat (151.0 SP) and Stoneacre Donny (34.0) were the two largest winning races in 2025. Thistle Nil supplied both in 2026, at 201.0 and 41.0. The 2026 Turf rank 7+ slice still has positive ROI after removal, with only 40 stakes left and a wide interval. The equivalent 2025 slice lost money before and after removal. The 2026 AW V1 rank 7+ slice turned negative after its largest two races. The same market bands were used in both years.

<details>
<summary>Quarterly stakes, ROI and market A/E</summary>
Quarter cells show stakes · ROI · A/E. Q4 ends at 18 November or the earlier fixed cache cutoff. Turf has no racing in some quarters.

| Group | Year | Q1 | Q2 | Q3 | Q4 |
| --- | --- | --- | --- | --- | --- |
| Chase favourites | 2025 | 563 · -8.4% · 1.00 | 423 · -14.5% · 0.99 | 215 · -11.6% · 1.03 | 303 · -7.6% · 1.05 |
| Chase favourites | 2026 | 555 · -6.8% · 1.07 | 402 · -9.1% · 1.01 | 217 · 7.0% · 1.26 | 305 · -13.2% · 1.00 |
| Chase seconds | 2025 | 527 · -9.2% · 1.02 | 404 · 8.5% · 1.20 | 211 · -15.4% · 1.00 | 286 · -1.4% · 1.10 |
| Chase seconds | 2026 | 505 · 0.8% · 1.13 | 387 · -8.8% · 1.06 | 216 · -36.5% · 0.78 | 285 · -20.8% · 0.90 |
| Hurdle favourites | 2025 | 856 · -3.6% · 1.15 | 739 · -18.7% · 0.99 | 459 · 8.4% · 1.26 | 519 · -5.8% · 1.13 |
| Hurdle favourites | 2026 | 853 · -10.5% · 1.09 | 705 · -16.1% · 1.02 | 476 · -24.4% · 0.91 | 540 · -5.3% · 1.11 |
| Hurdle seconds | 2025 | 830 · -16.0% · 0.94 | 700 · -12.2% · 1.06 | 424 · -29.2% · 0.93 | 509 · -29.9% · 0.83 |
| Hurdle seconds | 2026 | 823 · -10.3% · 1.08 | 664 · -9.4% · 1.06 | 448 · -14.5% · 1.10 | 504 · -25.4% · 0.93 |
| All Weather favourites | 2025 | 1,139 · -3.2% · 1.13 | 508 · -8.5% · 1.12 | 551 · -10.8% · 1.06 | 521 · -19.1% · 1.01 |
| All Weather favourites | 2026 | 1,176 · -10.4% · 1.06 | 481 · -13.0% · 1.06 | 592 · -10.2% · 1.08 | 438 · -17.4% · 1.04 |
| All Weather seconds | 2025 | 1,094 · -13.6% · 1.01 | 500 · -24.3% · 0.92 | 546 · -8.0% · 1.11 | 510 · -9.5% · 1.07 |
| All Weather seconds | 2026 | 1,119 · -18.0% · 0.98 | 463 · -19.7% · 0.97 | 575 · -19.6% · 0.99 | 433 · -18.0% · 1.00 |
| Turf favourites | 2025 | 51 · 24.6% · 1.49 | 2,065 · -11.3% · 1.03 | 2,429 · -13.5% · 1.02 | 536 · -18.0% · 1.03 |
| Turf favourites | 2026 | 56 · -6.8% · 1.09 | 2,134 · -11.4% · 1.06 | 2,470 · -12.6% · 1.04 | 497 · -3.5% · 1.17 |
| Turf seconds | 2025 | 50 · -14.5% · 1.00 | 2,011 · -10.6% · 1.05 | 2,361 · -15.4% · 0.99 | 487 · 1.7% · 1.26 |
| Turf seconds | 2026 | 45 · -20.8% · 1.14 | 2,050 · -8.8% · 1.07 | 2,252 · -12.8% · 1.04 | 441 · -17.8% · 1.01 |
| Saved Chase filter · Full | 2025 | 136 · 0.8% · 1.09 | 78 · 91.8% · 1.63 | 51 · -70.6% · 0.37 | 16 · -5.3% · 0.96 |
| Saved Chase filter · Full | 2026 | 164 · -25.3% · 0.99 | 106 · -11.0% · 1.01 | 51 · 3.5% · 1.29 | 24 · -21.4% · 0.74 |
| Saved Chase filter · No fav | 2025 | 99 · 4.2% · 1.15 | 54 · 127.9% · 1.93 | 37 · -73.0% · 0.18 | 10 · -23.0% · 0.73 |
| Saved Chase filter · No fav | 2026 | 109 · -30.6% · 1.05 | 72 · -23.6% · 0.87 | 35 · -9.3% · 1.25 | 14 · 1.8% · 0.99 |
| Jump handicap (both saved names) · Full | 2025 | 549 · -16.3% · 1.00 | 477 · -15.1% · 0.94 | 200 · 12.5% · 1.12 | 52 · -29.6% · 0.87 |
| Jump handicap (both saved names) · Full | 2026 | 565 · -23.6% · 0.97 | 419 · 1.0% · 0.97 | 236 · -28.9% · 0.88 | 64 · -23.4% · 1.13 |
| Jump handicap (both saved names) · No fav | 2025 | 459 · -20.1% · 0.87 | 380 · -9.9% · 1.04 | 164 · 15.5% · 1.12 | 39 · -42.3% · 0.55 |
| Jump handicap (both saved names) · No fav | 2026 | 465 · -24.2% · 1.01 | 336 · 6.3% · 0.96 | 195 · -27.2% · 0.88 | 49 · -30.6% · 1.20 |
| Turf trainer / TPR · Full | 2025 | 0 · — · — | 187 · 19.2% · 1.30 | 237 · 58.9% · 1.16 | 0 · — · — |
| Turf trainer / TPR · Full | 2026 | 0 · — · — | 190 · 66.3% · 0.67 | 223 · 9.4% · 0.90 | 0 · — · — |
| Turf trainer / TPR · No fav | 2025 | 0 · — · — | 130 · 26.6% · 1.38 | 163 · 79.4% · 1.02 | 0 · — · — |
| Turf trainer / TPR · No fav | 2026 | 0 · — · — | 137 · 116.2% · 0.92 | 148 · 27.4% · 0.91 | 0 · — · — |
| Chase V2 T1 · Full | 2025 | 522 · -14.9% · 0.96 | 395 · -2.2% · 1.06 | 201 · -16.7% · 1.00 | 63 · 21.0% · 1.34 |
| Chase V2 T1 · Full | 2026 | 509 · -9.9% · 1.00 | 377 · -14.6% · 1.03 | 203 · -8.5% · 1.16 | 65 · -33.8% · 0.80 |
| Chase V2 T1 · No fav | 2025 | 315 · -19.0% · 0.93 | 215 · 0.5% · 1.05 | 102 · -22.8% · 0.91 | 37 · 4.1% · 1.04 |
| Chase V2 T1 · No fav | 2026 | 296 · -2.3% · 1.10 | 219 · -21.2% · 1.01 | 99 · -23.4% · 1.02 | 30 · -33.3% · 0.93 |
| Chase V2 T2 · Full | 2025 | 522 · -6.1% · 1.02 | 395 · -2.3% · 1.08 | 201 · -8.0% · 0.98 | 63 · -33.9% · 0.94 |
| Chase V2 T2 · Full | 2026 | 509 · -24.4% · 0.94 | 377 · -9.3% · 0.96 | 203 · -7.4% · 1.07 | 65 · 10.4% · 1.24 |
| Chase V2 T2 · No fav | 2025 | 380 · -5.9% · 1.03 | 296 · -1.7% · 1.10 | 161 · -3.4% · 1.00 | 40 · -56.7% · 0.64 |
| Chase V2 T2 · No fav | 2026 | 374 · -29.8% · 0.86 | 303 · -7.6% · 0.97 | 157 · -23.5% · 0.72 | 49 · 15.2% · 1.34 |
| Chase V2 T3 · Full | 2025 | 520 · 9.2% · 1.14 | 391 · -14.1% · 1.11 | 200 · -16.8% · 1.02 | 60 · 33.9% · 1.31 |
| Chase V2 T3 · Full | 2026 | 506 · -3.3% · 1.11 | 374 · -28.8% · 0.92 | 201 · -31.6% · 0.90 | 64 · 17.8% · 1.11 |
| Chase V2 T3 · No fav | 2025 | 437 · 13.9% · 1.22 | 328 · -14.7% · 1.13 | 180 · -17.1% · 1.04 | 50 · 28.9% · 1.24 |
| Chase V2 T3 · No fav | 2026 | 434 · -4.2% · 1.10 | 310 · -35.3% · 0.82 | 175 · -31.8% · 0.96 | 55 · 24.5% · 1.19 |
| Chase V2 T4 · Full | 2025 | 502 · -7.7% · 1.15 | 374 · -20.8% · 0.85 | 196 · -9.8% · 0.97 | 56 · -40.5% · 0.69 |
| Chase V2 T4 · Full | 2026 | 484 · -4.4% · 1.08 | 352 · -20.4% · 0.96 | 189 · 4.2% · 1.03 | 59 · -16.5% · 1.17 |
| Chase V2 T4 · No fav | 2025 | 445 · -8.2% · 1.16 | 344 · -17.3% · 0.96 | 176 · -14.3% · 0.87 | 52 · -35.9% · 0.83 |
| Chase V2 T4 · No fav | 2026 | 421 · -9.0% · 0.94 | 313 · -21.6% · 0.93 | 169 · 6.7% · 0.99 | 52 · -13.0% · 1.27 |
| Chase V2 T5 · Full | 2025 | 449 · -35.4% · 0.74 | 332 · -21.1% · 0.84 | 177 · -15.0% · 1.09 | 50 · -37.6% · 0.88 |
| Chase V2 T5 · Full | 2026 | 418 · -25.5% · 1.07 | 309 · 6.1% · 1.12 | 165 · -36.4% · 0.67 | 42 · -1.2% · 0.71 |
| Chase V2 T5 · No fav | 2025 | 423 · -35.1% · 0.77 | 311 · -16.7% · 0.96 | 167 · -16.1% · 1.08 | 48 · -35.0% · 0.96 |
| Chase V2 T5 · No fav | 2026 | 387 · -28.9% · 1.00 | 288 · 10.0% · 1.24 | 157 · -36.6% · 0.62 | 38 · 9.2% · 0.96 |
| AW Tissue V1 T1 · Full | 2025 | 1,063 · -15.3% · 1.03 | 475 · -26.1% · 1.00 | 421 · -5.8% · 1.10 | 0 · — · — |
| AW Tissue V1 T1 · Full | 2026 | 1,088 · -15.8% · 1.06 | 445 · -8.8% · 1.06 | 469 · 7.0% · 1.07 | 0 · — · — |
| AW Tissue V1 T1 · No fav | 2025 | 675 · -21.1% · 0.93 | 323 · -38.8% · 0.76 | 268 · -10.1% · 1.11 | 0 · — · — |
| AW Tissue V1 T1 · No fav | 2026 | 665 · -22.4% · 0.99 | 283 · -0.9% · 1.19 | 292 · 16.0% · 1.00 | 0 · — · — |
| AW Tissue V2 T1 · Full | 2025 | 1,050 · -5.8% · 1.12 | 463 · -5.5% · 1.14 | 413 · -9.5% · 1.05 | 0 · — · — |
| AW Tissue V2 T1 · Full | 2026 | 1,064 · -8.4% · 1.09 | 432 · -22.4% · 1.03 | 451 · -15.9% · 1.13 | 0 · — · — |
| AW Tissue V2 T1 · No fav | 2025 | 628 · -13.0% · 1.01 | 280 · -11.9% · 1.00 | 238 · -15.8% · 0.98 | 0 · — · — |
| AW Tissue V2 T1 · No fav | 2026 | 593 · -10.6% · 1.08 | 242 · -30.1% · 0.94 | 252 · -26.4% · 1.04 | 0 · — · — |
| AW-D leader · Full | 2025 | 1,057 · -20.6% · 1.01 | 445 · -17.6% · 0.94 | 371 · 10.2% · 1.30 | 0 · — · — |
| AW-D leader · Full | 2026 | 1,080 · -9.0% · 1.08 | 413 · -9.6% · 1.15 | 418 · -19.5% · 0.98 | 0 · — · — |
| AW-D leader · No fav | 2025 | 744 · -29.5% · 0.87 | 307 · -17.6% · 0.84 | 261 · 10.2% · 1.43 | 0 · — · — |
| AW-D leader · No fav | 2026 | 703 · -7.3% · 1.13 | 294 · -9.4% · 1.23 | 306 · -19.9% · 0.96 | 0 · — · — |
| AW-A leader · Full | 2025 | 1,057 · -23.3% · 0.98 | 447 · -19.4% · 1.00 | 373 · -26.4% · 1.05 | 0 · — · — |
| AW-A leader · Full | 2026 | 1,081 · -12.8% · 1.07 | 414 · -25.2% · 0.99 | 424 · -13.6% · 1.01 | 0 · — · — |
| AW-A leader · No fav | 2025 | 775 · -29.0% · 0.87 | 329 · -23.9% · 0.90 | 276 · -37.2% · 0.96 | 0 · — · — |
| AW-A leader · No fav | 2026 | 751 · -13.0% · 1.09 | 306 · -25.4% · 1.04 | 314 · -11.9% · 1.02 | 0 · — · — |
| Turf trainer / TPR · 7+ | 2025 | 0 · — · — | 30 · 80.0% · 2.80 | 30 · -100.0% · 0.00 | 0 · — · — |
| Turf trainer / TPR · 7+ | 2026 | 0 · — · — | 22 · 868.2% · 2.50 | 20 · 340.0% · 4.59 | 0 · — · — |
| AW V1 · 7+ | 2025 | 81 · -44.4% · 0.55 | 35 · 2.9% · 1.71 | 32 · 9.4% · 1.51 | 0 · — · — |
| AW V1 · 7+ | 2026 | 68 · -5.9% · 0.94 | 31 · 71.0% · 2.19 | 36 · 252.8% · 2.09 | 0 · — · — |
| 90d Run 1 | 2025 | 2,037 · -25.1% · 1.04 | 4,559 · -27.3% · 1.02 | 1,902 · -40.8% · 0.94 | 2,567 · -30.6% · 1.04 |
| 90d Run 1 | 2026 | 2,179 · -26.4% · 1.01 | 4,789 · -28.1% · 1.01 | 1,940 · -15.3% · 1.08 | 2,415 · -30.0% · 0.95 |
| 90d Run 1 · no fav | 2025 | 1,840 · -27.6% · 0.98 | 4,109 · -29.1% · 1.00 | 1,763 · -43.8% · 0.83 | 2,266 · -35.1% · 0.95 |
| 90d Run 1 · no fav | 2026 | 1,984 · -29.1% · 0.96 | 4,353 · -29.9% · 0.97 | 1,795 · -16.5% · 1.04 | 2,133 · -32.1% · 0.90 |
| 90d Run 2 | 2025 | 1,538 · -33.9% · 0.97 | 4,138 · -27.5% · 0.94 | 1,600 · -26.5% · 0.94 | 1,382 · 3.1% · 1.00 |
| 90d Run 2 | 2026 | 1,557 · -39.5% · 0.97 | 4,356 · -23.9% · 0.99 | 1,718 · -34.5% · 0.98 | 1,276 · -28.4% · 1.07 |
| 90d Run 2 · no fav | 2025 | 1,363 · -37.4% · 0.88 | 3,629 · -29.6% · 0.89 | 1,427 · -28.1% · 0.88 | 1,200 · 6.5% · 0.99 |
| 90d Run 2 · no fav | 2026 | 1,375 · -42.1% · 0.99 | 3,801 · -25.4% · 0.98 | 1,527 · -36.9% · 0.97 | 1,076 · -33.1% · 1.03 |
| 90d Run 3 | 2025 | 1,760 · -15.8% · 1.06 | 2,931 · -18.4% · 1.02 | 1,903 · -24.9% · 0.87 | 701 · -28.4% · 1.21 |
| 90d Run 3 | 2026 | 1,938 · -23.5% · 1.05 | 3,078 · -24.9% · 1.03 | 2,058 · -15.0% · 1.04 | 649 · -10.0% · 1.04 |
| 90d Run 3 · no fav | 2025 | 1,531 · -18.6% · 1.00 | 2,527 · -19.4% · 1.01 | 1,660 · -24.0% · 0.88 | 614 · -31.7% · 1.23 |
| 90d Run 3 · no fav | 2026 | 1,652 · -27.5% · 0.97 | 2,664 · -25.9% · 1.04 | 1,797 · -13.4% · 1.10 | 560 · -8.1% · 1.08 |
| R A Fahey · second run | 2025 | 6 · 16.7% · 2.24 | 38 · -69.1% · 0.62 | 14 · -35.7% · 0.96 | 5 · 4160.0% · 8.44 |
| R A Fahey · second run | 2026 | 7 · -14.3% · 1.49 | 46 · 70.5% · 1.74 | 13 · -88.9% · 0.93 | 3 · -100.0% · 0.00 |
| G & J Moore · second run | 2025 | 20 · 64.7% · 1.98 | 20 · 10.6% · 1.52 | 15 · -25.2% · 1.33 | 10 · -16.3% · 1.50 |
| G & J Moore · second run | 2026 | 17 · -61.8% · 0.52 | 26 · 76.9% · 1.63 | 7 · 126.8% · 1.66 | 1 · -100.0% · 0.00 |
| Changed trainer · no fav | 2025 | 706 · -8.2% · 1.08 | 1,022 · -22.6% · 0.98 | 867 · -2.8% · 1.12 | 519 · -39.7% · 0.91 |
| Changed trainer · no fav | 2026 | 779 · -28.5% · 0.91 | 1,025 · 13.9% · 1.00 | 796 · -11.8% · 1.32 | 515 · -31.1% · 1.08 |

</details>

Sources of bias include model development on 2025, repeated prior analysis of 2026, outcomes used to certify historical full fields, and publication-time uncertainty for cached features and current stored prior comments. A runner can also look overpredicted simply because the model underweights favourites overall. End-of-market SP cannot establish a pre-race price or a deployable favourite veto. Multiple overlapping cuts, ranks, thresholds, trainers and families make nominal intervals descriptive. The intervals do not account for this multiplicity. The two years cannot be described as independent discovery and untouched holdout.

## I. Most useful findings

1. Keep database integrity and feature-cache coverage visible independently. Official final-SP books reconcile well. The confirmed October import-path failures, recurring Down Royal/Downpatrick gap and stale 2026 feature coverage have different causes and affect different samples.
2. Favourites provide a stronger SP baseline than pooled non-favourites. Race family and year matter, and stronger winner identification can coexist with negative returns.
3. Saved Turf exclusion is a clear example of return concentration. Jump handicap loses less in the raw matched sample after omission of favourites, with no stable same-race gain. The saved Chase decline survives the simpler market comparisons.
4. First-run All Weather and third-run Chase forecasts show some repeatable residual direction against Tissue. The residuals are sensitive to favourite status, and the broad corresponding betting groups lose at SP. Second runs were weaker than the prior hypothesis.

## J. Recommended next research direction

Use a new prospective period and the existing frozen forecast books to test a small, fixed forecasting question. Pre-register the 90-day third-run Chase definition and a first-run All Weather check with an independently set end date or race-count requirement. Compare against the full-field Tissue calibration and normalised final-SP expectation, with the second-run cohort as a comparison. Report both the winner-identification and realised-return outcomes with top-race sensitivity. Keep pre-off probabilities and favourite status as recorded at their own times so the final market benchmark cannot influence selection.

A separate, narrowly scoped data task could first authorise correction of the eight identity-matched Flat payloads and verify the unresolved course/date gaps. Recheck full-field starter counts against the linked ambiguous rides before admitting those fields. This audit applied no corrections.

### Verification

The Phase 1 audit and replay used local PostgreSQL and files only. The complete-book calculations reconciled 214,966 runner stakes, with normalised probabilities and dead-heat credits summing to one per eligible race. Disjoint rank groups reconcile to all stakes, wins and £1 P/L. The isolated candidate reader rechecked its ten pins and exact local roster evidence. The database path was read-only. The fixed replay rechecked cache manifest, feature and outcome hashes after evaluation. Existing targeted tests passed **134/134** across nine files covering v3 settlement, win settlement, rule replay, trainer cohorts, the isolated candidate and AW model features. Production code, historical inputs, settlements, models, saved rules and monitoring were untouched.

Snapshot SHA-256 `c3fd8a506ea63a575b5d7ff8fc01eeeaa38cb284b5bd86ae73de280acbab4226`. Digest of sorted local full-result filenames and file SHA-256 values `4f32a140b7fb83ae94c22d260205b39855c28e735530d6605f0713ce19a95653`. Frozen Chase V2 model `be65702490403f6a287d11ecb19307a67b58ca975ee7bd9ece71b4e0d759aa81`. Frozen AW Tissue V2 model `ba7d2ea42a87d4ce432288d57a02cee8528217fafa04efa37723446924bdab82`. Regenerated AW V2 numeric input rows `fea708306814f2b8f49c3b0bc0f9d5b8c525ed817607f6c492bb36ff78e5c419`, matching its archived row hash. The comparison is reproducible from source identities, stated cutoff and frozen replay functions. A later database snapshot could contain corrections or new retrospective evidence.

