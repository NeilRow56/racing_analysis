import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDbConnection } from "@/db";
import type { JumpTissueRace } from "@/lib/racing/jump-tissue-forward";
import type { AwTissueRace } from "@/lib/racing/aw-tissue-forward";

export const UPLIFT_BANDS = [0.025, 0.05, 0.075, 0.10] as const;
const OUTPUT = "/tmp/jump-aw-market-residual-diagnostic.md";
const BOOKMAKER_ID = 4;
type Family = "Jump" | "AW";
type TrackerRace = JumpTissueRace | AwTissueRace;
type Ride = { ride_reference: { id: number }; ride_status: string; finish_position?: number; bookmakerOdds?: Array<{ bookmakerId: number; decimalOdds: number }> };
type Archive = { sourceId: string; fetchedAt: Date; payload: { props?: { pageProps?: { race?: { rides?: Ride[]; race_summary?: { date?: string; race_stage?: string } } } } } };
export type Runner = { id: string; odds: number; market: number; tissue: number; won: boolean };
export type Race = { id: string; date: string; runners: Runner[]; capturedAt: string; predictedAt: string; overround: number };
type Method = "market" | "tissue";

export function marketBook(odds: number[]): number[] {
  if (odds.length < 2 || odds.some((o) => !Number.isFinite(o) || o <= 1)) throw new Error("Incomplete or invalid market book");
  const total = odds.reduce((sum, o) => sum + 1 / o, 0);
  return odds.map((o) => 1 / o / total);
}

// A race softmax with fixed log-market offsets preserves a coherent probability book.
export function residualBook(market: number[], adjustment: number[]): number[] {
  if (market.length < 2 || market.length !== adjustment.length || market.some((p) => !Number.isFinite(p) || p <= 0) ||
      Math.abs(market.reduce((a, b) => a + b, 0) - 1) > 1e-9 || adjustment.some((v) => !Number.isFinite(v))) throw new Error("Invalid residual inputs");
  const scores = market.map((p, i) => Math.log(p) + adjustment[i]!);
  const maximum = Math.max(...scores);
  const weights = scores.map((s) => Math.exp(s - maximum));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((v) => v / total);
}

export function timestampsSafe(capturedAt: string, predictedAt: string, scheduledOff: string, currentOff: string): boolean {
  const [capture, prediction, scheduled, current] = [capturedAt, predictedAt, scheduledOff, currentOff].map(Date.parse);
  return [capture, prediction, scheduled, current].every(Number.isFinite) && capture! <= prediction! && prediction! < Math.min(scheduled!, current!);
}

export function quality(races: Race[], method: Method) {
  for (const race of races) {
    if (race.runners.filter((r) => r.won).length !== 1 || race.runners.some((r) => !Number.isFinite(r[method]) || r[method] <= 0) ||
        Math.abs(race.runners.reduce((sum, r) => sum + r[method], 0) - 1) > 1e-9) throw new Error("Incomplete single-winner probability book");
  }
  return {
    races: races.length, runners: races.reduce((sum, r) => sum + r.runners.length, 0),
    logLoss: mean(races.map((race) => -Math.log(race.runners.find((r) => r.won)![method]))),
    brier: mean(races.map((race) => race.runners.reduce((sum, r) => sum + (r[method] - Number(r.won)) ** 2, 0))),
    top1: mean(races.map((race) => Number(top(race, method).won))),
  };
}

