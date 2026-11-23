# Racing 2026 data integrity impact assessment and correction plan
19 November 2026 · Local evidence through 18 November · Read-only assessment

## 1. Confirmed problems

**The bounded repair covers eight Flat races from 9 October and 105 existing ride records.** The complete weighed-in payloads match the original file hashes, stored import JSON, race IDs, ride IDs and horse IDs. There are **91 missing starter outcomes**, 14 correctly marked non-runners with missing result metadata, eight winners, zero non-finishers and zero dead heats. All 91 prices already match final SP. The correction can preserve every price.

The eight races were absent from the market and trainer analyses. The AW and Turf historical model replays ended in September, before the affected races. Some later Jump targets have all-code participant dependencies on those Flat results. Several older AW and Turf ledgers captured the affected races and still show their results as pending. Eleven Jump races from the same 9 October acquisition were repaired on 11 November. The unresolved Jump cards, other nonterminal results, course-specific missing coverage and stale caches require separate treatment. [Original audit](racing-2025-2026-data-market-trainer-audit.md)

## 2. Exact races, runner identities and missing fields

| Race ID | Course / family | Race UUID | Ride rows | Starters | NR | Winning ride / final SP | Final off / winning time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 942523 | Newmarket / Turf | 8ad88673-b325-4b66-960c-4c4b10d6ead9 | 15 | 11 | 4 | 256246901 / 9/2 | 16:21:55 / 1m 25.94s |
| 942524 | Kempton / AW | 7bd81380-4aa7-4c99-829f-b94ab03709ab | 12 | 10 | 2 | 256620019 / 7/4 | 15:38:17 / 1m 12.80s |
| 942525 | Kempton / AW | a5289c78-2650-417b-b319-1a0f594a80fa | 14 | 13 | 1 | 256620039 / 33/1 | 16:15:31 / 1m 38.85s |
| 942526 | Kempton / AW | 119c9f4c-3860-47ac-9c48-24a6498d193f | 8 | 7 | 1 | 256620042 / 66/1 | 16:47:50 / 1m 40.46s |
| 942755 | Dundalk / AW | 619ffd46-cbb7-499d-9881-5fc81b18ff25 | 16 | 14 | 2 | 256619511 / 8/1 | 16:27:18 / 1m 27.16s |
| 942756 | Dundalk / AW | c6346305-bea1-42ac-9546-78cdc35df980 | 15 | 14 | 1 | 256619532 / 28/1 | 17:01:15 / 1m 26.16s |
| 943052 | Dundalk / AW | f0cd9455-ad1e-4524-a3e3-98da92ca48b8 | 17 | 14 | 3 | 256619504 / 50/1 | 15:50:51 / 1m 27.27s |
| 943054 | Kempton / AW | b92a8027-c7e9-4764-b81d-399cd589044a | 8 | 8 | 0 | 256620007 / 30/100 | 15:05:53 / 1m 12.42s |

All eight races have null off time, winning time and actual runner count. The full-result import supplies the stage and final surface to readers. The provider starter total is independently reconciled to the final ride roster, excluding NRs. Use that total for these eight rows, consistent with the November missing-only recovery.

| Runner field | Values to fill | Evidence |
| --- | --- | --- |
| finishing_position | 91 | Final structured position for the starter. |
| result_status | 91 | All confirmed starters finished. Preserve the 14 recorded NR statuses. |
| finishing_status and outcome_code | 105 each | Existing importer code from source position or explicit NR. |
| runner_comment | 90 | Use the result ride description. Keep source absences null. |
| beaten_distance and beaten_distance_to_winner | 83 each | Existing finish-distance mapping. Keep source absences null. |
| starting_price and starting_price_decimal | 0 | All 91 starters match the exact fractional SP and stored three-decimal value. |

<details>
<summary>Pinned payloads and the 105 exact runner identities</summary>

#### 942523 · Newmarket
Racecard import a33a185f-135f-466f-92de-2d32273599a5. Fetched 2026-10-09T18:23:50.779758+01:00. SHA-256 4892ec27a70a71cdae3b266dabe6332ea611dd294da950f0da45d4f201d808e8. [Retained payload](../data/raw/sporting-life/2026-10-09-newmarket-942523-racecard-next-data.json)

| Ride ID | Database runner UUID | Horse provider ID | Canonical state | Final position | Final SP |
| --- | --- | --- | --- | --- | --- |
| 256246899 | f7665479-047f-4a40-bc63-8958d05580a0 | 1199644 | loss | 9 | 28/1 |
| 256246912 | 75da6087-a253-48b6-aaa9-fb8e474848ba | 1191213 | NR | — | 33/1 |
| 256246923 | 686d78fc-120b-464d-b94e-1d309df0d5a5 | 1119149 | NR | — | 14/1 |
| 256246918 | 0e978ff0-ee52-4251-8701-4922599b4b8f | 1143526 | NR | — | 14/1 |
| 256246908 | 1030adc7-c079-4eb7-af98-c90f63d9f692 | 1196167 | loss | 2 | 11/2 |
| 256246903 | a71718e7-6be1-46cd-b2bc-2acf381ae0bc | 1104385 | loss | 10 | 14/1 |
| 256246910 | a6f46704-98d1-4fba-9d5b-f6318b948804 | 1182043 | loss | 3 | 5/1 |
| 256246920 | bc838a75-2598-4883-a0ee-23e26b35678b | 1177630 | loss | 5 | 10/1 |
| 256246901 | 5cd080b9-f181-4def-9e8f-4e7bdbfbd8ed | 1197515 | win | 1 | 9/2 |
| 256246906 | c31b9360-a222-449e-9000-57b83bcda1bc | 1062880 | loss | 8 | 17/2 |
| 256246915 | e8356c3b-9140-4556-98db-c8d40eca6aa9 | 1198361 | loss | 4 | 5/2 |
| 256246914 | a3990db1-3e4f-4f63-bc83-3bb9d89e3e21 | 1100464 | NR | — | 10/1 |
| 256246911 | abad7c5e-04e7-41af-9de6-3124b65993cd | 1084213 | loss | 6 | 12/1 |
| 256246898 | ce2291e5-980e-4e6f-b5aa-34cff106dbfa | 1224167 | loss | 11 | 25/1 |
| 256246897 | 0e76841a-daab-4f9c-9f0b-11218e9b614f | 1180867 | loss | 7 | 18/1 |

#### 942524 · Kempton
Racecard import 3177947c-6b6a-4881-bfd5-51bf81b1f335. Fetched 2026-10-09T18:24:10.507207+01:00. SHA-256 9e14d88fe121c6b35ec9b63b842311e9a64ca69283964f5f2c270c1f94349fc5. [Retained payload](../data/raw/sporting-life/2026-10-09-kempton-942524-racecard-next-data.json)

