import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { AW_MARKET_SUPPORT_POLICY, loadAwMarketSupport } from "./aw-market-support-shadow";
import { AW_PROFIT_V1, AW_PROFIT_V3 } from "./aw-profit-policy";
import { loadAwProfitShadow } from "./aw-profit-shadow";
import { AW_SAME_OR_POLICY } from "./aw-same-or-policy";
import { loadAwSameOrShadow } from "./aw-same-or-shadow";
import { verifyFrozenFinalSp, type HurdleFinalSpResults } from "./hurdle-final-sp";
import { latestPreOffCaptures } from "./frozen-capture-selection";
import { summarizeBookmakerMarket } from "./forward-value";
import type { GenerationData, GenerationRace } from "./tissue-generation-forward";
import { getLocalRacingDate } from "./todays-racing";

export async function readAwProfitabilityLedgers() {
  return Promise.allSettled([loadAwProfitShadow(), loadAwSameOrShadow(), loadAwMarketSupport()] as const);
}

type CollectionStatus = { start?: string; end?: string; status?: string; reason?: string; sameOrWarning?: boolean };
const journalEvent = z.object({ id: z.string(), at: z.iso.datetime(), role: z.string(), date: z.iso.date(), status: z.string(), reason: z.string().optional() });
export async function readAwCollectionStatus(date: string, root = join(homedir(), "Library/Logs/RacingAnalysis")): Promise<CollectionStatus> {
  const read = (file: string) => readFile(join(root, file), "utf8").catch(() => "");
  const [journal, sameOrWarning] = await Promise.all([read("executions.jsonl"), read("last-aw-same-or-warning.json")]);
  const parse = (line: string) => {
    try { return journalEvent.safeParse(JSON.parse(line)).data; } catch { return undefined; }
  };
  const events = journal.split("\n").flatMap(line => {
    const event = parse(line);
    return event?.role === "collection" && event.date === date ? [event] : [];
  });
  const start = events.find(e => e.status === "started");
  const finish = start && events.find(e => e.id === start.id && e.status !== "started");
  const latest = finish ?? start ?? events.at(-1);
  let warned = false;
  try {
    const warning = JSON.parse(sameOrWarning);
    warned = !!start && warning.id === start.id && warning.role === "collection" && warning.date === date;
  } catch { /* Optional warning marker. */ }
  return { start: start?.at, end: finish?.at, status: latest?.status, reason: latest?.reason, sameOrWarning: warned };
}

const racingDate = z.iso.date();
export const profitabilityDate = (value: string | undefined, today: string) =>
  racingDate.safeParse(value).data ?? today;

type FinalOutcome = { status: "NR" | "void" } | {
  status: "settled"; won: boolean; startingPrice: string | null; decimalSP: number; profitLoss: number;
};
type QuotedRunner = { runnerId: string; horseName: string; price: number | null };
type Pick = {
  horse: string; runnerId: string; price: number | null; marketRank: number | null;
  final?: FinalOutcome; result?: string;
};
type Race = { raceId: string; raceDate: string; course: string; scheduledOff: string };
type Decision = Race & { capturedAt: string; decidedAt: string; pick: Pick | null; reference: Pick; reason: string };
type Policy = {
  id: string; name: string; armedAt: string | null; unavailable: boolean;
  decisions: Decision[]; eligible: number | null; noCapture: string;
};

function freezePick(runners: QuotedRunner[], id: string, completeMarket: boolean, final?: FinalOutcome): Pick {
  const runner = runners.find(r => r.runnerId === id)!;
  const price = runner.price;
  return { horse: runner.horseName, runnerId: id, price, final,
    marketRank: completeMarket && price !== null ? 1 + runners.filter(r => r.price !== null && r.price < price).length : null };
}

function bookPick(book: GenerationRace, id: string, final?: FinalOutcome): Pick {
  const runners = book.runners.map(r => ({ ...r, price: summarizeBookmakerMarket(r.quotes).decimalPrice }));
  return freezePick(runners, id, book.completeMarket, final);
}

export function summarizeAwDecisions(picks: ReadonlyArray<Pick | null>) {
  let bets = 0, pending = 0, settled = 0, winners = 0, voids = 0, abstentions = 0, profit = 0;
  for (const pick of picks) {
    if (!pick) { abstentions++; continue; }
    bets++;
    if (!pick.final) pending++;
    else if (pick.final.status === "settled") {
      settled++;
      winners += Number(pick.final.won);
      profit += pick.final.profitLoss;
    } else voids++;
  }
  return { recorded: picks.length, bets, pending, settled, winners, voids, abstentions,
    profit: settled ? profit : null, roi: settled ? profit / settled : null };
}

export function matchedAwDecisions(policy: Policy) {
  // A matched monetary result requires each placed ticket's final outcome.
  // Profit V1/V3 abstentions carry zero stake against the original T1.
  // Same-OR and market support retain their original reference settlement semantics.
  const paired = policy.decisions.filter(d =>
    d.reference.final && (d.pick === null || d.pick.final));
  return {
    races: paired.length,
    policy: summarizeAwDecisions(paired.map(d => d.pick)),
    reference: summarizeAwDecisions(paired.map(d => d.reference)),
  };
}

