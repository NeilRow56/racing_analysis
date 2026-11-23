import type { GenerationData, GenerationRace } from "@/lib/racing/tissue-generation-forward";
import { chaseT3Books, CHASE_T3_VALIDATION_START } from "@/lib/racing/chase-t3-research";
import { loadVerifiedFinalSpResults, verifyFrozenFinalSp } from "@/lib/racing/hurdle-final-sp";
import { loadHurdleV3Shadow } from "@/lib/racing/hurdle-v3-shadow";
import { loadHurdleMarketEdge, matchingMarketEdgeShadow } from "@/lib/racing/hurdle-v3-market-edge";
import { loadPositiveNeutral, matchingPositiveNeutralCapture } from "@/lib/racing/tissue-positive-neutral";
import { loadJumpG4Forward } from "@/lib/racing/jump-g4-forward";
import { EPOCHS } from "@/lib/racing/prospective-epoch-config";
import { assertEpochSources, loadEpochManifest } from "@/lib/racing/prospective-epoch-integrity";
import { CaptureTime, profitMoney, profitPercent } from "./aw-profitability";

type Runner = GenerationRace["runners"][number];
type Selection = { raceId: string; runner: Runner | undefined };
type Monitor = {
  name: string; status: string; activation: string | null; latest: string | null;
  races: number; selections: Selection[]; abstentions: number; startDate?: string;
};

export async function ActiveProspectiveSummaries({ generation }: { generation: GenerationData }) {
  const [manifest, shadow, edge, positive] = await Promise.all([
    loadEpochManifest(), loadHurdleV3Shadow(EPOCHS.shadow.ledger),
    loadHurdleMarketEdge(EPOCHS.marketEdge.ledger), loadPositiveNeutral(EPOCHS.positiveNeutral.ledger),
  ]).catch(() => [null, null, null, null] as const);
  const validSources = manifest ? await assertEpochSources(manifest).then(() =>
    [shadow, edge, positive].every(d => d?.armedAt === manifest.activatedAt)).catch(() => false) : false;
  const status = manifest ? validSources ? "ARMED" : "BLOCKED" : "UNVERIFIED";
  const activation = manifest?.activatedAt ?? null;
  const latest = (observations: { capturedAt: string; frozenAt?: string }[]) =>
    observations.map(o => o.frozenAt ?? o.capturedAt).sort().at(-1) ?? null;
  const chase = chaseT3Books(generation).prospective;
  const chaseSelections = chase.flatMap(book => {
    const runner = book.runners.find(r => r.rank === 3);
    return runner ? [{ raceId: book.raceId, runner }] : [];
  });
  const shadows = shadow?.observations ?? [];
  const edges = edge?.observations ?? [];
  const positives = (positive?.observations ?? []).map(o => ({
    ...o, selections: o.selections.filter(s => s.badgeState === "POSITIVE" || s.badgeState === "NEUTRAL"),
  }));
  const generationByRace = Map.groupBy(generation.races, book => book.raceId);
  const monitors: Monitor[] = [
    { name: "Chase T3", status: "ACTIVE", activation: null, startDate: CHASE_T3_VALIDATION_START, latest: latest(chase),
      races: chase.length, abstentions: chase.length - chaseSelections.length, selections: chaseSelections },
    { name: "Hurdle V3 Shadow · T1 & T2", status, activation, latest: latest(shadows), races: shadows.length, abstentions: 0,
      selections: shadows.flatMap(o => o.runners.filter(r => r.official.rank <= 2).map(r =>
        ({ raceId: o.raceId, runner: o.production.runners.find(p => p.runnerId === r.target.runnerId) }))) },
    { name: "Hurdle V3 Market Edge · T1 & T2", status, activation, latest: latest(edges), races: edges.length,
      abstentions: edges.filter(o => !o.completeMarket).length, selections: edges.filter(o => o.completeMarket).flatMap(o => {
        const book = matchingMarketEdgeShadow(o, shadows)?.production;
        return [o.v3T1, o.v3T2].map(id => ({ raceId: o.raceId, runner: book?.runners.find(r => r.runnerId === id) }));
      }) },
    { name: "Tissue Positive/Neutral V2", status, activation, latest: latest(positives), races: positives.length,
      abstentions: positives.filter(o => !o.selections.length).length, selections: positives.flatMap(o => {
        const book = matchingPositiveNeutralCapture(o, generationByRace.get(o.raceId) ?? []);
        return o.selections.map(s => ({ raceId: o.raceId, runner: book?.runners.find(r => r.runnerId === s.runnerId) }));
      }) },
  ];
  const verified = await loadVerifiedFinalSpResults(monitors.flatMap(m => m.selections
    .filter(s => s.runner?.outcome?.status === "settled").map(s => s.raceId))).catch(() => null);
  return <div className="mt-3 grid gap-2 md:grid-cols-2">
    {monitors.map(m => {
      const settled = m.selections.flatMap(({ raceId, runner }) => runner?.outcome?.status === "settled"
        ? [{ settlement: verifyFrozenFinalSp(verified?.get(raceId), runner.runnerId, runner.outcome).settlement, winner: runner.outcome.winner }] : []);
      const pending = m.selections.filter(s => s.runner?.outcome === null).length;
      const missing = m.selections.filter(s => !s.runner).length;
      const stakes = settled.flatMap(s => s.settlement ? [s.settlement] : []);
      const profit = stakes.length ? stakes.reduce((sum, s) => sum + s.profitLoss, 0) : null;
      const stake = stakes.reduce((sum, s) => sum + s.stake, 0);
      return <article className="rounded-md border border-slate-200 bg-white p-3 text-sm" key={m.name}>
        <h3 className="font-semibold">{m.name} <span className="text-xs text-slate-600">· {m.status}</span></h3>
        <p className="mt-1 text-xs text-slate-600">
          {m.startDate ? <>Collection start {m.startDate}</> : <>Activated <CaptureTime value={m.activation} /></>}
          <br />Latest capture <CaptureTime value={m.latest} />
        </p>
        <p className="mt-2 tabular-nums">{m.races ? `${m.races} races · ${m.selections.length} selections · ${m.abstentions} race abstentions` : "NO DATA"}</p>
        {m.races > 0 && <p className="mt-1 text-xs tabular-nums text-slate-600">
          {pending} pending · {settled.length} settled · {settled.filter(s => s.winner).length} winners
          {missing > 0 && ` · ${missing} source unavailable`}
        </p>}
        <p className="mt-2 text-xs tabular-nums">{stakes.length} verified SP stakes · {profitMoney(profit)} · {profitPercent(profit !== null && stake ? profit / stake : null)} ROI
          {settled.length > stakes.length && <span className="ml-1 text-slate-600">({settled.length - stakes.length} unverified SP)</span>}
        </p>
      </article>;
    })}
  </div>;
}