| Ride ID | Database runner UUID | Horse provider ID | Canonical state | Final position | Final SP |
| --- | --- | --- | --- | --- | --- |
| 256620015 | 756af0d4-954a-450f-a49a-13f666cda3c5 | 1212809 | loss | 6 | 20/1 |
| 256620016 | df5cfb11-f87f-4264-b286-0dbd1932c2f7 | 1222886 | loss | 3 | 13/2 |
| 256620017 | 00f41a01-590d-495d-b3d7-8a8306a16c8c | 1224746 | loss | 5 | 10/1 |
| 256620018 | dc488e75-d5f3-4f0b-9d0f-6676bf0c87ef | 1227716 | loss | 7 | 4/1 |
| 256620019 | 552bf19f-d987-4ac8-9f39-476628d32b3c | 1228540 | win | 1 | 7/4 |
| 256620020 | 7a5fe649-f840-4f36-ac9f-e11bdba4ca7c | 1216452 | NR | — | 33/1 |
| 256620021 | 64f26012-e037-49f9-8d25-dc1a4a755c88 | 1216460 | loss | 2 | 10/3 |
| 256620022 | 9841b900-6984-4727-be86-45806310df99 | 1230251 | NR | — | 7/2 |
| 256620023 | 31d22899-5d9d-47e9-8d47-f48503b1dc18 | 1228349 | loss | 8 | 18/1 |
| 256620024 | f0057579-3cb7-4c8e-99e5-be21caa2cb25 | 1221101 | loss | 10 | 80/1 |
| 256620025 | 2e160830-0f1a-44d8-b5fc-ce94b6dade3d | 1219071 | loss | 4 | 18/1 |
| 256620026 | 6b32ea0b-762b-45b4-ba33-3b91cc5e2b1a | 1227095 | loss | 9 | 40/1 |

#### 942525 · Kempton
Racecard import 6e56045e-0d50-4f07-8538-94931d020510. Fetched 2026-10-09T18:24:13.597934+01:00. SHA-256 b4a63ab2489a2968dabb419b9510b2daeb8b417f824ee459e0f063680ad4986d. [Retained payload](../data/raw/sporting-life/2026-10-09-kempton-942525-racecard-next-data.json)

| Ride ID | Database runner UUID | Horse provider ID | Canonical state | Final position | Final SP |
| --- | --- | --- | --- | --- | --- |
| 256620027 | 59e3fda6-ac4d-49f3-81d1-d56b59c04065 | 1197832 | loss | 2 | 4/1 |
| 256620028 | 0b7e53ee-17cd-47d4-9244-d418f5c20892 | 1200393 | loss | 3 | 3/1 |
| 256620029 | 4ad5d467-e9d0-4137-b6f7-06c4d0e4577c | 1195295 | NR | — | 12/1 |
| 256620030 | ebef3390-ee3d-4fa5-b08a-6241b5e9b441 | 1187391 | loss | 10 | 12/1 |
| 256620031 | bd451ea2-e6a8-430a-8ccb-bd3a91e1ee47 | 1222205 | loss | 9 | 12/1 |
| 256620032 | 9f5e6869-c14a-4adc-820b-572acb5f99be | 1209632 | loss | 8 | 40/1 |
| 256620033 | 3b88a704-8aea-481f-a645-d4b0c7b1f2e0 | 1203751 | loss | 11 | 10/1 |
| 256620034 | 092278e2-1c7c-41dc-992b-8e563d9420f2 | 1181912 | loss | 5 | 25/1 |
| 256620035 | e41c7c46-777f-47d7-8679-f127d925e5a6 | 1183433 | loss | 13 | 4/1 |
| 256620036 | 9066793d-556b-4797-8dc1-ace1afa4eb51 | 1192891 | loss | 7 | 14/1 |
| 256620037 | e787fb7c-7593-4e42-9ef6-f62430385b98 | 1226727 | loss | 12 | 125/1 |
| 256620038 | f9eaf5dd-d5a2-4ac5-9084-3206d16c981a | 1183704 | loss | 6 | 11/2 |
| 256620039 | cb4ae787-7f9a-44e0-b177-ebc4e4a40198 | 1195427 | win | 1 | 33/1 |
| 256620040 | 05a0f48b-92b3-42e1-b9cc-7d935cf49876 | 1195949 | loss | 4 | 14/1 |

#### 942526 · Kempton
Racecard import b1a37bdf-3812-4b41-8657-d79250ace97b. Fetched 2026-10-09T18:24:15.792829+01:00. SHA-256 4945f72aba8c55ec5fb0401c00278ad58ba8ac92d1ad0ede3eb4dda663a24310. [Retained payload](../data/raw/sporting-life/2026-10-09-kempton-942526-racecard-next-data.json)

| Ride ID | Database runner UUID | Horse provider ID | Canonical state | Final position | Final SP |
| --- | --- | --- | --- | --- | --- |
| 256620041 | 3e30e338-f346-40c9-80d3-18eda7ce8052 | 1239549 | loss | 3 | 11/8 |
| 256620042 | bf00525b-f8f5-4676-aa5a-6d31f592185c | 1237514 | win | 1 | 66/1 |
| 256620043 | 33ea21b1-f602-4a3f-b240-b4e77bf6918a | 1241381 | loss | 6 | 125/1 |
| 256620044 | 1e225711-d9a0-46d9-8568-ebf3e254f863 | 1235631 | loss | 2 | 40/1 |
| 256620045 | e945001a-0826-4b20-b5af-bcdd53633fb0 | 1234103 | loss | 7 | 10/3 |
| 256620046 | f183581f-2c3d-45c2-93ad-401e2c9c8c2a | 1235500 | NR | — | 16/1 |
| 256620047 | f7954fa9-d3ad-4f3c-b48f-b05b6b765b11 | 1239295 | loss | 5 | 6/1 |
| 256620048 | e5f3f15c-9728-4db0-8924-574e317e2d3f | 1231599 | loss | 4 | 5/2 |

#### 942755 · Dundalk
Racecard import 7b98fa15-7106-450e-b106-f6c43a5fbce1. Fetched 2026-10-09T18:24:49.670227+01:00. SHA-256 abd33bfe2251698e82f3208bb61943d78ada4924343a41df805cebb2a00dc71b. [Retained payload](../data/raw/sporting-life/2026-10-09-dundalk-942755-racecard-next-data.json)