export function buildAwProfitabilityReport(
  date: string, generation: GenerationData, [profitResult, sameOrResult, supportResult]: Awaited<ReturnType<typeof readAwProfitabilityLedgers>>,
  now = new Date(), collection: CollectionStatus = {}, finalSpResults?: HurdleFinalSpResults,
) {
  const profit = profitResult.status === "fulfilled" ? profitResult.value : null;
  const sameOr = sameOrResult.status === "fulfilled" ? sameOrResult.value : null;
  const support = supportResult.status === "fulfilled" ? supportResult.value : null;
  const dayBooks = generation.races.filter(book => book.family === "AW" && book.raceDate === date);
  const books = new Map(dayBooks.map(book => [`${book.raceId}|${book.capturedAt}`, book]));
  const policies: Policy[] = [];

  function addPolicy(id: string, name: string, armedAt: string | null | undefined, unavailable: boolean, decisions: Decision[]) {
    const observed = decisions.filter(d => d.raceDate === date);
    const scheduled = !id.startsWith(AW_MARKET_SUPPORT_POLICY);
    const eligible = armedAt ? new Set([
      ...dayBooks.filter(b => Date.parse(b.capturedAt) >= Date.parse(armedAt) &&
        (!scheduled || !collection.start || Date.parse(b.capturedAt) >= Date.parse(collection.start)) &&
        (!scheduled || !collection.end || Date.parse(b.capturedAt) <= Date.parse(collection.end))).map(b => b.raceId),
      ...observed.map(d => d.raceId),
    ]).size : null;
    const today = getLocalRacingDate(now);
    let noCapture = "No pre-off AW source books recorded for this date.";
    if (unavailable) noCapture = "Collector ledger unavailable or invalid.";
    else if (!armedAt) noCapture = "Policy is unarmed.";
    else if (date < getLocalRacingDate(new Date(armedAt))) noCapture = "Date precedes activation.";
    else if (date > today) noCapture = "Collection date is in the future.";
    else if (scheduled && id === AW_SAME_OR_POLICY && collection.sameOrWarning) noCapture = "Same-OR collector reported a warning. Check the morning collection log.";
    else if (scheduled && id !== AW_SAME_OR_POLICY && collection.reason === "aw_profit_shadow_warning_review_logs_no_replay") noCapture =
      "AW Profit collector reported a warning. Check the morning collection log.";
    else if (scheduled && collection.status === "missed") noCapture = "The scheduled morning collection window was missed.";
    else if (scheduled && collection.status === "database_unreachable") noCapture = "Morning collection could not verify database readiness.";
    else if (scheduled && (collection.status === "failed" || collection.status === "partial")) noCapture =
      "Morning collection reported a warning or failure. Check the collection log for details.";
    else if (scheduled && collection.end && Date.parse(collection.end) < Date.parse(armedAt)) noCapture = "Morning collection finished before activation.";
    else if (scheduled && collection.status === "started") noCapture = "The morning collection started. A completion record is pending.";
    else if (eligible) noCapture = "Pre-off source book exists. No frozen policy decision was recorded.";
    else if (date === today && !collection.end) noCapture = "Awaiting an eligible AW source book.";
    policies.push({ id, name, armedAt: armedAt ?? null, unavailable, decisions, eligible, noCapture });
  }

  for (const id of [AW_PROFIT_V1, AW_PROFIT_V3]) {
    addPolicy(id, id === AW_PROFIT_V1 ? "AW Profit V1" : "AW Profit V3", profit?.armedAt, profitResult.status === "rejected",
      profit?.races.map(r => {
        const runners = r.runners.map(x => ({ ...x, price: x.medianBookmakerDecimal }));
        const pick = (runnerId: string) => freezePick(runners, runnerId, r.completeMarket, r.outcomes[runnerId]);
        const selection = r.picks[id];
        const reference = pick(r.picks.AW_TISSUE_V3);
        const candidate = r.runners.find(x => x.runnerId === r.picks.AW_PROFIT_V1);
        let reason = "Original T1 retained.";
        if (!selection) reason = "No runner ranked in both the Tissue and recent-performance top three.";
        else if (selection !== reference.runnerId) reason = id === AW_PROFIT_V1
          ? "Another Tissue top-three runner also ranked in the recent-performance top three."
          : "The recent-performance candidate met the measured-speed substitution rule.";
        else if (candidate && id === AW_PROFIT_V3 && candidate.runnerId !== reference.runnerId) {
          reason = candidate.bestL3Speed === null ? "Original T1 retained because the candidate lacked measured speed."
            : "Original T1 retained because a higher Tissue rank had measured speed.";
        }
        return { raceId: r.raceId, raceDate: r.raceDate, course: r.course, scheduledOff: r.scheduledOff,
          capturedAt: r.sourceCapturedAt, decidedAt: r.decidedAt, pick: selection ? pick(selection) : null, reference, reason };
      }) ?? []);
  }
  addPolicy(AW_SAME_OR_POLICY, "AW Same-OR Outsider V1", sameOr?.armedAt, sameOrResult.status === "rejected",
    sameOr?.observations.map(({ book, decidedAt, decision, outcomes }) => ({
      ...book, decidedAt, pick: decision.selection === null ? null : bookPick(book, decision.selection, outcomes[decision.selection]),
      reference: bookPick(book, decision.originalT1, outcomes[decision.originalT1]),
      reason: decision.originalMarketRank === null ? "Incomplete bookmaker market. Original T1 market rank could not be verified."
        : decision.triggered ? `Substituted the leader with Same-OR Speed removed. Original T1 was market rank ${decision.originalMarketRank}.`
        : decision.originalMarketRank < 4 ? "Original T1 retained because it ranked in the market top three."
        : "Original T1 retained because removing Same-OR Speed left it in first place.",
    })) ?? []);

  for (const rank of [1, 2]) {
    if (rank === 2 && !support) break;
    addPolicy(`${AW_MARKET_SUPPORT_POLICY}-${rank}`, `AW Market Support V1${support ? ` · T${rank}` : ""}`, support?.armedAt,
      supportResult.status === "rejected", support?.observations.map(({ book, decidedAt, decisions, outcomes }) => {
        const decision = decisions.find(d => d.tissueRank === rank)!;
        const reference = bookPick(book, decision.runnerId, outcomes[decision.runnerId]);
        const reasons = { "market-top-three": "Original Tissue runner retained at market rank three or better.",
          "market-rank-four-plus": "Original Tissue runner was market rank four or worse.",
          "market-unverified": "Captured market rank could not be verified." };
        return { ...book, decidedAt, reference, pick: decision.decision === "retain" ? reference : null, reason: reasons[decision.reason] };
      }) ?? []);
  }

  const dayPolicies = policies.map(policy => ({
    ...policy, day: policy.decisions.filter(d => d.raceDate === date),
    latest: policy.decisions.map(d => d.decidedAt).sort().at(-1) ?? null,
  }));
  const races = new Map<string, Race>(dayBooks.map(book => [book.raceId, book]));
  for (const policy of dayPolicies) for (const d of policy.day) races.set(d.raceId, d);
  const latestBooks = new Map(latestPreOffCaptures(dayBooks).map(b => [b.raceId, b]));

  return { policies: dayPolicies, races: [...races.values()].sort((a, b) => Date.parse(a.scheduledOff) - Date.parse(b.scheduledOff)).map(race => {
    const decisions = dayPolicies.map(policy => ({ policy, decision: policy.day.find(d => d.raceId === race.raceId) }));
    const frozen = decisions.find(d => d.decision)?.decision;
    const sourceKey = frozen && `${race.raceId}|${frozen.capturedAt}`;
    const book = sourceKey ? books.get(sourceKey)
      ?? sameOr?.observations.find(o => o.book.raceId === race.raceId && o.book.capturedAt === frozen.capturedAt)?.book
      ?? support?.observations.find(o => o.book.raceId === race.raceId && o.book.capturedAt === frozen.capturedAt)?.book
      : latestBooks.get(race.raceId);
    const profitRace = profit?.races.find(r => r.raceId === race.raceId && r.sourceCapturedAt === frozen?.capturedAt);
    const finals = new Map<string, FinalOutcome>();
    for (const { decision } of decisions) {
      for (const pick of [decision?.reference, decision?.pick]) if (pick?.final) finals.set(pick.runnerId, pick.final);
    }
    const original = ([1, 2] as const).map(rank => {
      const runner = book?.runners.find(r => r.rank === rank);
      if (!book || !runner) {
        const fallback = profitRace?.runners.find(r => r.rank === rank);
        if (profitRace && fallback) return freezePick(profitRace.runners.map(r => ({ ...r, price: r.medianBookmakerDecimal })),
          fallback.runnerId, profitRace.completeMarket, finals.get(fallback.runnerId));
        return rank === 1 ? frozen?.reference ?? null : null;
      }
      const outcome = runner.outcome;
      let final = finals.get(runner.runnerId);
      if (!final && outcome?.status === "settled") {
        const field = finalSpResults?.get(race.raceId);
        const { settlement } = verifyFrozenFinalSp(field, runner.runnerId, outcome);
        if (settlement) final = { status: "settled", won: outcome.winner === true, startingPrice: field?.get(runner.runnerId)?.resultPrice ?? null,
          decimalSP: settlement.settlementOddsDecimal, profitLoss: settlement.profitLoss };
      } else if (!final && (outcome?.status === "NR" || outcome?.status === "void")) final = { status: outcome.status };
      return { ...bookPick(book, runner.runnerId, final),
        result: outcome?.status === "settled" ? outcome.winner ? "Won" : outcome.finishPosition ? `Finished ${outcome.finishPosition}` : "Lost"
          : outcome?.status };
    });
    return { ...race, original, decisions };
  }) };
}