export async function JumpG4Summary() {
  const jump = await loadJumpG4Forward();
  const observations = jump.observations.filter(o => o.recordedPreRace);
  const stakes = observations.flatMap(({ outcome }) => outcome && outcome.won !== null && outcome.profitLoss !== null ? [outcome.profitLoss] : []);
  const profit = stakes.length ? stakes.reduce((total, value) => total + value, 0) : null;
  return <article className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm md:w-1/2">
    <h3 className="font-semibold">Jump G4 <span className="text-xs text-slate-600">· SHADOW</span></h3>
    <p className="mt-1 text-xs text-slate-600">Collection epoch <CaptureTime value={jump.epoch} exact />
      <br />Latest capture <CaptureTime value={observations.map(o => o.recordedAt).sort().at(-1) ?? null} /></p>
    <p className="mt-2 tabular-nums">{observations.length ? `${new Set(observations.map(o => o.raceId)).size} races · ${observations.length} qualifiers` : "NO DATA"}</p>
    {observations.length > 0 && <p className="mt-1 text-xs tabular-nums text-slate-600">
      {observations.filter(o => !o.settledAt).length} pending · {observations.filter(o => o.outcome?.won != null).length} settled · {observations.filter(o => o.outcome?.won).length} winners
    </p>}
    <p className="mt-2 text-xs tabular-nums">{stakes.length} recorded SP stakes · {profitMoney(profit)} · {profitPercent(profit !== null ? profit / stakes.length : null)} ROI</p>
  </article>;
}