| Ride ID | Database runner UUID | Horse provider ID | Canonical state | Final position | Final SP |
| --- | --- | --- | --- | --- | --- |
| 256619511 | 1b2205ed-0d8e-410d-bf00-72ac7128c332 | 1228379 | win | 1 | 8/1 |
| 256619512 | 618e7460-ffa2-447f-ac5c-8b1eb669ee71 | 1236122 | loss | 7 | 9/2 |
| 256619513 | c906c471-cdcc-4ba1-b8c9-54a1ce0dd678 | 1241497 | loss | 3 | 9/1 |
| 256619514 | 9a4cf94b-df50-49ec-9d92-62092b8a822c | 1216419 | loss | 14 | 100/1 |
| 256619515 | 1c23535a-8f63-4216-a3f3-b9f3c7f7f1f3 | 1233927 | loss | 8 | 10/1 |
| 256619516 | b97fabb8-5757-4403-9e53-478d623fe1a6 | 1241499 | loss | 9 | 33/1 |
| 256619517 | 87da49bd-291c-4475-9c63-b58bf1e48675 | 1231262 | loss | 5 | 4/1 |
| 256619518 | 9f78204d-d14a-4002-af13-5ae0d7862a94 | 1241501 | loss | 10 | 28/1 |
| 256619519 | c0185799-3f72-487b-9f14-cf071d1cd46e | 1241502 | loss | 13 | 66/1 |
| 256619520 | 0b8cfe44-4032-4386-a018-615789c9c476 | 1232814 | loss | 11 | 6/1 |
| 256619521 | 358fd685-3bf2-4a01-ae34-a344118f2a21 | 1225263 | loss | 6 | 14/1 |
| 256619522 | 3fc125f5-92df-48c0-8cb4-d6ef2273ffd6 | 1239532 | loss | 12 | 33/1 |
| 256619523 | f64b3a0b-bc6e-46e3-b939-2f79291f3331 | 1222975 | loss | 2 | 9/1 |
| 256619524 | 6efff8e7-2661-4ca3-be86-cfbc8e8d8b5f | 1241500 | loss | 4 | 9/2 |
| 256619525 | 1d89129e-f65f-4e52-a1aa-5db495d22197 | 1238721 | NR | — | 66/1 |
| 256619526 | 4573330a-8be8-4cb2-89a5-84ebb4149361 | 1239531 | NR | — | 16/1 |

#### 942756 · Dundalk
Racecard import 27fa7a34-c36b-4167-8616-c0ee35d9360c. Fetched 2026-10-09T18:24:52.165381+01:00. SHA-256 aa417295564a8c54dde696daf16ad6b6e4e4388fdb7c68061cf2e0270dfd09e7. [Retained payload](../data/raw/sporting-life/2026-10-09-dundalk-942756-racecard-next-data.json)

| Ride ID | Database runner UUID | Horse provider ID | Canonical state | Final position | Final SP |
| --- | --- | --- | --- | --- | --- |
| 256619527 | e5968c69-3f4f-43cd-98de-cbea4a5c7fce | 1034498 | loss | 11 | 3/1 |
| 256619528 | 55448606-94cc-4482-8d17-229fb2c373a5 | 990718 | loss | 3 | 4/1 |
| 256619529 | 0f1c1fe9-efb1-4bfa-a37d-f0100fb506bc | 1195746 | loss | 5 | 16/1 |
| 256619530 | 28b5b778-ec17-449c-b1e4-62c25c33888d | 1186365 | loss | 8 | 10/1 |
| 256619531 | cf135a8f-c494-4eac-a8f9-1d5d0b47ef00 | 1189327 | loss | 7 | 10/3 |
| 256619532 | 894c987d-dfc1-446b-bf32-200f9878a097 | 1149504 | win | 1 | 28/1 |
| 256619533 | 7530268b-7d8b-40de-b282-d867f0c924bc | 1146779 | loss | 14 | 80/1 |
| 256619534 | 8018c26e-1d84-42b0-be89-cf343aa51095 | 1119803 | loss | 2 | 11/2 |
| 256619535 | 6989278c-b621-47d9-9a2c-ab1bf56f87af | 1191495 | loss | 12 | 33/1 |
| 256619536 | e4234858-cd1a-442f-b3e7-44b2be225cbe | 1158942 | loss | 13 | 28/1 |
| 256619537 | c5519195-2593-4e13-8b1d-beaca513c960 | 1195745 | loss | 4 | 14/1 |
| 256619538 | b8f02569-5547-4eb5-b883-5fc13233fb23 | 1153977 | NR | — | 100/1 |
| 256619539 | 9a21b1bf-b23e-45dd-8c13-fa3bafa2b65a | 1180330 | loss | 9 | 7/1 |
| 256619540 | 88581ba9-d260-43f4-9875-edc4191a1db1 | 1189459 | loss | 10 | 33/1 |
| 256619541 | abce54ed-70b8-4479-8f94-3749a5e42434 | 1018916 | loss | 6 | 66/1 |

#### 943052 · Dundalk
Racecard import 667a41ad-11fb-4b91-9545-b669a7e08e33. Fetched 2026-10-09T18:24:47.346201+01:00. SHA-256 6e57e69cd3cd6c94771211c9fbb3428706972c88cd6aca262599f51c548d7017. [Retained payload](../data/raw/sporting-life/2026-10-09-dundalk-943052-racecard-next-data.json)

| Ride ID | Database runner UUID | Horse provider ID | Canonical state | Final position | Final SP |
| --- | --- | --- | --- | --- | --- |
| 256619494 | b65cdcf4-dedb-47c8-9a68-271fdea73814 | 1229634 | loss | 7 | 10/1 |
| 256619495 | 872dd26a-180f-4ec0-b371-1dfd50b52082 | 1228584 | loss | 5 | 25/1 |
| 256619496 | c59e37a2-1379-4d41-b54a-4bbc014d4601 | 1227075 | loss | 12 | 14/1 |
| 256619497 | 2cfb491d-f25a-4ca4-bfe7-3046e8dc8548 | 1232829 | loss | 6 | 11/1 |
| 256619498 | 32cc8794-8f11-4a58-ad89-a2ed100325ce | 1219713 | NR | — | 11/4 |
| 256619499 | cd705187-d420-4c34-84c8-f58e5411c6f1 | 1241494 | loss | 3 | 5/4 |
| 256619500 | 535520ad-3429-47bb-b95c-fa8d2f8209de | 1237638 | loss | 14 | 250/1 |
| 256619501 | 6f652d22-cbfa-4ae3-9eef-681793e658d6 | 1241496 | loss | 8 | 11/1 |
| 256619502 | 82743a95-a562-4e2b-8133-31b41e558ee1 | 1240139 | loss | 10 | 20/1 |
| 256619503 | b8504e8d-1b5d-4675-ad9d-01e95dfa7851 | 1236353 | loss | 13 | 100/1 |
| 256619504 | cc89b7a6-0d94-47f7-8496-ecc81224c659 | 1240142 | win | 1 | 50/1 |
| 256619505 | d51b50e3-5438-49f4-a77b-8fb22af64def | 1241493 | loss | 9 | 100/1 |
| 256619506 | e778b704-8aa5-4d2b-b40a-119c65cf2dab | 1235354 | loss | 4 | 12/1 |
| 256619507 | ad2ff867-5358-4f69-8bf3-74a0a8f846bd | 1222979 | loss | 2 | 3/1 |
| 256619508 | a786b11b-11fc-4c9e-aa87-8ef34c792725 | 1234767 | loss | 11 | 10/1 |
| 256619509 | f0cc14ba-3c01-46ec-8490-f9089d5db06d | 1235375 | NR | — | 20/1 |
| 256619510 | 0a08d04c-2f44-4b20-af2e-37c9499a3cb0 | 1236099 | NR | — | 16/1 |

