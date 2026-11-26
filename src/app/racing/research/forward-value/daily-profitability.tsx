import type { buildAwProfitabilityReport } from "@/lib/racing/aw-profitability-report";
import { loadAwSprint } from "@/lib/racing/aw-profit-sprint-filter";
import { loadChaseClass46, shadowPick } from "@/lib/racing/chase-t3-class46-handicap";
import { verifyFrozenFinalSp, type HurdleFinalSpResults } from "@/lib/racing/hurdle-final-sp";
import { loadHurdleClass4 } from "@/lib/racing/hurdle-t2-class4-filter";
import { loadHurdleT2Filter } from "@/lib/racing/hurdle-t2-nonhandicap-filter";
import { latestPreOffCaptures } from "@/lib/racing/frozen-capture-selection";
import { CANONICAL_SETTLEMENT_VERSION } from "@/lib/racing/research-settlement-version";
import { frozenNumeric } from "@/lib/racing/tissue-generation-features";
import type { GenerationData } from "@/lib/racing/tissue-generation-forward";
import { CaptureTime, profitMoney } from "./aw-profitability";

export const readDailyShadows = () => Promise.allSettled([
  loadAwSprint(), loadHurdleT2Filter(), loadHurdleClass4(), loadChaseClass46(),
]);

export const families = { AW: "All Weather", HURDLE: "Hurdles", CHASE: "Chases" } as const;
type Family = keyof typeof families;
type Ticket = { horse: string; quote: number | null; result: string; status: string; sp?: string; pl?: number; capturedPL?: number | null; settledAt?: string };
type Details = { handicap?: string; officialClass?: number | null; yards?: number | null };
type Decision = {
  horse?: string; state: "BET" | "NO BET" | "NO SELECTION";
  capturedAt: string; decidedAt: string; reason: string; ticket?: Ticket; reference?: Ticket; indicator?: string; details?: Details; original?: Partial<Record<number, Ticket>>;
};
type Entry = { policy: string; armedAt: string | null; unavailable?: boolean; missing?: string; decision?: Decision };
type Race = {
  raceId: string; raceDate: string; course: string; scheduledOff: string; family: Family;
  original: (Ticket | null)[]; entries: Entry[]; sourceAt: string | null;
  handicap: string; officialClass: number | null; yards: number | null; sourceMissing: boolean;
};
type Identity = Pick<Race, "raceId" | "raceDate" | "course" | "scheduledOff">;
type Outcome = { status: "settled" | "NR" | "void"; winner: boolean | null; finalSp: { fractional: string; profitLoss: number } | null };
const status = (s?: string) => s === "settled" ? "SETTLED" : s === "NR" ? "NON-RUNNER" : s === "void" ? "VOID" : "PENDING";
const result = (s?: string, winner?: boolean | null) => s === "settled" ? winner ? "Won" : "Lost" : status(s);
const makeTicket = (horse: string, quote: number | null, o?: Outcome | null, capturedPL?: number | null, settledAt?: string): Ticket => ({
  horse, quote, status: status(o?.status), result: result(o?.status, o?.winner),
  sp: o?.finalSp?.fractional, pl: o?.finalSp?.profitLoss, capturedPL, settledAt,
});
type AwPick = NonNullable<ReturnType<typeof buildAwProfitabilityReport>["races"][number]["original"][number]>;
function awTicket(p: AwPick): Ticket {
  const final = p.final;
  if (!final || final.status !== "settled") return {
    ...makeTicket(p.horse, p.price, final ? { status: final.status, winner: null, finalSp: null } : null),
    ...(p.result && !final ? { status: "RESULT RECORDED", result: p.result } : {}),
  };
  return makeTicket(p.horse, p.price, { status: final.status, winner: final.won,
    finalSp: { fractional: final.startingPrice ?? final.decimalSP.toFixed(2), profitLoss: final.profitLoss } });
}

const awPolicies = [
  ["AW_PROFIT_V1", "Profit V1"], ["AW_PROFIT_V3", "Profit V3"], ["AW_SAME_OR_OUTSIDER_V1", "Same-OR Outsider V1"],
] as const;
const hurdleReason = {
  confirmed_non_handicap_under_18f: "Short non-handicap",
  confirmed_class_4: "Class 4 exclusion",
};
const chaseReason = {
  class46_handicap: "Confirmed Class 4–6 handicap",
  missing_or_invalid_t2: "Original T2 missing or invalid",
  missing_or_invalid_t3: "Original T3 missing or invalid",
  t3_withdrawn: "Original T3 withdrawn",
  unknown_handicap: "Handicap status unconfirmed",
  non_handicap: "Non-handicap",
  unknown_class: "Official class unconfirmed",
  other_class: "Official class outside 4–6",
};

