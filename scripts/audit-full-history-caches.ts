import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { classifyJumpRaceSubtype } from "../src/lib/racing/jump-speed-rating";
import { historyFamily, jsonLines, type DbRace } from "./build-full-history-profitability";

type CacheRow = Parameters<typeof classifyJumpRaceSubtype>[0] & {
  raceDate: string; raceCode: string; targetRaceId: string; targetRunnerId: string; latestRunDate: string | null;
  bestAwSpeedLast3?: number | null; bestTurfSpeedLast3?: number | null; bestJumpSpeedLast3?: number | null;
  latestPerformanceRating?: number | null;
};

const sourcePath = process.argv[2];
const through = process.argv[3] ?? "2026-11-20";
const cacheAudit = [];
for (const year of [2025, 2026]) {
  const dir = `data/research/backtest-cache/backtest_features_v4-sporting_life-all-${year}-01-01-${year}-12-31`;
  const manifest = JSON.parse(await readFile(dir + "/manifest.json", "utf8")) as { rowCount: number; generatedAt: string };
  const families = new Map<string, { first: string; last: string; races: Set<string>; runners: number; speed: number; performance: number; history: number }>();
  const hash = createHash("sha256");
  let rows = 0;
  for await (const f of jsonLines<CacheRow>(dir + "/features.ndjson", hash)) {
    rows++;
    const family = f.raceCode === "jump" ? classifyJumpRaceSubtype(f).toUpperCase() : f.raceCode.toUpperCase();
    const item = families.get(family) ?? { first: f.raceDate, last: f.raceDate, races: new Set<string>(), runners: 0, speed: 0, performance: 0, history: 0 };
    families.set(family, item);
    item.first = f.raceDate < item.first ? f.raceDate : item.first;
    item.last = f.raceDate > item.last ? f.raceDate : item.last;
    item.races.add(f.targetRaceId);
    item.runners++;
    if (f.latestRunDate === null || f.latestRunDate >= f.raceDate) continue;
    item.history++;
    item.speed += Number(Number.isFinite(f.raceCode === "jump" ? f.bestJumpSpeedLast3 : f.raceCode === "aw" ? f.bestAwSpeedLast3 : f.bestTurfSpeedLast3));
    item.performance += Number(Number.isFinite(f.latestPerformanceRating));
  }
  const scopes = Object.fromEntries([...families].map(([f, item]) => [f, { ...item, races: item.races.size }]));
  cacheAudit.push({ year, manifest, rows, sha256: hash.digest("hex"), scopes });
}

type IndexRace = { date: string; name: string; race_type: string | null; race_stage: string; country_short_name?: string;
  race_summary_reference: { id: number }; hidden?: boolean; course_name: string; course_surface?: { surface: string } };
type Index = { props?: { pageProps?: { hasError?: boolean; meetings?: {
  meeting_summary: { abandoned?: boolean; course: { country?: { long_name?: string } } }; races: IndexRace[];
}[] } } };

const calendar = [];
if (sourcePath) {
  const sourceIds = new Set<string>();
  for await (const r of jsonLines<Pick<DbRace, "source">>(sourcePath)) sourceIds.add(r.source);
  const root = "data/raw/sporting-life";
  const files = (await readdir(root)).filter(p => /^202[456]-\d\d-\d\d-results-index-.*\.json$/.test(p) && p.slice(0, 10) <= through).sort();
  const countries = new Set(["ENG", "SCO", "WAL", "IRE", "England", "Scotland", "Wales", "Ireland", "Eire", "Northern Ireland", "Nort"]);
  const terminal = new Set(["WEIGHEDIN", "OFFICIAL", "COMPLETED"]);
  for (const year of [2024, 2025, 2026]) {
    const inputs = files.filter(p => p.startsWith(String(year)));
    const days = new Set(inputs.map(p => p.slice(0, 10)));
    const missingDates: string[] = [], unreadable: string[] = [];
    const final = new Set<string>(), absent = new Map<string, { date: string; course: string; family: string }>();
    const end = Date.parse(year === 2026 ? through : `${year}-12-31`);
    const hash = createHash("sha256");
    for (let time = Date.UTC(year, 0, 1); time <= end; time += 86400000) {
      const date = new Date(time).toISOString().slice(0, 10);
      if (!days.has(date)) missingDates.push(date);
    }
    for (const filename of inputs) {
      const bytes = await readFile(root + "/" + filename);
      hash.update(filename).update(createHash("sha256").update(bytes).digest("hex"));
      const index = (JSON.parse(bytes.toString()) as Index).props?.pageProps;
      if (!index?.meetings || index.hasError) { unreadable.push(filename); continue; }
      for (const meeting of index.meetings) {
        const country = meeting.meeting_summary.course.country?.long_name;
        if (meeting.meeting_summary.abandoned) continue;
        for (const r of meeting.races) {
          if ((!countries.has(country ?? "") && !countries.has(r.country_short_name ?? "")) || r.hidden ||
              !terminal.has(r.race_stage) || !r.race_summary_reference) continue;
          const id = String(r.race_summary_reference.id);
          final.add(id);
          if (!sourceIds.has(id)) absent.set(id, { date: r.date, course: r.course_name,
            family: historyFamily({ name: r.name, type: r.race_type, code: null, surface: r.course_surface?.surface ?? null, course: r.course_name }) });
        }
      }
    }
    calendar.push({ year, indexedDates: days.size, unreadable, missingDates, final: final.size, absent: Object.fromEntries(absent),
      indexDigest: hash.digest("hex") });
  }
}
console.log(JSON.stringify({ cacheAudit, calendar }));