#### 943054 · Kempton
Racecard import 8c8cf6f6-60ff-4768-bf4f-4b6f6c9eaff6. Fetched 2026-10-09T18:24:08.348094+01:00. SHA-256 5a885740299af65d35db336fa36461b7b71714edc436059880fcffadfc88f8ec. [Retained payload](../data/raw/sporting-life/2026-10-09-kempton-943054-racecard-next-data.json)

| Ride ID | Database runner UUID | Horse provider ID | Canonical state | Final position | Final SP |
| --- | --- | --- | --- | --- | --- |
| 256620007 | 8ec455b8-b568-4587-b2ec-7c46ba9e154a | 1224738 | win | 1 | 30/100 |
| 256620008 | e54a23f4-7d40-46ee-a0e7-6ec4e962f293 | 1236346 | loss | 8 | 33/1 |
| 256620009 | 3bea0bab-eca9-417d-aead-d783ae568094 | 1224739 | loss | 7 | 16/1 |
| 256620010 | 4001582a-886e-4232-8209-7099aa07bbad | 1228437 | loss | 6 | 40/1 |
| 256620011 | f2fa4e77-469c-4015-88f7-527dd769419d | 1241380 | loss | 3 | 11/1 |
| 256620012 | ae50b60d-9b79-4a65-8010-48820fb0fb3d | 1230978 | loss | 5 | 9/1 |
| 256620013 | c744badc-2411-4f5c-9f29-d1fee671e036 | 1239708 | loss | 2 | 11/2 |
| 256620014 | 62fe60a3-040a-4acc-baba-973b699ff630 | 1226078 | loss | 4 | 50/1 |

</details>

## 3. Cause and full observed date scope

The eight terminal payloads were fetched through the racecard route from 18:23 to 18:24 BST. That route validates race ID and date and calls the racecard upsert. The separate forced pre-race refresh guard rejects already-off fields, but the ordinary racecard import can retain a weighed-in result without promoting it. The racecard upsert leaves finish, outcome and timing fields unset and maps explicit NRs. Full-result ingestion is separate. Neither the database nor the raw tree has a daily results index for **9 or 15 October 2026**. The November logs inspected do not establish whether the October full-result job was skipped or interrupted before index persistence. [Racecard route](../scraper/scripts/import_sporting_life_racecards.py) · [Importer mappings](../scraper/sporting_life/importing.py) · [Daily results route](../scraper/scripts/import_sporting_life_day.py)

A separate repeatable risk is that the day import can store nonterminal result payloads. Its optional skip-existing check tests source-row presence, including provisional rows. The normal after-racing workflow invokes the daily importer without that flag. The daily importer commits the index and each race separately, so a retained index confirms discovery but leaves open partial failure. Indexes exist on 25 and 26 October. The specific cause of those gaps is unverified. [Workflow steps](../scripts/run-research-workflow.ts)

| Retained records through cutoff | 2025 | 2026 |
| --- | --- | --- |
| Racecard files / imports | 0 / 0 | 2,660 / 2,660 |
| Full-result files / imports | 12,866 / 12,866 | 11,360 / 11,371 |
| Weighed-in racecards also carrying terminal full results | 0 | 169 |
| Weighed-in racecards missing full-result import | 0 | 8 |
| Other card-only race records | 0 | 76 |
| Nonterminal full-result imports | 12 | 38 |
| Missing daily results indexes | 0 | 2 · 9 and 15 October |

All 2,660 retained 2026 racecard files match their filename race IDs and dates. Every inspected result file has a matching import. The database has 11 extra full-result records backed by the already recovered 9 October Jump racecards. The 2025 sources contain no racecard imports for a direct comparison of this mechanism, and 12 of their full-result imports remain dormant. The wider terminal-stage problem predates 2026. [11-race repair receipt](../data/research/jump-2026-local-recovery-2026-11-11/report.md) · [Recovered pins](../data/research/jump-2026-local-recovery-2026-11-11/source-provenance.csv)

### October Jump and other provisional fields

| Date/status | Races / database ride rows | Provider race IDs |
| --- | --- | --- |
| 2026-10-09 · already repaired | 11 / 111 | 942539, 942540, 942542, 942544, 942545, 942762, 942764, 942765, 942767, 942768, 943053 |
| 2026-10-15 · dormant card | 14 / 98 | 943566, 943567, 943568, 943569, 943570, 943571, 943572, 943573, 943574, 943575, 943576, 943577, 943578, 944162 |
| 2026-10-25 · dormant card | 7 / 72 | 945188, 945189, 945190, 945191, 945192, 945193, 945194 |
| 2026-10-26 · dormant card | 6 / 72 | 945545, 945546, 945547, 945548, 945549, 945550 |

On 15 October, 13 of the 14 Jump races have partial horse-history evidence, and Perth 943578 has retained pre-race evidence only. The same date also has 21 Flat card-only races. The card-only groups on 25 and 26 October and the nonterminal imports need corroboration of occurrence, starter identities, official outcomes and final SP before any settlement. The 76 card-only and 38 nonterminal full-result imports are distinct candidates, with 1,440 possible non-NR rows in the exposure screen. That count includes declarations. [Existing Jump evidence and ride IDs](../data/research/jump-2026-blocker-diagnostic-2026-11-11-VX8rfC/report.md)

<details>
<summary>All 2026 card-only and nonterminal full-result dates and provider IDs</summary>

| Date | Card only / provisional full | Stored runner rows | Card-only race IDs | Full-result race IDs and recorded stage |
| --- | --- | --- | --- | --- |
| 2026-09-12 | 1 / 0 | 0 | 933615 | — |
| 2026-09-13 | 1 / 0 | 26 | 938116 | — |
| 2026-09-17 | 0 / 1 | 18 | — | 938589 (DORMANT) |
| 2026-09-18 | 1 / 0 | 30 | 938990 | — |
| 2026-09-26 | 1 / 0 | 28 | 940379 | — |
| 2026-09-27 | 0 / 1 | 6 | — | 940406 (RESULT) |
| 2026-09-29 | 4 / 0 | 58 | 940977, 940978, 940979, 940980 | — |
| 2026-09-30 | 0 / 7 | 133 | — | 940937 (DORMANT), 940938 (DORMANT), 940939 (DORMANT), 940940 (DORMANT), 940941 (DORMANT), 940942 (DORMANT), 940943 (DORMANT) |
| 2026-10-08 | 0 / 1 | 25 | — | 942387 (DORMANT) |
| 2026-10-09 | 10 / 0 | 115 | 942527 (RESULT), 942528, 942529, 942530, 942531, 942757 (GOINGDOWN), 942758, 942759, 942760, 942761 | — |
| 2026-10-12 | 0 / 14 | 150 | — | 942990 (RESULT), 942991 (DORMANT), 942992 (DORMANT), 942993 (DORMANT), 942994 (DORMANT), 942995 (DORMANT), 942996 (DORMANT), 942998 (PARADING), 942999 (DORMANT), 943000 (DORMANT), 943001 (DORMANT), 943002 (DORMANT), 943003 (DORMANT), 943004 (DORMANT) |
| 2026-10-15 | 35 / 0 | 391 | 943367, 943368, 943369, 943370, 943371, 943372, 943566, 943567, 943568, 943569, 943570, 943571, 943572, 943573, 943574, 943575, 943576, 943577, 943578, 943580, 943581, 943582, 943583, 943584, 943585, 943586, 943587, 943588, 943589, 943590, 943591, 943592, 943593, 944162, 944164 | — |
| 2026-10-18 | 0 / 1 | 25 | — | 942946 (DORMANT) |
| 2026-10-22 | 0 / 1 | 15 | — | 944784 (DORMANT) |
| 2026-10-23 | 0 / 1 | 14 | — | 945140 (DORMANT) |
| 2026-10-25 | 7 / 0 | 72 | 945188, 945189, 945190, 945191, 945192, 945193, 945194 | — |
| 2026-10-26 | 7 / 2 | 130 | 945545, 945546, 945547, 945548, 945549, 945550, 945551 | 945380 (DORMANT), 945395 (DORMANT) |
| 2026-10-27 | 8 / 0 | 104 | 945543, 946207, 946208, 946209, 946210, 946211, 946212, 946213 | — |
| 2026-10-31 | 0 / 6 | 56 | — | 946356 (DORMANT), 946357 (DORMANT), 946358 (DORMANT), 946359 (DORMANT), 946360 (DORMANT), 946361 (DORMANT) |
| 2026-11-01 | 1 / 0 | 34 | 943418 | — |
| 2026-11-04 | 0 / 1 | 13 | — | 946937 (DORMANT) |
| 2026-11-05 | 0 / 2 | 28 | — | 947089 (DORMANT), 947090 (DORMANT) |