export function buildDailyProfitability(date: string, generation: GenerationData, aw: ReturnType<typeof buildAwProfitabilityReport>,
  [sprint, short, class4, chase]: Awaited<ReturnType<typeof readDailyShadows>>, sp?: HurdleFinalSpResults) {
  const data = <T,>(r: PromiseSettledResult<T>): T | null => r.status === "fulfilled" ? r.value : null;
  const decisions = new Map<string, Map<string, Decision>>();
  const identities = new Map<string, Identity & { family: Family }>();
  const books = generation.races.filter(b => b.raceDate === date && Object.hasOwn(families, b.family));
  const familyRace = (id: string, family: Family) => family + "|" + id;
  const key = (id: string, family: Family, captured: string) => familyRace(id, family) + "|" + captured;
  const byCapture = new Map(books.map(b => [key(b.raceId, b.family as Family, b.capturedAt), b]));
  const latest = new Map(latestPreOffCaptures(books).map(b => [familyRace(b.raceId, b.family as Family), b]));
  const identity = ({ raceId, raceDate, course, scheduledOff }: Identity, family: Family) => ({ raceId, raceDate, course, scheduledOff, family });
  for (const b of books) identities.set(familyRace(b.raceId, b.family as Family), identity(b, b.family as Family));

  function add(family: Family, r: Identity, policy: string, armedAt: string | null, d: Decision) {
    if (r.raceDate !== date || !armedAt || Date.parse(d.capturedAt) < Date.parse(armedAt) ||
        Date.parse(d.decidedAt) < Date.parse(d.capturedAt) || Date.parse(d.decidedAt) >= Date.parse(r.scheduledOff)) return;
    const id = familyRace(r.raceId, family);
    if (!identities.has(id)) identities.set(id, identity(r, family));
    const group = decisions.get(id) ?? new Map<string, Decision>();
    group.set(policy, d);
    decisions.set(id, group);
  }

  const catalog: Record<Family, Entry[]> = { AW: [], HURDLE: [], CHASE: [] };
  for (const [id, label] of awPolicies) {
    const p = aw.policies.find(x => x.id === id);
    catalog.AW.push({ policy: label, armedAt: p?.armedAt ?? null, unavailable: p?.unavailable, missing: p?.noCapture });
    for (const r of p?.day ?? []) add("AW", r, label, p?.armedAt ?? null, {
      capturedAt: r.capturedAt, decidedAt: r.decidedAt, state: r.pick ? "BET" : "NO BET",
      horse: r.pick?.horse, ticket: r.pick ? awTicket(r.pick) : undefined,
      reference: awTicket(r.reference), reason: r.reason,
      indicator: r.pick && r.pick.runnerId !== r.reference.runnerId ? "SWITCHED" : undefined,
    });
  }
  const register = <T extends { armedAt: string },>(family: Family, policy: string, source: PromiseSettledResult<T | null>) => {
    const ledger = data(source);
    catalog[family].push({ policy, armedAt: ledger?.armedAt ?? null, unavailable: source.status === "rejected" });
    return ledger;
  };
  const awSprint = "Sprint Filter V1";
  const s = register("AW", awSprint, sprint);
  for (const r of s?.races ?? []) {
    const ticket = r.v1 ? makeTicket(r.v1.horseName, r.v1.capturedPrice, r.outcomes.v1, r.outcomes.v1?.capturedPL, r.outcomes.v1?.settledAt) : undefined;
    add("AW", r, awSprint, s?.armedAt ?? null, {
      capturedAt: r.sourceCapturedAt, decidedAt: r.capturedAt, state: r.selectionRunnerId ? "BET" : "NO BET",
      horse: r.selectionRunnerId ? ticket?.horse : undefined, ticket: r.selectionRunnerId ? ticket : undefined, reference: ticket,
      details: { handicap: r.handicap, yards: r.distanceYards },
      original: {
        1: r.v1?.rank === 1 ? ticket : undefined,
        2: makeTicket(r.t2.horseName, r.t2.capturedPrice, r.outcomes.t2, r.outcomes.t2?.capturedPL, r.outcomes.t2?.settledAt),
      },
      reason: r.reason === "sprint_handicap_filter" ? "Sprint handicap" : r.reason === "v1_no_bet" ? "Original V1 NO BET" : "Original V1 retained",
    });
  }

  const shortName = "Short Non-Handicap Filter", className = "Class 4 Combined Filter";
  const shortData = register("HURDLE", shortName, short), classData = register("HURDLE", className, class4);
  for (const [name, ledger] of [[shortName, shortData], [className, classData]] as const) for (const r of ledger?.races ?? []) {
    const ticket = makeTicket(r.t2.horseName, r.t2.capturedPrice, r.settlement, r.settlement?.capturedProfitLoss, r.settlement?.recordedAt);
    add("HURDLE", r, name, ledger?.armedAt ?? null, {
      capturedAt: r.sourceCapturedAt, decidedAt: r.capturedAt, state: r.decision, horse: r.decision === "BET" ? ticket.horse : undefined,
      ticket: r.decision === "BET" ? ticket : undefined, reference: ticket, original: { 2: ticket },
      details: "officialClass" in r
        ? { officialClass: r.officialClass, handicap: r.confirmedHandicap, yards: r.confirmedDistanceYards }
        : { handicap: r.handicap, yards: r.distanceFurlongs === null ? null : Math.round(r.distanceFurlongs * 220) },
      reason: r.abstentionReason ? hurdleReason[r.abstentionReason] : "Original T2 retained",
    });
  }

  const chaseName = "Class 4–6 Chase Shadow";
  const c = register("CHASE", chaseName, chase);
  for (const r of c?.races ?? []) {
    const selected = shadowPick(r);
    const ticket = selected ? makeTicket(selected.horseName, selected.capturedPrice, r.outcomes.shadow, r.outcomes.shadow?.capturedProfitLoss, r.outcomes.shadow?.recordedAt) : undefined;
    const reference = r.t2 ? makeTicket(r.t2.horseName, r.t2.capturedPrice, r.outcomes.t2, r.outcomes.t2?.capturedProfitLoss, r.outcomes.t2?.recordedAt) : undefined;
    add("CHASE", r, chaseName, c?.armedAt ?? null, {
      capturedAt: r.sourceCapturedAt, decidedAt: r.capturedAt, state: selected ? "BET" : "NO SELECTION", horse: selected?.horseName,
      ticket, reference, original: { 2: reference, 3: r.t3
        ? r.decision === "T3_SUBSTITUTION" ? ticket : makeTicket(r.t3.horseName, r.t3.capturedPrice) : undefined },
      indicator: r.decision === "T3_SUBSTITUTION" ? "T3 SUBSTITUTED" : r.decision === "T2_RETAINED" ? "T2 RETAINED" : undefined,
      reason: chaseReason[r.reason], details: { handicap: r.handicap, officialClass: r.officialClass },
    });
  }

  const awRaces = new Map(aw.races.map(r => [r.raceId, r]));
  const races: Race[] = [...identities.entries()].map(([id, r]) => {
    const group = decisions.get(id);
    const firstDecision = group?.values().next().value;
    const anchor = firstDecision?.capturedAt;
    const book = anchor ? byCapture.get(key(r.raceId, r.family, anchor)) : latest.get(id);
    const sourceAt = book?.capturedAt ?? anchor ?? null;
    const existingAw = r.family === "AW" ? awRaces.get(r.raceId) : undefined;
    const awSource = existingAw?.decisions.find(d => d.decision)?.decision?.capturedAt;
    const original = Array.from({ length: r.family === "CHASE" ? 3 : 2 }, (_, i) => {
      const p = book?.runners.find(x => x.rank === i + 1);
      if (existingAw?.original[i] && sourceAt && (awSource ?? latest.get(id)?.capturedAt) === sourceAt) return awTicket(existingAw.original[i]);
      if (!p) return firstDecision?.original?.[i + 1] ?? null;
      const o = p.outcome?.settlementVersion === CANONICAL_SETTLEMENT_VERSION ? p.outcome : null;
      const field = sp?.get(r.raceId);
      const verified = o?.status === "settled" ? verifyFrozenFinalSp(field, p.runnerId, o).settlement : null;
      const fractional = field?.get(p.runnerId)?.resultPrice;
      return makeTicket(p.horseName, p.capturedPrice, o ? { status: o.status, winner: o.winner,
        finalSp: verified && fractional ? { fractional, profitLoss: verified.profitLoss } : null } : null, o?.profitLoss, o?.settledAt);
    });
    const agreed = (name: string) => {
      if (!book) return null;
      const inputs = book.runners.map(p => frozenNumeric(book.featureNames, p.modelInputs, name));
      return inputs.every(v => v === inputs[0]) ? inputs[0] ?? null : null;
    };
    const h = agreed("handicap"), f = agreed("distance_furlongs");
    return {
      ...r, scheduledOff: book?.scheduledOff ?? r.scheduledOff, course: book?.course ?? r.course,
      original, sourceAt, sourceMissing: !book,
      handicap: h === 1 ? "Handicap" : h === 0 ? "Non-handicap" : firstDecision?.details?.handicap ?? "Unknown",
      yards: f !== null && f > 0 && Math.abs(f * 220 - Math.round(f * 220)) < 1e-7 ? Math.round(f * 220) : firstDecision?.details?.yards ?? null,
      officialClass: agreed("class") ?? firstDecision?.details?.officialClass ?? null,
      entries: catalog[r.family].filter(e => e.armedAt || e.unavailable).map(e => ({
        ...e, decision: group?.get(e.policy),
        missing: e.unavailable ? "Ledger unavailable." : e.armedAt && Date.parse(r.scheduledOff) <= Date.parse(e.armedAt)
          ? "Race preceded activation." : e.armedAt && sourceAt && Date.parse(sourceAt) < Date.parse(e.armedAt)
            ? "Tissue source capture preceded activation." : e.missing ?? "No frozen policy decision for this race.",
      })),
    };
  });
  return { catalog, races: races.sort((a, b) => Date.parse(a.scheduledOff) - Date.parse(b.scheduledOff) || a.raceId.localeCompare(b.raceId)) };
}

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
function Badge({ text }: { text: string }) {
  const color = text === "NO BET" ? "bg-red-700 text-white" : text === "T3 SUBSTITUTED" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-800";
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${color}`}>{text}</span>;
}

function DecisionLabel({ entry, expanded }: { entry: Entry; expanded?: boolean }) {
  const d = entry.decision;
  if (!d) return <Badge text={entry.unavailable ? "UNAVAILABLE" : "NOT CAPTURED"} />;
  return <>{d.state === "BET" ? d.horse : <Badge text={d.state} />}{d.indicator && <> <Badge text={d.indicator} /></>}
    {d.state === "NO BET" && (expanded || d.reason.length < 35) && <> <span className="text-slate-600">{d.reason}</span></>}
  </>;
}

function Evidence({ ticket, capturedAt }: { ticket: Ticket; capturedAt: string | null }) {
  return <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
    <Badge text={ticket.status} /> {ticket.result !== ticket.status && <span>{ticket.result}</span>}
    <span>Bookmaker {ticket.quote !== null ? <>{ticket.quote.toFixed(2)} · <CaptureTime value={capturedAt} exact /></> : "quote unavailable"}</span>
    {ticket.status === "SETTLED" && <span>Verified final SP {ticket.sp ?? "unavailable"}{ticket.pl !== undefined && <> · SP £1 P/L {profitMoney(ticket.pl)}</>}</span>}
    {ticket.capturedPL != null && <span>Captured £1 P/L {profitMoney(ticket.capturedPL)}</span>}
    {ticket.settledAt && <span>Settled <CaptureTime value={ticket.settledAt} exact /></span>}
  </div>;
}

export function DailyProfitability({ report, date }: { report: ReturnType<typeof buildDailyProfitability>; date: string }) {
  return <div className="mt-3 space-y-4">
    {(Object.keys(families) as Family[]).map(family => {
      const races = report.races.filter(r => r.family === family);
      return <section key={family} aria-label={families[family]}>
        <h3 className="text-sm font-semibold">{families[family]} <span className="font-normal text-slate-500">· {races.length} races</span></h3>
        <details className="mt-1 text-xs text-slate-600">
          <summary className="cursor-pointer">Policy activation</summary>
          <ul className="mt-1 space-y-1">{report.catalog[family].map(p => <li key={p.policy}>{p.policy} · <Badge text={p.unavailable ? "UNAVAILABLE" : p.armedAt ? "ARMED" : "UNARMED"} />
            {p.armedAt && <> · <CaptureTime value={p.armedAt} exact /> London time</>}</li>)}</ul>
        </details>
        {!races.length && <p className="mt-2 text-xs text-slate-600"><Badge text="NOT CAPTURED" /> No frozen races for {date}.</p>}
        <div className="mt-2 grid gap-2">{races.map(r => {
          const placed = [...r.original, ...r.entries.map(e => e.decision?.ticket ?? e.decision?.reference)].filter(p => p != null);
          const pend = placed.some(p => p.status === "PENDING");
          const done = placed.some(p => p.status !== "PENDING");
          return <details key={r.raceId} className="min-w-0 rounded-md border border-slate-200 bg-white">
            <summary className="cursor-pointer px-3 py-2 text-sm">
              <strong>{clock.format(new Date(r.scheduledOff))} {r.course}</strong> <span className="text-xs text-slate-600">{families[family]}</span>{" "}
              <Badge text="CAPTURED" />{" "}<Badge text={done ? pend ? "PARTIALLY SETTLED" : "SETTLED" : placed.length ? "PENDING" : "NO SELECTION"} />
              <span className="mt-1 grid min-w-0 grid-cols-2 gap-x-3 gap-y-1 pl-3 text-xs sm:flex sm:flex-wrap">
                {r.original.map((p, i) => <span key={i}><strong>T{i + 1}</strong> {p?.horse ?? <Badge text="NOT CAPTURED" />}</span>)}
                {r.entries.map(e => <span key={e.policy}><strong>{e.policy}</strong> <DecisionLabel entry={e} /></span>)}
              </span>
            </summary>
            <div className="border-t border-slate-200 px-3 py-2 text-sm">
              <p className="text-xs text-slate-600">{families[family]} · {r.course} · Off <CaptureTime value={r.scheduledOff} /> · {r.handicap} · Class {r.officialClass ?? "unknown"} · {r.yards === null ? "Distance unknown" : `${r.yards} yd`}</p>
              {r.sourceMissing && <p className="mt-1 text-xs text-slate-600">Matching Tissue source book unavailable. Original ranks appear only where a frozen copy exists.</p>}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="space-y-2">
                  {r.original.map((p, i) => <div key={i}><strong>Original T{i + 1}</strong> · {p?.horse ?? <Badge text="NOT CAPTURED" />}
                    {p && <Evidence ticket={p} capturedAt={r.sourceAt} />}</div>)}
                </div>
                <div className="space-y-2">
                  {r.entries.map(e => <div key={e.policy}><strong>{e.policy}</strong> · <DecisionLabel entry={e} expanded />
                    {e.decision ? <>
                      {e.decision.state !== "NO BET" && <p className="text-xs text-slate-600">{e.decision.reason}</p>}
                      {e.decision.details && <p className="text-xs text-slate-600">
                        Policy evidence · {e.decision.details.handicap ?? "Handicap unknown"}
                        {"officialClass" in e.decision.details && <> · Class {e.decision.details.officialClass ?? "unknown"}</>}
                        {"yards" in e.decision.details && <> · {e.decision.details.yards == null ? "Distance unknown" : `${e.decision.details.yards} yd`}</>}
                      </p>}
                      <p className="text-xs text-slate-600">Decision <CaptureTime value={e.decision.decidedAt} exact /></p>
                      {e.decision.ticket && <Evidence ticket={e.decision.ticket} capturedAt={e.decision.capturedAt} />}
                      {e.decision.reference && (!e.decision.ticket || e.decision.indicator === "T3 SUBSTITUTED" || e.decision.indicator === "SWITCHED") && <>
                        <p className="mt-1 text-xs">Benchmark {e.decision.reference.horse}</p>
                        <Evidence ticket={e.decision.reference} capturedAt={e.decision.capturedAt} />
                      </>}
                    </> : <p className="text-xs text-slate-600">{e.missing}</p>}
                  </div>)}
                </div>
              </div>
            </div>
          </details>;
        })}</div>
      </section>;
    })}
  </div>;
}
