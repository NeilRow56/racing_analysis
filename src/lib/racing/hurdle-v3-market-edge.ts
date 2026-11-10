import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { mutateFrozenJson } from "./frozen-json-store";
import { loadHurdleV3Challenger, type HurdleV3ChallengerModel } from "./hurdle-v3-challenger-model";
import { HURDLE_V3_FROZEN_HASH, loadHurdleV3Shadow, type HurdleV3ShadowObservation } from "./hurdle-v3-shadow";
import { hurdleShadowCaptureHash } from "./hurdle-low-form";
import { classifyHurdleForm, FORM_COHORTS } from "./hurdle-low-form-method";
import { CONTRIBUTION_GROUPS, EDGE_BANDS, exactHurdleEdgeMarket, hurdleEdgeBand, hurdleEdgeContributions, hurdleMarketRankBand, hurdleSpeedDepth, MARKET_EDGE_RULES, MARKET_EDGE_VERSION, MARKET_RANK_BANDS, SPEED_DEPTHS } from "./hurdle-v3-market-edge-method";
import { getLocalRacingDate } from "./todays-racing";

export const MARKET_EDGE_PATH = "data/research/hurdle-v3-market-edge-prospective-v1.json";
const finite = z.number().finite(), time = z.iso.datetime(), hash = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().min(1), rank = z.number().int().positive();
const contribution = z.object({ name: id, contribution: finite }).strict();
const runnerSchema = z.object({ runnerId: id, horseName: id, v3Probability: finite.positive().max(1), v3Rank: rank, v3Logit: finite, v2Rank: rank,
  price: finite.gt(1).nullable(), marketProbability: finite.positive().max(1).nullable(), marketRank: rank.nullable(), marketRankBand: z.enum(MARKET_RANK_BANDS).nullable(),
  edgePP: finite.nullable(), edgeBand: z.enum(EDGE_BANDS).nullable(), speedCount: z.number().int().min(0).max(3), speedDepth: z.enum(SPEED_DEPTHS),
  speedEvidence: z.enum(["LOW SPEED EVIDENCE", "ESTABLISHED SPEED EVIDENCE"]), groups: z.array(contribution), topPositiveGroups: z.array(contribution).max(3), topPositiveFeatures: z.array(contribution).max(3) }).strict();
const observationSchema = z.object({ raceId: id, raceDate: z.iso.date(), course: id, capturedAt: time, frozenAt: time, scheduledOff: time, featureCutoffAt: time,
  shadowHash: hash, completeMarket: z.boolean(), marketCapturedAt: time, marketSource: id, form: z.enum(FORM_COHORTS),
  marketFavourite: id.nullable(), marketSecondFavourite: id.nullable(), v3T1: id, v3T2: id, v2T1: id, v2T2: id, runners: z.array(runnerSchema).min(2) }).strict();
const schema = z.object({ version: z.literal(MARKET_EDGE_VERSION), armedAt: time, epoch: time.nullable(), v3Hash: z.literal(HURDLE_V3_FROZEN_HASH),
  rules: z.object({ edgeCutoffsPP: z.tuple([z.literal(0), z.literal(5), z.literal(10)]), speedWindowStarts: z.literal(3), lowSpeedMaximum: z.literal(1), marketRankUpperBounds: z.tuple([z.literal(2), z.literal(5), z.literal(8)]),
    market: z.literal(MARKET_EDGE_RULES.market), speed: z.literal(MARKET_EDGE_RULES.speed), calibration: z.literal(MARKET_EDGE_RULES.calibration), settlement: z.literal(MARKET_EDGE_RULES.settlement) }).strict(),
  sourceHashes: z.record(z.string(), hash), observations: z.array(observationSchema) }).strict();