</details>

### Repeated Down Royal and Downpatrick coverage gap

The final indexes list **171 races absent from the database on 24 dates in 2025** and **130 on 18 dates in 2026**. All are at Down Royal or Downpatrick. The 2026 dates run from 20 January to 4 September. The 130 include 26 Chase, 58 Hurdle, 37 Turf and nine other listings. The absence is confirmed by provider race ID. An index entry does not provide enough information to infer selections or settlement. A fresh read-only database lookup confirmed zero matches for all 301 listed IDs. The repeated course-specific cause remains unverified. The empty Doncaster card 933615, the Worcester starter-count conflict 933814 and the Uttoxeter void 929549 stay outside the repair.

<details>
<summary>Both years’ index-listed race IDs and 2025 provisional import IDs</summary>

#### 2025 · final index listed, database race absent

| Racing date | Course | Provider IDs |
| --- | --- | --- |
| 2025-01-21 | Down Royal | 839975, 839976, 839977, 839978, 839979, 839980, 839981 |
| 2025-03-17 | Down Royal | 848401, 848402, 848403, 848404, 848405, 848406, 848407 |
| 2025-03-30 | Downpatrick | 850382, 850383, 850384, 850385, 850386, 850387, 850388 |
| 2025-04-13 | Down Royal | 853077, 853078, 853079, 853080, 853081, 853082, 853083 |
| 2025-05-05 | Down Royal | 856579, 856064, 856065, 856066, 856067, 856068, 856069, 856070 |
| 2025-05-09 | Downpatrick | 856836, 856837, 856838, 856839, 856840, 856841, 856842 |
| 2025-05-23 | Downpatrick | 859086, 859087, 859088, 859089, 859090, 859091, 859092 |
| 2025-05-30 | Down Royal | 860378, 860379, 860380, 860381, 860382, 860383, 860384 |
| 2025-06-15 | Downpatrick | 863035, 863036, 863037, 863038, 863039, 863040, 863041 |
| 2025-06-20 | Down Royal | 864379, 864022, 864023, 864024, 864025, 864026, 864027, 864028 |
| 2025-06-21 | Down Royal | 864233, 864234, 864235, 864236, 863277, 864237, 864238 |
| 2025-07-14 | Downpatrick | 868147, 868148, 868149, 868150, 868151, 868152, 868153 |
| 2025-07-15 | Downpatrick | 868301, 868302, 868303, 868304, 868305, 868306, 868307 |
| 2025-07-18 | Down Royal | 868982, 869295, 868984, 868985, 868986, 868987, 868988 |
| 2025-08-10 | Downpatrick | 872915, 872916, 872917, 872918, 872919, 872920, 872921 |
| 2025-08-25 | Downpatrick | 875563, 875564, 875565, 875566, 875567, 875568, 875569 |
| 2025-08-29 | Down Royal | 876393, 876394, 876395, 876396, 876397, 876398, 876399 |
| 2025-09-05 | Down Royal | 877621, 877622, 877623, 877624, 877625, 877626, 877627 |
| 2025-09-19 | Downpatrick | 880074, 880075, 880076, 880077, 880078, 880079, 880080 |
| 2025-09-29 | Down Royal | 881709, 881710, 881711, 881712, 881713, 881714, 881715 |
| 2025-10-10 | Downpatrick | 883767, 883768, 883769, 883770, 883771, 883772, 883773 |
| 2025-10-31 | Down Royal | 887358, 887359, 887360, 887361, 887362, 887363, 887364 |
| 2025-11-01 | Down Royal | 887909, 887564, 887565, 887566, 887567, 884591, 887568, 887569 |
| 2025-12-26 | Down Royal | 895115, 895116, 895117, 895118, 895119, 895120, 895121 |

#### 2026 · final index listed, database race absent

| Racing date | Course | Provider IDs |
| --- | --- | --- |
| 2026-01-20 | Down Royal | 899234, 899235, 899236, 899237, 899238, 899239, 899240 |
| 2026-03-17 | Down Royal | 908291, 907864, 907865, 907866, 907867, 907868, 907869, 907870 |
| 2026-03-29 | Downpatrick | 909685, 909686, 909687, 909688, 909689, 909690, 909691 |
| 2026-04-12 | Down Royal | 911875, 911876, 911877, 911878, 911879, 911880, 911881 |
| 2026-05-04 | Down Royal | 915399, 915400, 915401, 915402, 915403, 915404, 915405 |
| 2026-05-08 | Downpatrick | 916217, 916218, 916219, 916220, 916221, 916222, 916223 |
| 2026-05-22 | Downpatrick | 918500, 918501, 918502, 918503, 918504, 918505, 918506 |
| 2026-05-29 | Down Royal | 919793, 919794, 919795, 919796, 919797, 919798, 919799, 919800 |
| 2026-06-13 | Downpatrick | 922743, 922357, 922358, 922359, 922360, 922361, 922362, 922363 |
| 2026-06-14 | Downpatrick | 922364, 922365, 922366, 922367, 922368, 922369, 922370 |
| 2026-06-19 | Down Royal | 923509, 923510, 923511, 923512, 923513, 923514, 923515 |
| 2026-06-20 | Down Royal | 923650, 923651, 923652, 923653, 922746, 923654, 923655 |
| 2026-07-14 | Downpatrick | 927858, 927859, 927860, 927861, 927862, 927863, 927864 |
| 2026-07-17 | Down Royal | 928512, 928513, 928514, 928515, 928516, 928517, 928518 |
| 2026-08-09 | Downpatrick | 932275, 932276, 932277, 932278, 932279, 932280, 932281 |
| 2026-08-28 | Down Royal | 935615, 935616, 935617, 935618, 935619, 935620, 935621 |
| 2026-08-31 | Downpatrick | 936001, 936002, 936003, 936004, 936005, 936006, 936007 |
| 2026-09-04 | Down Royal | 937218, 936887, 936888, 936889, 936890, 936891, 936892, 936893 |