export function selective(races: Race[], threshold: number) {
  const qualifiers = races.flatMap((race) => race.runners.filter((r) => r.tissue - r.market >= threshold).map((r) => ({ ...r, race: race.id, date: race.date })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.race.localeCompare(b.race) || a.id.localeCompare(b.id));
  const wins = qualifiers.filter((r) => r.won).length;
  const represented = new Set(qualifiers.map((r) => r.race)).size;
  let losing = 0, maximum = 0;
  for (const runner of qualifiers) { losing = runner.won ? 0 : losing + 1; maximum = Math.max(maximum, losing); }
  return {
    qualifiers: qualifiers.length, races: represented, wins, winRate: divide(wins, qualifiers.length),
    meanOdds: mean(qualifiers.map((r) => r.odds)),
    marketAE: divide(wins, qualifiers.reduce((sum, r) => sum + r.market, 0)),
    rawOddsAE: divide(wins, qualifiers.reduce((sum, r) => sum + 1 / r.odds, 0)),
    roi: divide(qualifiers.reduce((sum, r) => sum + (r.won ? r.odds : 0) - 1, 0), qualifiers.length),
    maximumLosing: qualifiers.length ? maximum : null, noQualifier: divide(races.length - represented, races.length),
  };
}

function top(race: Race, method: Method) { return [...race.runners].sort((a, b) => b[method] - a[method] || a.id.localeCompare(b.id))[0]!; }
function mean(values: number[]): number | null { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function divide(a: number, b: number): number | null { return b ? a / b : null; }
function fmt(n: number | null, digits = 4) { return n === null ? "N/A" : n.toFixed(digits); }
function pct(n: number | null) { return n === null ? "N/A" : `${(100 * n).toFixed(2)}%`; }
function table(headers: string[], rows: Array<Array<string | number>>) {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`), ""];
}

async function fingerprints() {
  const paths: string[] = [];
  async function walk(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) paths.push(full);
    }
  }
  await walk("src");
  for (const entry of await readdir("data/research")) if (entry.endsWith(".json")) paths.push(join("data/research", entry));
  return Object.fromEntries(await Promise.all(paths.sort().map(async (path) => [path, createHash("sha256").update(await readFile(path)).digest("hex")])));
}

export async function main() {
  const before = await fingerprints();
  const trackers = new Map<Family, TrackerRace[]>();
  for (const [family, path] of [["Jump", "jump-tissue-forward-v1.json"], ["AW", "aw-tissue-forward-v1.json"]] as const) {
    const tracker = JSON.parse(await readFile(`data/research/${path}`, "utf8")) as { races: TrackerRace[] };
    trackers.set(family, tracker.races);
  }
  const { client } = createDbConnection();
  let archives: Archive[], ids: Array<{ id: string; sourceId: string }>;
  try {
    [archives, ids] = await client.begin("read only", async (sql) => {
      await sql`set local statement_timeout = 30000`;
      const cards = await sql<Archive[]>`select source_id as "sourceId", fetched_at as "fetchedAt", payload from source_imports where source = ${"sporting_life"} and source_type = ${"racecard-next-data"}`;
      const runners = await sql<Array<{ id: string; sourceId: string }>>`select id, source_id as "sourceId" from race_runners where race_id = any(${[...trackers.values()].flat().map((r) => r.raceId)}::uuid[])`;
      return [cards, runners] as const;
    });
  } finally { await client.end({ timeout: 1 }); }
  const bySource = new Map(archives.map((a) => [a.sourceId, a]));
  const sourceById = new Map(ids.map((r) => [r.id, r.sourceId]));
  const years = new Map<string, { races: number; priced: number; first: string; last: string }>();
  for (const archive of archives) {
    const card = archive.payload.props?.pageProps?.race;
    const date = card?.race_summary?.date ?? "unknown";
    const year = date.slice(0, 4);
    const row = years.get(year) ?? { races: 0, priced: 0, first: date, last: date };
    row.races++; row.first = row.first < date ? row.first : date; row.last = row.last > date ? row.last : date;
    const rides = card?.rides?.filter((r) => r.ride_status === "RUNNER") ?? [];
    if (rides.length >= 2 && rides.every((r) => (r.bookmakerOdds ?? []).some((q) => q.bookmakerId === BOOKMAKER_ID && q.decimalOdds > 1))) row.priced++;
    years.set(year, row);
  }
  const lines = ["# Jump / AW Market-Residual Diagnostic", "", "## Decision", "",
    "The hypothesis cannot yet be judged on a genuinely unseen holdout under the requested constraints. No residual candidate was fitted. Recommendation: one tightly defined follow-up diagnostic to establish an eligible chronological price/feature archive; neither abandon the hypothesis nor advance a candidate into a frozen prospective shadow test on the present evidence.", "",
    "## Price availability and holdout", "",
    "The database was queried inside a read-only transaction. Historical v4 feature schemas explicitly set odds and oddsDecimal to null. Outcome SP and odds histories from result payloads are ineligible. Stored racecards begin in September 2026; no 2025 development market books exist in this archive. The 2025 development / 2026 holdout experiment therefore has no eligible training observations. No 2026 labels were used for fitting, feature selection, imputation, scaling or tuning.", "",
    ...table(["Year", "Archived racecards (all families)", "Complete Betfair RUNNER books, before timing checks", "Race-date coverage"], [
      ["2025", years.get("2025")?.races ?? 0, years.get("2025")?.priced ?? 0, "none"],
      ...[...years].map(([year, row]) => [year, row.races, row.priced, `${row.first} to ${row.last}`]),
    ]),
    "source_imports has a unique source/type/id key and the importer overwrites payload and fetched_at on refresh. Only the currently retained snapshot is available, not a multi-snapshot history. File modification time is not accepted as capture provenance. All-family book counts above are availability counts, not a leakage-safe sample.", "",
    "## Fixed experiment specification", "",
    "Use a single coherent bookmaker: Betfair Sportsbook, bookmakerId=4. For a complete race book, q_i=(1/decimal_odds_i)/sum_j(1/decimal_odds_j). Retain the book sum as overround. Require each active runner to have exactly one valid quote from that book, the source fetched_at <= prediction timestamp, and prediction strictly before both scheduled/current off. Reject partial books, target-result contamination, withdrawals changing the frozen field, and dead heats. No SP is used in probabilities, bands, A/E or returns.", "",
    "Candidate: p_i=softmax(log(q_i)+beta*x_i). This is the multinomial market-offset equivalent of the suggested residual formulation. Zero coefficients reproduce the market exactly; a common race-level shift cancels. Independently adjusted binary logits would not sum to one. The log-market coefficient stays fixed at 1; there is no intercept or separately fitted market temperature.", "",
    "Pre-register one candidate per family with six existing numeric features: official rating, average last-three family speed, days since last run, log(1+prior family starts), trainer prior win rate, jockey prior win rate; plus a missing indicator for each. Recompute history strictly before the price/prediction cutoff, excluding results observed later. Within each race centre features; impute and scale from development only. Race class, field size and other race-constant linear features cancel in this formulation, so omit them. Defer comments and interaction searches.", "",
    "Minimise mean race categorical negative log likelihood + (0.10/2)*||beta||^2, with deterministic gradient descent, step 0.05, 2,000 updates and zero initial coefficients. Fix these before any labels are used; do not tune against holdout or ROI. Check numerical convergence on development and stop the experiment if not converged rather than choosing another candidate against holdout. These are a specification, not trained coefficients or a frozen artifact.", "",
    "Fixed cumulative absolute uplift bands: >=2.5pp, >=5pp, >=7.5pp, >=10pp versus normalised q. Permit multiple qualifiers per race; include every qualifier. Uplift is not necessarily positive executable EV after bookmaker margin. Also report raw-price EV=p*odds-1 descriptively; do not retrospectively select thresholds.", "",
    "Primary acceptance evidence: paired race log-loss and Brier improvement with race-level bootstrap uncertainty, stable calibration and disagreement performance on a single held-out evaluation. Top-1 and ROI are contextual only. No holdout-driven changes or threshold selection. Existing frozen AW shadow candidate is outside this experiment.", "",
    "## Descriptive matched market / Tissue comparison", "",
    "The tables below use already settled 2026 Tissue tracker races joined to the retained raw racecard by source ID and runner source ID. They are descriptive, previously observed outcomes, not a new unseen holdout. Market snapshot is the retained raw racecard fetched_at, which must be no later than Tissue recordedAt. Tissue probabilities are the unchanged frozen JUMP_TISSUE_V1 / AW_TISSUE_V1 predictions at recordedAt. No later market capture replaces an earlier missing book. Quotes can be stale within the pre-race interval; source fetch time is observation time, not proof of bookmaker quote freshness.", "",
  ];
  const exported: Record<string, Race[]> = {};
  for (const [family, tracker] of trackers) {
    const excluded = new Map<string, number>();
    const reject = (reason: string) => excluded.set(reason, (excluded.get(reason) ?? 0) + 1);
    const sample: Race[] = [];
    for (const race of tracker) {
      if (!race.settledAt || race.raceDate >= "2026-10-07") { reject("unsettled/current day"); continue; }
      if (!race.recordedPreRace || race.excludedReason) { reject("excluded/non-prospective Tissue"); continue; }
      const archive = bySource.get(race.sourceId ?? "");
      if (!archive) { reject("missing retained racecard"); continue; }
      const capturedAt = new Date(archive.fetchedAt).toISOString();
      if (!timestampsSafe(capturedAt, race.recordedAt, race.scheduledOffAt, race.currentOffAt)) { reject("snapshot/prediction timing ineligible"); continue; }
      const rides = archive.payload.props?.pageProps?.race?.rides ?? [];
      if (rides.some((r) => (r.finish_position ?? 0) > 0)) { reject("target-result contamination"); continue; }
      const active = rides.filter((r) => r.ride_status === "RUNNER");
      const runners = race.runners;
      if (active.length < 2 || active.length !== runners.length || new Set(active.map((r) => String(r.ride_reference.id))).size !== active.length ||
          runners.some((r) => !active.some((ride) => String(ride.ride_reference.id) === sourceById.get(r.runnerId))) ||
          runners.some((r) => r.outcome?.resultStatus === "non_runner")) { reject("field changed/incomplete join"); continue; }
      if (runners.some((r) => !r.predictionAvailable || r.probability === null || typeof r.outcome?.won !== "boolean") ||
          runners.filter((r) => r.outcome?.won).length !== 1 || runners.some((r) => (r.outcome?.deadHeatDivisor ?? 1) !== 1)) { reject("incomplete prediction/outcome or dead heat"); continue; }
      const quotes = runners.map((r) => active.find((ride) => String(ride.ride_reference.id) === sourceById.get(r.runnerId))!.bookmakerOdds?.filter((q) => q.bookmakerId === BOOKMAKER_ID) ?? []);
      if (quotes.some((q) => q.length !== 1 || !Number.isFinite(q[0]!.decimalOdds) || q[0]!.decimalOdds <= 1)) { reject("incomplete/invalid Betfair book"); continue; }
      const odds = quotes.map((q) => q[0]!.decimalOdds);
      const market = marketBook(odds);
      sample.push({ id: race.raceId, date: race.raceDate, capturedAt, predictedAt: race.recordedAt, overround: odds.reduce((sum, o) => sum + 1 / o, 0),
        runners: runners.map((r, i) => ({ id: r.runnerId, odds: odds[i]!, market: market[i]!, tissue: r.probability!, won: r.outcome!.won! })) });
    }
    exported[family] = sample;
    const runnerRows = sample.flatMap((r) => r.runners);
    const disagreement = sample.filter((r) => top(r, "market").id !== top(r, "tissue").id);
    const dates = sample.map((r) => r.date).sort();
    lines.push(`### ${family}`, "", `Tracker races audited: ${tracker.length}. Eligible settled matched races: ${sample.length}. Race-date coverage: ${dates[0] ?? "N/A"} to ${dates[dates.length - 1] ?? "N/A"}. Mean raw book sum: ${pct(mean(sample.map((r) => r.overround)))}.`, "",
      ...table(["Excluded reason (first failing check)", "Races"], [...excluded]),
      ...table(["Method", "Races", "Runners", "Race log loss", "Race Brier", "Top-1 strike"], (["market", "tissue"] as const).map((method) => {
        const m = quality(sample, method); return [method, m.races, m.runners, fmt(m.logLoss), fmt(m.brier), pct(m.top1)];
      }).concat([["Residual (unfitted)", "N/A", "N/A", "N/A", "N/A", "N/A"]])),
      "Log loss is negative log probability of the winner, averaged by race. Brier is sum of squared runner errors, averaged by race. Smaller is better; no per-runner denominator is substituted.", "",
      ...table(["Tissue movement vs market", "Value"], [
        ["Mean signed uplift (must cancel in complete books)", fmt(mean(runnerRows.map((r) => r.tissue - r.market)))],
        ["Mean absolute uplift", pct(mean(runnerRows.map((r) => Math.abs(r.tissue - r.market))))],
        ["Mean total variation per race", pct(mean(sample.map((r) => r.runners.reduce((sum, v) => sum + Math.abs(v.tissue - v.market), 0) / 2)))],
        ["Top-1 disagreement races", disagreement.length],
        ["Market Top-1 wins on disagreement", pct(quality(disagreement, "market").top1)],
        ["Tissue Top-1 wins on disagreement", pct(quality(disagreement, "tissue").top1)],
        ["Market log loss on disagreement", fmt(quality(disagreement, "market").logLoss)],
        ["Tissue log loss on disagreement", fmt(quality(disagreement, "tissue").logLoss)],
      ]),
      "Calibration uses fixed runner probability bins; empirical win rate and predicted mean are compared within each model's own bins. Sparse bins are descriptive.", "",
      ...table(["Method", "Probability band", "Runners", "Winners", "Predicted mean", "Actual win rate"], (["market", "tissue"] as const).flatMap((method) =>
        [0, 0.05, 0.1, 0.2, 0.3, 0.5].map((lower, i, bounds) => {
          const upper = bounds[i + 1] ?? 1.000001;
          const rows = runnerRows.filter((r) => r[method] >= lower && r[method] < upper);
          return [method, `${100 * lower}-${Math.min(100, 100 * upper)}%`, rows.length, rows.filter((r) => r.won).length, pct(mean(rows.map((r) => r[method]))), pct(mean(rows.map((r) => Number(r.won))))];
        }))),
      "Market odds bands use the same captured Betfair decimal odds for both models. Binary runner log loss and runner Brier here include both winners and losers and are distinct from race metrics above.", "",
      ...table(["Odds", "Runners", "Winners", "Market binary LL", "Tissue binary LL", "Market runner Brier", "Tissue runner Brier"], [1, 3, 5, 8, 12, 20].map((lower, i, bounds) => {
        const upper = bounds[i + 1] ?? Infinity;
        const rows = runnerRows.filter((r) => r.odds >= lower && r.odds < upper);
        const ll = (m: Method) => mean(rows.map((r) => -(r.won ? Math.log(r[m]) : Math.log1p(-r[m]))));
        const brier = (m: Method) => mean(rows.map((r) => (r[m] - Number(r.won)) ** 2));
        return [`${lower}-${upper === Infinity ? "inf" : `<${upper}`}`, rows.length, rows.filter((r) => r.won).length, fmt(ll("market")), fmt(ll("tissue")), fmt(brier("market")), fmt(brier("tissue"))];
      })),
      "Fixed uplift-band selection analysis below describes unchanged Tissue versus the market; it is not a residual candidate result. Market baseline qualifies nobody by construction at every positive uplift threshold (no-qualifier races=100%). Residual qualifiers/returns remain N/A, not zero.", "",
      ...table(["Tissue uplift", "Qualifiers", "Races", "Win rate", "Average odds", "A/E normalised market", "A/E raw implied", "ROI", "Max losing", "No-qualifier races"], UPLIFT_BANDS.map((band) => {
        const m = selective(sample, band); return [`>=${100 * band}pp`, m.qualifiers, m.races, pct(m.winRate), fmt(m.meanOdds, 2), fmt(m.marketAE), fmt(m.rawOddsAE), pct(m.roi), m.maximumLosing ?? "N/A", pct(m.noQualifier)];
      })),
      "A/E normalised market = wins/sum(q); A/E raw implied = wins/sum(1/odds). ROI uses one unit per qualifier at the captured book odds, no SP, BOG, commission or retrospective best-price shopping. Late-withdrawal races are excluded; other deductions/availability cannot be verified, so these are indicative gross returns. Maximum losing sequence is date/race-ID/runner-ID ordered, including multiple selections within a race; simultaneous-runner ordering is arbitrary.", "",
    );
    console.log(`${family}: matched ${sample.length} races / ${runnerRows.length} runners; market LL ${fmt(quality(sample, "market").logLoss)}, Tissue LL ${fmt(quality(sample, "tissue").logLoss)}; residual NOT FITTED (no 2025 price books).`);
  }
  lines.push("## Interpretation and follow-up", "",
    "Does modelling deviations from the bookmaker market appear materially more promising than asking TPR/Tissue to rank the winner independently? Not established empirically. A market offset is a coherent and conservative hypothesis, but comparison of market and Tissue alone cannot show that non-market features improve the market. No residual holdout scores, calibration, odds-band results or profitable thresholds are available. The recent matched comparison is small, selected for archive completeness, and already observed; it cannot establish general performance or resolve the residual research question.", "",
    "Choose option 3: one tightly defined follow-up diagnostic. Obtain an immutable timestamped historical full-field bookmaker archive for 2025 development and an untouched evaluation period, joined to prediction-cutoff-safe versions of the six fixed racing features. Audit complete-field coverage, capture times, price type, outcome chronology, feature observation times and withdrawals before fitting. If no historical archive exists, specify new future development/evaluation windows in a separate research protocol; do not silently train on the existing 2026 holdout or call previously reviewed outcomes genuinely unseen. Fit the single pre-registered candidate once only after this gate passes. No prospective candidate deployment is justified yet.", "",
    "## Integrity", "",
  );
  const after = await fingerprints();
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  if (!unchanged) throw new Error("Production source/model/tracker fingerprints changed during analysis");
  lines.push(`SHA-256 verified unchanged for ${Object.keys(before).length} files: all src files and top-level data/research JSON artifacts, including frozen models, AW shadow artifacts and trackers. Read-only database transaction; no imports, price capture, settlement, tracker sync, refit or production edits performed. New files are confined to diagnostic scripts/tests; report and matched evidence are in /tmp.`, "");
  lines.push("## Reproduction", "", "From the repository root:", "", "```sh", "bun --env-file=.env.local -e 'import {main} from \"./scripts/diagnose-market-residual\"; await main();'", "bun test scripts/diagnose-market-residual.test.ts src/lib/racing/aw-tissue-shadow-guard.test.ts src/lib/racing/jump-tissue-forward.test.ts src/lib/racing/aw-tissue-forward.test.ts", "bun run typecheck", "bun run lint scripts/diagnose-market-residual.ts scripts/diagnose-market-residual.test.ts", "git diff --check", "```", "", "Matched race/runner evidence, observed timestamps, odds, probabilities, outcomes and protected-file fingerprints are saved in /tmp/jump-aw-market-residual-evidence.json. Production files are hashed before/after the audit; this is an integrity check during execution, not an assertion that the pre-existing worktree was clean.", "");
  await writeFile(OUTPUT, `${lines.join("\n")}\n`);
  await writeFile("/tmp/jump-aw-market-residual-evidence.json", JSON.stringify({ archiveCounts: Object.fromEntries(years), matched: exported, fingerprints: before }, null, 2));
  console.log(`Report: ${OUTPUT}`);
}

if (process.argv[1]?.endsWith("diagnose-market-residual.ts")) await main();