export type HurdleMarketEdgeData = z.infer<typeof schema>;
export type HurdleMarketEdgeObservation = z.infer<typeof observationSchema>;
export async function hurdleMarketEdgeSourceHashes() {
  const paths = ["src/lib/racing/hurdle-v3-market-edge-method.ts", "src/lib/racing/hurdle-v3-market-edge.ts", "src/lib/racing/hurdle-v3-market-edge-metrics.ts",
    "src/lib/racing/hurdle-v3-challenger-features.ts", "src/lib/racing/hurdle-v3-challenger-model.ts", "src/lib/racing/hurdle-low-form-method.ts",
    "src/lib/racing/hurdle-low-form.ts", "src/lib/racing/hurdle-v3-shadow-metrics.ts", "src/lib/racing/tissue-value-metrics.ts"];
  return Object.fromEntries(await Promise.all(paths.map(async p => [p, createHash("sha256").update(await readFile(p)).digest("hex")])));
}
export function buildHurdleMarketEdge(o: HurdleV3ShadowObservation, model: HurdleV3ChallengerModel, now = new Date()): HurdleMarketEdgeObservation {
  if (model.checksum !== HURDLE_V3_FROZEN_HASH) throw new Error("Frozen V3 model changed");
  const market = exactHurdleEdgeMarket(o), b = o.production;
  const pick = (rank: number, v3: boolean) => v3 ? o.runners.find(r => r.official.rank === rank)!.target.runnerId : b.runners.find(r => r.rank === rank)!.runnerId;
  return { raceId: o.raceId, raceDate: b.raceDate, course: b.course, capturedAt: o.capturedAt, frozenAt: now.toISOString(), scheduledOff: b.scheduledOff,
    featureCutoffAt: b.featureCutoffAt, shadowHash: hurdleShadowCaptureHash(o), completeMarket: market !== null, marketCapturedAt: b.capturedAt, marketSource: b.marketSource,
    form: classifyHurdleForm(o.runners), marketFavourite: market?.favourite ?? null, marketSecondFavourite: market?.secondFavourite ?? null,
    v3T1: pick(1, true), v3T2: pick(2, true), v2T1: pick(1, false), v2T2: pick(2, false),
    runners: o.runners.map(r => { const p = b.runners.find(p => p.runnerId === r.target.runnerId)!, q = market?.rows.find(p => p.runnerId === r.target.runnerId), depth = hurdleSpeedDepth(r);
      const edgePP = q ? 100 * (r.official.probability - q.probability) : null;
      return { runnerId: p.runnerId, horseName: p.horseName, v3Probability: r.official.probability, v3Rank: r.official.rank, v3Logit: r.official.logit, v2Rank: p.rank,
        price: q?.price ?? null, marketProbability: q?.probability ?? null, marketRank: q?.rank ?? null, marketRankBand: q ? hurdleMarketRankBand(q.rank) : null,
        edgePP, edgeBand: edgePP === null ? null : hurdleEdgeBand(edgePP), speedCount: depth.count, speedDepth: depth.category, speedEvidence: depth.evidence,
        ...hurdleEdgeContributions(r, model) };
    }) };
}
function validate(data: HurdleMarketEdgeData) {
  if (data.epoch !== (data.observations[0]?.capturedAt ?? null) || new Set(data.observations.map(o => o.raceId)).size !== data.observations.length) throw new Error("Invalid market-edge epoch or duplicate race");
  for (const [i, o] of data.observations.entries()) {
    if (o.capturedAt < (data.observations[i - 1]?.capturedAt ?? data.armedAt) || o.featureCutoffAt < data.armedAt || o.featureCutoffAt > o.capturedAt ||
      o.marketCapturedAt !== o.capturedAt || o.frozenAt < o.capturedAt || o.frozenAt >= o.scheduledOff || Date.parse(o.frozenAt) - Date.parse(o.capturedAt) > 60000 ||
      getLocalRacingDate(new Date(o.capturedAt)) !== o.raceDate || new Set(o.runners.map(r => r.runnerId)).size !== o.runners.length) throw new Error("Invalid market-edge capture chronology or field");
    const ordered = [...o.runners].sort((a, b) => b.v3Probability - a.v3Probability || a.runnerId.localeCompare(b.runnerId));
    if (Math.abs(o.runners.reduce((s, r) => s + r.v3Probability, 0) - 1) > 1e-12 || o.v3T1 !== ordered[0].runnerId || o.v3T2 !== ordered[1].runnerId ||
      o.v2T1 !== o.runners.find(r => r.v2Rank === 1)?.runnerId || o.v2T2 !== o.runners.find(r => r.v2Rank === 2)?.runnerId ||
      new Set(o.runners.map(r => r.v2Rank)).size !== o.runners.length || o.runners.some(r => r.v2Rank > o.runners.length)) throw new Error("Invalid frozen market-edge selections");
    const total = o.runners.reduce((s, r) => s + 1 / (r.price ?? 1), 0), market = [...o.runners].sort((a, b) => (b.marketProbability ?? 0) - (a.marketProbability ?? 0) || a.runnerId.localeCompare(b.runnerId));
    if (o.completeMarket ? o.marketFavourite !== market[0].runnerId || o.marketSecondFavourite !== market[1].runnerId : o.marketFavourite !== null || o.marketSecondFavourite !== null) throw new Error("Invalid frozen market favourites");
    const maxLogit = Math.max(...o.runners.map(r => r.v3Logit)), denominator = o.runners.reduce((s, r) => s + Math.exp(r.v3Logit - maxLogit), 0);
    for (const [j, r] of ordered.entries()) {
      if (r.v3Rank !== j + 1 || Math.abs(r.v3Probability - Math.exp(r.v3Logit - maxLogit) / denominator) > 1e-12 ||
        r.speedDepth !== SPEED_DEPTHS[r.speedCount] || r.speedEvidence !== (r.speedCount <= 1 ? "LOW SPEED EVIDENCE" : "ESTABLISHED SPEED EVIDENCE") ||
        JSON.stringify(r.groups.map(g => g.name)) !== JSON.stringify(CONTRIBUTION_GROUPS) || Math.abs(r.groups.reduce((s, g) => s + g.contribution, 0) - r.v3Logit) > 1e-12) throw new Error("Invalid market-edge feature context");
      const top = r.groups.filter(g => g.contribution > 0).sort((a, b) => b.contribution - a.contribution || a.name.localeCompare(b.name)).slice(0, 3);
      if (JSON.stringify(top) !== JSON.stringify(r.topPositiveGroups) || r.topPositiveFeatures.some(f => f.contribution <= 0)) throw new Error("Invalid market-edge positive contributors");
      if (o.completeMarket) {
        if (r.price === null || r.marketProbability === null || r.edgePP === null || Math.abs(r.marketProbability - 1 / r.price / total) > 1e-12 ||
          r.marketRank !== 1 + o.runners.filter(p => p.price! < r.price!).length || r.marketRankBand !== hurdleMarketRankBand(r.marketRank) ||
          Math.abs(r.edgePP - 100 * (r.v3Probability - r.marketProbability)) > 1e-12 || r.edgeBand !== hurdleEdgeBand(r.edgePP)) throw new Error("Invalid frozen market-edge book");
      } else if ([r.price, r.marketProbability, r.marketRank, r.marketRankBand, r.edgePP, r.edgeBand].some(v => v !== null)) throw new Error("Incomplete book must not manufacture an edge");
    }
  }
}
export async function loadHurdleMarketEdge(path = MARKET_EDGE_PATH): Promise<HurdleMarketEdgeData | null> {
  try { const data = schema.parse(JSON.parse(await readFile(path, "utf8"))); validate(data); return data; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function initializeHurdleMarketEdge(path = MARKET_EDGE_PATH, now = new Date()) {
  const model = await loadHurdleV3Challenger();
  if (model.checksum !== HURDLE_V3_FROZEN_HASH) throw new Error("Frozen V3 model changed");
  const data = schema.parse({ version: MARKET_EDGE_VERSION, armedAt: now.toISOString(), epoch: null, v3Hash: model.checksum,
    rules: MARKET_EDGE_RULES, sourceHashes: await hurdleMarketEdgeSourceHashes(), observations: [] });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
  return data;
}
/** Only newly accepted V3 pairs from the production invocation may be supplied. Never scan old books. */
export function appendHurdleMarketEdges(data: HurdleMarketEdgeData, fresh: readonly HurdleV3ShadowObservation[], model: HurdleV3ChallengerModel, now = new Date()) {
  const additions: HurdleMarketEdgeObservation[] = [], known = new Set(data.observations.map(o => o.raceId));
  for (const o of [...fresh].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))) {
    if (known.has(o.raceId) || o.captureMode !== "new_production_capture" || o.production.family !== "HURDLE" || o.capturedAt < data.armedAt || o.production.featureCutoffAt < data.armedAt ||
      o.capturedAt < (additions.at(-1)?.capturedAt ?? data.observations.at(-1)?.capturedAt ?? data.armedAt) || Date.parse(o.capturedAt) > now.getTime() ||
      Date.parse(o.frozenAt) > now.getTime() || now.getTime() - Date.parse(o.capturedAt) > 60000 || now.getTime() >= Date.parse(o.production.scheduledOff) ||
      getLocalRacingDate(now) !== o.production.raceDate || o.production.runners.some(r => r.outcome !== null)) continue;
    additions.push(buildHurdleMarketEdge(o, model, now)); known.add(o.raceId);
  }
  const observations = [...data.observations, ...additions], after = { ...data, epoch: data.epoch ?? observations[0]?.capturedAt ?? null, observations };
  validate(after); return after;
}
export async function mutateHurdleMarketEdge(mutate: (data: HurdleMarketEdgeData) => HurdleMarketEdgeData, path = MARKET_EDGE_PATH) {
  return mutateFrozenJson(path, async () => { const data = await loadHurdleMarketEdge(path); if (!data) throw new Error("Market-edge monitor not armed"); return data; }, v => schema.parse(v), (before, after) => {
    if (JSON.stringify({ ...before, epoch: null, observations: [] }) !== JSON.stringify({ ...after, epoch: null, observations: [] }) || before.epoch !== null && before.epoch !== after.epoch ||
      after.observations.length < before.observations.length || before.observations.some((o, i) => JSON.stringify(o) !== JSON.stringify(after.observations[i]))) throw new Error("Cannot rewrite market-edge methodology, epoch or observations");
    validate(after);
    if (after.observations.slice(before.observations.length).some(o => Date.now() >= Date.parse(o.scheduledOff) || Date.parse(o.frozenAt) > Date.now() || Date.now() - Date.parse(o.capturedAt) > 60000 || getLocalRacingDate() !== o.raceDate)) throw new Error("No retrospective market-edge additions");
  }, async data => {
    if (JSON.stringify(data.sourceHashes) !== JSON.stringify(await hurdleMarketEdgeSourceHashes())) throw new Error("Market-edge methodology changed; create a new version");
    return mutate(data);
  });
}
export async function syncHurdleMarketEdge(fresh: readonly HurdleV3ShadowObservation[]) {
  if (!fresh.length || !await loadHurdleMarketEdge()) return;
  const model = await loadHurdleV3Challenger();
  return mutateHurdleMarketEdge(data => appendHurdleMarketEdges(data, fresh, model));
}
export async function loadHurdleMarketEdgeContext() {
  const [data, shadows] = await Promise.all([loadHurdleMarketEdge(), loadHurdleV3Shadow()]);
  return { data, shadows };
}
/** Settlement is read from this exact canonical source. Outcomes are excluded from the immutable capture digest. */
export function matchingMarketEdgeShadow(o: HurdleMarketEdgeObservation, shadows: readonly HurdleV3ShadowObservation[]) {
  return shadows.find(s => s.raceId === o.raceId && s.capturedAt === o.capturedAt && hurdleShadowCaptureHash(s) === o.shadowHash);
}