| 2025 date | Dormant full-result provider IDs |
| --- | --- |
| 2025-01-25 | 840553 |
| 2025-01-26 | 840546, 840554 |
| 2025-02-12 | 843237 |
| 2025-03-14 | 847921, 847928, 847934 |
| 2025-03-20 | 848826 |
| 2025-04-02 | 850766 |
| 2025-04-09 | 851841 |
| 2025-04-16 | 852867 |
| 2025-06-05 | 861151 |

</details>

## 4. Research impact

Tables show races / existing selections or runner records as labelled. A prior link means the same horse, trainer or jockey ID at a strictly earlier scheduled race. The field screen includes original selections whose rivals have a link. Links can affect features, but a changed prediction, threshold or stake is unverified. The provisional screen is an upper bound based on declarations. Missing-index races lack runner records, so affected selections cannot be counted for them.

### Fixed historical rules and Tissue ranks

| Original 2026 analysis | Selected races / selections | Settled races / stakes | Earlier Flat link · own | Earlier Flat link · field | Earlier provisional link · own | Decision for this repair |
| --- | --- | --- | --- | --- | --- | --- |
| Saved Chase filter | 290 / 345 | 290 / 345 | 1 / 1 | 2 / 2 | 4 / 4 | Replay fixed trainer/jockey thresholds on newly corrected inputs. |
| Saved Jump handicap (one canonical rule) | 853 / 1,387 | 806 / 1,284 | 4 / 4 | 9 / 12 | 23 / 25 | Replay fixed trainer threshold. Preserve both archived versions. |
| Saved Turf trainer/TPR | 413 / 413 | 413 / 413 | 0 / 0 | 0 / 0 | 2 / 2 | September replay stands for this batch. Run a separate extended evaluation. |
| Chase T3 · through 14 October | 1,145 / 1,145 | 1,145 / 1,145 | 1 / 1 | 5 / 5 | 21 / 21 | Archived ranks reproduce. Rescore only in a separately labelled reconstruction. |
| AW Tissue V1 T1 | 2,002 / 2,002 | 2,002 / 2,002 | 0 / 0 | 0 / 0 | 14 / 14 | September replay stands. Evaluate extended coverage separately. |
| AW-A leader | 1,919 / 1,919 | 1,919 / 1,919 | 0 / 0 | 0 / 0 | 15 / 15 | Extend separately using the original rating rule. |
| AW-D leader | 1,911 / 1,911 | 1,911 / 1,911 | 0 / 0 | 0 / 0 | 12 / 12 | Extend separately with the existing rating coverage gate. |
| AW Tissue V2 T1 | 1,947 / 1,947 | 1,947 / 1,947 | 0 / 0 | 0 / 0 | 15 / 15 | September replay stands. Exact original model input hash was reproduced in the audit. |
| Chase T3 · full promotion reference | 1,211 / 1,211 | 1,211 / 1,211 | 5 / 5 | 20 / 20 | 74 / 74 | Archived ranks reproduce. One T3 selection also has a same-horse link. |

The eight Flat races were absent from every fixed historical selection set above. The saved Chase and Jump handicap use the 14 October isolated guard-v2 candidate. The reconstructed results include the 11 already repaired Jump fields. Four selections in two of those fields entered Jump handicap. The pinned Chase T3 overlap covers 1,154 fields and 8,637 ranked starters. The promotion reference covers 1,220 fields and 9,083 ranked starters. Those archived ranks and their settled results stay fixed. A new ranking or model input claim requires verified original vectors or a separately labelled reconstruction. [Saved filters](research-filter-cross-year-2026-11-18.md) · [Chase T3 overlap](chase-tissue-all-ranks-earlier-2026.md) · [Chase promotion](tissue-generation-2026-11.md)

### Discovery and Hurdle studies

| 2026 discovery family | Original proved races / starters | Earlier Flat horse link | Earlier Flat horse/trainer/jockey link | Earlier provisional link | Final-index races absent in window |
| --- | --- | --- | --- | --- | --- |
| AW | 1,990 / 17,796 | 0 / 0 | 0 / 0 | 48 / 105 | 0 |
| HURDLE | 2,031 / 19,780 | 0 / 0 | 20 / 34 | 139 / 320 | 58 |
| CHASE | 1,157 / 8,666 | 0 / 0 | 6 / 9 | 57 / 106 | 26 |
| TURF | 4,048 / 37,511 | 0 / 0 | 0 / 0 | 69 / 210 | 37 |

The standalone discovery fits omit trainer/jockey rates. No same-horse link to the eight Flat races appears in the proved Jump replay through 14 October, and the Jump Speed timing standards use Jump fields. The 349 settled picks of the Chase Speed/layoff finalist have no identified dependency on this repair. Participant-rated exploratory rules can be exposed on the Jump rows listed above. Their exact newly eligible picks depend on the fixed thresholds. Following a broader coverage change, reproduce the archived run first and rerun the published rule definitions and model parameters as a separate sensitivity. [Retrospective discovery report](retrospective-market-beating-models-2026.md)

The original historical Hurdle V2/V3 challenger comparison used 1,169 races in 2025 and 844 in 2026. The original 2026 roster export was unavailable. The full Hurdle envelope before 5 November has 86 / 147 complete fields and starter rows linked after the omitted Flat races. The exact affected challenger subset is unknown. V3 horse inputs are Hurdle-only. Its all-code trainer and jockey inputs can change while the V2 mixed-code horse history may also change. Join the exact historical cohort before replaying the exposed frozen scorers. Captured Hurdle shadow evidence stays on its original inputs. [Hurdle historical comparison](tissue-development-audit-2026-11-12.md) · [V3 feature contract](hurdle-v3-challenger.md)

### Market favourite benchmarks and trainer sequences

| Family | 2026 complete books / starters | Eight-race addition, books / starters | Incremental rank selections A–G¹ | Later same-horse races / starters |
| --- | --- | --- | --- | --- |
| Chase | 1,372 / 10,098 | 0 / 0 | 0 / 0 / 0 / 0 / 0 / 0 / 0 | 0 / 0 |
| Hurdle | 2,397 / 23,207 | 0 / 0 | 0 / 0 / 0 / 0 / 0 / 0 / 0 | 2 / 2 |
| All Weather | 2,508 / 23,103 | 7 / 80 | 7 / 9 / 6 / 15 / 23 / 35 / 73 | 36 / 50 |
| Turf | 4,719 / 44,486 | 1 / 11 | 1 / 1 / 1 / 2 / 3 / 5 / 10 | 10 / 10 |

¹ A–G are favourite, second, third, ranks 2–3, ranks 4–6, ranks 7+, and all non-favourites. Counts use the existing final-SP tie policy. They describe eligibility. Recalculate only the affected market family aggregates for this repair. The existing books have no prior-history dependency.

Trainer analysis used 10,996 / 100,894 complete 2026 races and starters. The eight restored books introduce 91 label opportunities. Another 48 / 62 already analysed races and starters have a same-horse link. The first qualifying later observed start per horse accounts for 43 / 50. Later starts may enter a different break sequence or class, distance, season or trainer-pair group with the same result and final SP. Recompute original sequences using strictly earlier starts and the existing unresolved barrier. The 534 / 1,168 race/runner links to unresolved evidence remain possible only. [Trainer definitions and baseline](racing-2025-2026-data-market-trainer-audit.md)

### Older frozen forward cohorts and November Tissue reports

| Frozen cohort | Original races/books | Direct affected races / captured runner or leader rows | Other unproved race IDs |
| --- | --- | --- | --- |
| AW Tissue V1 | 200 | 7 / 90 | 33 |
| AW parity shadow | 127 | 7 / 90 | 33 |
| AW-D/A Rating | 486 | 7 / 90 | 40 |
| Turf Tissue V2 | 453 | 1 / 14 | 26 |
| AW Tissue V2 | 190 | 0 / 0 | 7 |
| Legacy Forward Value | 1,830 | 6 / 6 | 102 |
| Jump Tissue V1 | 573 | 0 / 0 | 30 |
| Older paired Hurdle challenger | 249 | 0 / 0 | 15 |
| Hurdle Jump V1 VALUE | 287 | 0 / 0 | 6 |
| November development | 305 | 0 / 0 | 0 |
| November generation | 345 | 0 / 0 | 1 |

The seven AW V1 archives retain seven T1 picks. The parity books retain one V1 and one candidate leader per field. The AW Rating book has seven AW-A rank-one runners and six tied or outright AW-D rank-one runners across five gate-eligible fields. The legacy Forward Value archive has six pending leader records in distinct affected fields. The Turf V2 book retains its original rank 1. The affected races still show pending settlement in those older archives. Runners captured pre-off may later be NRs. A separately authorised, read-only evaluation could join the original runner IDs to corrected final SP and report coverage. Leave captured ranks, pre-off prices, feature vectors, outcomes and original monetary summaries byte-identical.

The 305 development books contain 2,766 runners. The eight omitted races do not enter them or the 345 November generation captures. The frozen November ranks and prospective Chase T3 and Hurdle analyses remain tied to their captured inputs. An input dependency is a limitation of historical completeness, not a reason to rerank an existing prospective book or refit a frozen model. [Frozen Tissue rank evidence](tissue-generation-ranks-3-5-2026-11-18.md) · [Prospective Chase T3](chase-value-results-2026-11-18.md)

### Timing guard and stale cache coverage

| 2026 feature source | Last actual target | Races / feature rows | Later complete books / starters currently in DB | Impact |
| --- | --- | --- | --- | --- |
| Default AW v4 | 2026-09-21 | 2,008 / 19,065 | 494 / 5,083 | Coverage ends in September. The affected Flat races fall outside the direct period. |
| Default Turf v4 | 2026-09-19 | 4,059 / 40,902 | 662 / 6,900 | Coverage ends in September. Use the verified source surface for the Newmarket target. |
| Default mixed-family v4 | 2026-09-16 | 9,072 / 89,442 | — | September coverage and legacy Jump timing semantics need a separate rebuilt artifact. |
| Default Jump v4 | 2026-10-15 | 3,368 / 33,004 | — | Guard v1. Contains the 14 unresolved 15 October fields and the 11 subsequently repaired 9 October Jump fields in the target roster. The old file is preserved evidence. |
| Isolated guard-v2 Jump | 2026-10-14 | 3,353 / 32,901 | Chase 214 / 1,431 · Hurdle 366 / 3,427 | 3,351 fields passed pinned roster proof. The 14 October cutoff excludes the 15 October target gap. |

The date encoded in a cache request or filename is an upper bound. Actual target dates determine what the report can cover. The later complete-field counts above describe missing coverage. They do not show how many new model selections would qualify. The old and isolated Jump files differ in at least one audited rating field on 333 common runner rows across 254 races. Of these, 328 row changes followed the guard, standards or meeting-context path and five followed the earlier 11-race recovery. The 333 are measured changes from that older rebuild, separate from the impact of the eight Flat records. The existing guard-v2 replay already includes those changes. [Pinned older-versus-isolated comparison](../data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/report.md)

<details>
<summary>All 2026 feature artifacts inspected</summary>

| Existing artifact | Actual end | Races / feature rows | Direct unproved races / rows | Earlier Flat participant or horse link |
| --- | --- | --- | --- | --- |
| backtest_features_v2-sporting_life-all_weather_flat-2026-01-01-2026-12-31 | 2026-09-10 | 1,939 / 18,350 | 0 / 0 | 0 / 0 |
| backtest_features_v2-sporting_life-jump-2026-01-01-2026-12-31 | 2026-09-11 | 2,998 / 29,499 | 0 / 0 | 0 / 0 |
| backtest_features_v2-sporting_life-turf_flat-2026-01-01-2026-12-31 | 2026-09-11 | 3,850 / 38,452 | 0 / 0 | 0 / 0 |
| backtest_features_v3-sporting_life-all_weather_flat-2026-01-01-2026-12-31 | 2026-09-10 | 1,939 / 18,350 | 0 / 0 | 0 / 0 |
| backtest_features_v3-sporting_life-jump-2026-01-01-2026-12-31 | 2026-09-11 | 2,998 / 29,499 | 0 / 0 | 0 / 0 |
| backtest_features_v3-sporting_life-turf_flat-2026-01-01-2026-12-31 | 2026-09-12 | 3,854 / 38,485 | 0 / 0 | 0 / 0 |
| backtest_features_v4-sporting_life-all_weather_flat-2026-01-01-2026-12-31 | 2026-09-21 | 2,008 / 19,065 | 0 / 0 | 0 / 0 |
| backtest_features_v4-sporting_life-all-2026-01-01-2026-12-31 | 2026-09-16 | 9,072 / 89,442 | 1 / 26 | 0 / 0 |
| backtest_features_v4-sporting_life-jump-2026-01-01-2026-12-31 | 2026-10-15 | 3,368 / 33,004 | 14 / 98 | 33 / 53 |
| backtest_features_v4-sporting_life-turf_flat-2026-01-01-2026-12-31 | 2026-09-19 | 4,059 / 40,902 | 1 / 18 | 0 / 0 |
| backtest_features_v4-sporting_life-turf-flat-2026-01-01-2026-12-31-turf_speed_v1 | 2026-09-15 | 3,947 / 39,604 | 0 / 0 | 0 / 0 |
| isolated-jump | 2026-10-14 | 3,353 / 32,901 | 0 / 0 | 32 / 52 |

</details>

## 5. Proposed correction and cache treatment

1. **Authorise an eight-ID, results-only operation.** Use the pinned payloads in section 2. Before acting, require one exact DB race per provider ID/date, the unchanged original racecard import and SHA-256, 105 exact race/ride/horse identity matches, and the planned missing values. Assert eight terminal stages and independent agreement on 91 starters, 14 NRs, eight winners and the final prices. Abort the batch for a new conflicting source, changed roster or any unexpected populated value. Treat the provisional and index-only races as separate evidence requests.
2. **Add exactly eight full-result provenance rows and fill the missing result values.** Use the existing canonical source identity and record type full-result-next-data. Copy the exact stored payload with the original acquisition timestamp and record the correction separately. Keep the old racecard import and raw files. Update off time, winning time and proved starter count on the eight race UUIDs. Update only section 2 fields that are null and have a source value, plus ordinary update metadata only on changed rows. Stamp a detailed before/after receipt. Preserve final SP, original favourite markers, declared counts, IDs, trainer, jockey, official ratings, weight and racecard input fields. Use the existing mapping functions for status and distances. The general full importer also overwrites pre-race and entity data, so the supported pattern for this one-off operation is the previous missing-only recovery.
3. **Make a repeat a genuine no-op.** The source import key is source/type/provider race ID. Race and runner matching uses provider IDs and the existing database race/horse constraint. If a full-result import exists, verify its JSON and expected row values. Identical data is a no-op with no timestamp churn. Differences halt the batch. Guard writes on the before-image and lock the target rows through verification. Use one explicit transaction. Repeating the operation on the restored test database must create zero source rows and update zero affected rows.
4. **Build and compare in a new historical output path after verification.** The existing historical settlement reader can annotate race stage and matching outcome code. It cannot add feature rows, refresh cached positions or repair prior history. Record which old manifests are unsuitable for corrected replay. Keep their bytes and the pinned Jump candidate intact. For existing AW and Turf caches ending before 9 October, replay can still reproduce the covered historical window. Any window extending beyond that date needs fresh features and outcomes. Build 2026 AW and Turf partitions through a stated cutoff. Reconstruct the applicable mixed-family and guard-v2 Jump partitions for any report using post-9 October horse or all-code participant history. Use a fresh process or versioned context key for dependent timing and report memoization.
5. **Recalculate downstream dependencies, then rerun only affected studies.** Confirmed Flat race timings can alter same-course/distance/surface standards and same-day peer adjustments for eligible later rated runs. Horse features, course and distance form, prior comments, AW material/window history, wins and days since run can then move for later targets. Trainer and jockey counts are cross-code and cumulative in the reviewed historical loader. Check later 2026 and subsequent windows. Recompute prior-calendar-year trainer cohorts for 2027 where membership may change. Hold 2025, pre-event 2026 rows and the old definitions as controls. A new report should show matched old/new IDs, input deltas and original versus extended coverage separately.

For the eight-race repair, rerun the 2026 AW/Turf market benchmarks and the trainer cohort labels. Replay the saved Chase and Jump handicap with the same window and definitions to measure participant-input effects. Run an extended AW/Turf historical evaluation only if explicitly labelled with its wider dates. Re-evaluate participant-rated discovery or historical Hurdle scorers once their exact populations and affected inputs can be reproduced. Reproduce Chase T3 first from its stored ranks. An alternate feature replay needs auditable scoring inputs. Preserve archived reports, frozen models and prospective records. [Historical reader and its limits](../src/lib/racing/historical-settlement-evidence.ts) · [Cache compatibility checks](../src/lib/racing/backtest-cache.ts) · [Previous narrow repair](../data/research/jump-2026-local-recovery-2026-11-11/report.md)

## 6. Backup, rollback and validation

These checks apply to a future authorised repair. No backup job, restore, write rehearsal, cache build or correction ran during this diagnostic.

| Stage | Acceptance test |
| --- | --- |
| Backup | Create and verify a fresh PostgreSQL custom-format dump. Check archive SHA-256, pg_restore list and restoration to a disposable database. Save the exact eight race rows, 105 runner rows, related provenance, source payload hashes, constraints and relevant cache manifests. Hash and copy the frozen model, prospective and saved-rule evidence. Use a coordinated snapshot and existing operational lock under separate authorisation. |
| Rehearsal and rollback | Run the bounded transaction against the disposable copy. Force a deliberate mid-batch failure and verify exact baseline restoration. Run once successfully, repeat to prove zero updates, then exercise the rollback receipt. Live rollback, if later required, should restore only the before-images and remove only the eight source rows proven to have been created by this batch. Stop if a later writer or adjudication changed a target. Keep the full dump as recovery fallback. |
| Identity and unchanged records | Assert source/date/race/ride/horse uniqueness, exact counts and no orphan results. Hash all unrelated records and protected columns of the target rows before and after. Review only the intended allowlisted column changes and eight new provenance rows. |
| Final SP and settlement | Verify the raw fractional string and rounded decimal for every starter. Verify book sums, tie-aware ranks, eight winner credits and 14 NR refunds through the canonical adapter. Fixture tests must also cover a started non-finisher losing, unproved statuses withheld, a void refunded, and a dead-heat stake divided correctly, although the eight actual fields have zero DNF or dead heats. |
| Corrected caches | Hash old artifacts. In a new path reconcile manifest actual dates, source and guard versions, settlement and feature row IDs. Check that later ratings use each prior’s as-of cutoff, that existing unaffected rows agree, and that AW/Turf/Jump context changes have an attributable earlier input. Read both old and new outputs through their intended historical entry points. |
| Research reproduction | Reproduce original counts and frozen selections first. On corrected inputs compare exact race/runner and selection changes, final SP, settlement, £1 P/L, market A/E and winner concentration with the original definitions. Report any newly included population separately. Recheck frozen model, saved-rule and prospective-ledger hashes. A missing historical book stays missing in the prospective archive. |

The existing backup workflow verifies a dump and copies protected tracker and model bytes. Its database dump and ledger byte copies occur at separate times, so arrange a coordinated snapshot for an actual change. [Backup and isolated restore procedure](backup-restore.md)

## 7. Remaining uncertainty and completed checks

The 91 Flat outcomes and original prices are fully supported locally. For the 114 additional stored nonterminal candidates, actual starters and final SP remain unproven. The two missing daily indexes limit date-wide completeness. The 2025 and 2026 course-level gaps are known by provider ID without final fields. The cause of the missed historical results invocation and the exact dependency counts inside the unavailable original Hurdle roster remain unresolved. Same-ID exposure screens do not establish that historical profit, reported ranks or rule membership would have changed.

Verification completed with read-only PostgreSQL snapshots, exact full JSON equality for the eight retained files, the original SHA-256 pins, canonical roster and price checks, the ten isolated Jump source pins, and joins across 12 historical caches and 19 retained datasets. **62 Bun tests and 50 mocked Sporting Life importer tests passed.** Only this report was added to the worktree.

Read-only import projection SHA-256 4371de46c900950a01800cfb6441aa83554018b3919555a043280e372516e30b. Eight stored source JSON records SHA-256 9e9e6a9e7f8be02691e6a277c3b2cee593446fbad939a9af411288d1aa6e982e.
