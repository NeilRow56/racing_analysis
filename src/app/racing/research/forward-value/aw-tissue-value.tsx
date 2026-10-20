import { awTissueValueAgreement, cleanAwTissueRace, type AwTissueForwardData } from "@/lib/racing/aw-tissue-forward";
import { FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, type ForwardValueRecord, type ForwardValuePriceSnapshot } from "@/lib/racing/forward-value";
import { turfTissueQualifyingPriceProfitLoss } from "@/lib/racing/forward-value-summary";
import { cleanJumpTissueRace, jumpTissueValueAgreement, type JumpTissueForwardData } from "@/lib/racing/jump-tissue-forward";
import { formatRaceTimeForDisplay } from "@/lib/racing/todays-racing";
import {
  POST_RACE_REVIEW_TAGS,
  TISSUE_VALUE_REVIEW_NOTE_MAX_LENGTH,
  REVIEW_TAG_LABELS,
  emptyTissueValueReviewData,
  summarizeTissueValueReviews,
  tissueValueReviewKey,
  tissueValueReviewMap,
  type OutcomeSummary,
  type ReviewTag,
  type TissueValueReview,
  type TissueValueReviewData,
  type TissueValueReviewFamily,
} from "@/lib/racing/tissue-value-review";
import { saveTissueValueReviewAction } from "./actions";
import type React from "react";

export function TurfTissueValueSection({ records, reviews = emptyTissueValueReviewData() }: { records: ForwardValueRecord[]; reviews?: TissueValueReviewData }) {
  const familyReviews = reviewsForFamily(reviews, "turf");
  const reviewByKey = tissueValueReviewMap(familyReviews);
  const races = records.filter(isTurfTissueValueSelection).sort(newestFirst).slice(0, 100);
  return <DiagnosticDetails
    headingId="turf-tissue-value-heading"
    title="Turf Tissue VALUE"
    summaryItems={[
      ["Settled Turf VALUE selections", races.filter((race) => race.settledAt !== null).length],
      ["Reviewed", familyReviews.reviews.filter((review) => review.status === "reviewed").length],
      ["Not reviewed", Math.max(0, races.filter((race) => race.settledAt !== null).length - familyReviews.reviews.filter((review) => review.status === "reviewed").length)],
    ]}
  >
    <ReviewDiagnostics reviews={familyReviews} />
    <TissueTable
      emptyText="No settled Turf Tissue VALUE selections."
      family="turf"
      probabilityHeading="Turf Tissue probability"
      rows={races.map((race) => {
        const runnerId = race.tissueRunnerId ?? "";
        return {
          key: `${race.raceId}:${race.recordedAt}`,
          family: "turf" as const,
          raceId: race.raceId,
          runnerId,
          raceDate: race.raceDate,
          currentOffAt: race.raceDateTime,
          scheduledTime: race.raceTime,
          course: race.course,
          horseName: race.tissueHorseName ?? "-",
          probability: race.tissueProbability,
          prices: {
            early: race.tissueEarlyPriceSnapshot ?? fallbackTurfPriceSnapshot(race, race.tissuePriceCapturedAt ?? race.priceCapturedAt ?? race.recordedAt),
            t180: race.tissueT180PriceSnapshot ?? null,
            t60: race.tissueT60PriceSnapshot ?? null,
          },
          finalSp: null,
          profit: turfTissueQualifyingPriceProfitLoss(race),
          status: turfTissueStatusLabel(race),
          resultLabel: turfTissueResultLabel(race),
          selectionResult: turfTissueSelectionResult(race),
          settled: race.settledAt !== null,
          defaultOutcomeSummary: outcomeSummaryFromTurfTissueRecord(race),
          review: runnerId ? reviewByKey.get(tissueValueReviewKey({ family: "turf", raceId: race.raceId, runnerId })) ?? null : null,
        };
      })}
    />
  </DiagnosticDetails>;
}

export function AwTissueValueSection({ data, ratings, reviews = emptyTissueValueReviewData() }: { data: AwTissueForwardData; ratings: ForwardValueRecord[]; reviews?: TissueValueReviewData }) {
  const agreement = awTissueValueAgreement(data, ratings);
  const familyReviews = reviewsForFamily(reviews, "aw");
  const reviewByKey = tissueValueReviewMap(familyReviews);
  const races = data.races.filter(cleanAwTissueRace).filter(isSettledTissueValueRace).sort(newestFirst).slice(0, 100);
  return <DiagnosticDetails
    headingId="aw-tissue-value-heading"
    title={data.modelVersion === "AW_TISSUE_V2" ? "AW Tissue v2 (diagnostic)" : "AW Tissue (diagnostic)"}
    summaryItems={[
      ["Comparable AW-D races", agreement.comparable], ["Same leader", agreement.sameLeader], ["Different leader", agreement.differentLeader],
      ["Both positive", agreement.bothPositive], ["AW-D positive only", agreement.awDPositiveOnly],
      ["AW Tissue positive only", agreement.tissuePositiveOnly], ["Neither positive", agreement.neitherPositive],
    ]}
  >
    <ReviewDiagnostics reviews={familyReviews} />
    <TissueTable
      emptyText="No settled AW Tissue VALUE selections."
      family="aw"
      probabilityHeading="AW Tissue probability"
      rows={races.map((race) => {
        const leader = race.runners.find((runner) => runner.runnerId === race.top1);
        const runnerId = leader?.runnerId ?? race.top1 ?? "";
        return {
          key: race.raceId,
          family: "aw" as const,
          raceId: race.raceId,
          runnerId,
          raceDate: race.raceDate,
          currentOffAt: race.currentOffAt,
          scheduledTime: race.scheduledTime,
          course: race.course,
          horseName: leader?.horseName ?? "-",
          probability: leader?.probability ?? null,
          prices: race.prices,
          finalSp: leader?.outcome?.finalSp ?? null,
          profit: race.prices.t60 ? race.selectedPriceProfitLoss.t60 : race.prices.t180 ? race.selectedPriceProfitLoss.t180 : race.selectedPriceProfitLoss.early,
          status: statusLabel(race.settledAt, leader?.outcome?.won ?? null),
          resultLabel: resultLabel(leader?.outcome ?? null),
          selectionResult: selectionResultLabel(leader?.outcome?.won ?? null),
          settled: race.settledAt !== null,
          defaultOutcomeSummary: outcomeSummaryFromLeader(leader?.outcome ?? null),
          review: runnerId ? reviewByKey.get(tissueValueReviewKey({ family: "aw", raceId: race.raceId, runnerId })) ?? null : null,
        };
      })}
    />
  </DiagnosticDetails>;
}

export function JumpTissueValueSection({ data, ratings, reviews = emptyTissueValueReviewData() }: { data: JumpTissueForwardData; ratings: ForwardValueRecord[]; reviews?: TissueValueReviewData }) {
  const agreement = jumpTissueValueAgreement(data, ratings);
  const familyReviews = reviewsForFamily(reviews, "jump");
  const reviewByKey = tissueValueReviewMap(familyReviews);
  const races = data.races.filter(cleanJumpTissueRace).filter(isSettledTissueValueRace).sort(newestFirst).slice(0, 100);
  return <DiagnosticDetails
    headingId="jump-tissue-value-heading"
    title="Jump Tissue (diagnostic)"
    summaryItems={[
      ["Comparable JPR-A races", agreement.comparable], ["Same leader", agreement.sameLeader], ["Different leader", agreement.differentLeader],
      ["Both positive", agreement.bothPositive], ["JPR-A positive only", agreement.jprAPositiveOnly],
      ["Jump Tissue positive only", agreement.tissuePositiveOnly], ["Neither positive", agreement.neitherPositive],
    ]}
  >
    <ReviewDiagnostics reviews={familyReviews} />
    <TissueTable
      emptyText="No settled Jump Tissue VALUE selections yet."
      family="jump"
      probabilityHeading="Jump Tissue probability"
      rows={races.map((race) => {
        const leader = race.runners.find((runner) => runner.runnerId === race.top1);
        const runnerId = leader?.runnerId ?? race.top1 ?? "";
        return {
          key: race.raceId,
          family: "jump" as const,
          raceId: race.raceId,
          runnerId,
          raceDate: race.raceDate,
          currentOffAt: race.currentOffAt,
          scheduledTime: race.scheduledTime,
          course: race.course,
          horseName: leader?.horseName ?? "-",
          probability: leader?.probability ?? null,
          prices: race.prices,
          finalSp: leader?.outcome?.finalSp ?? null,
          profit: race.prices.t60 ? race.selectedPriceProfitLoss.t60 : race.prices.t180 ? race.selectedPriceProfitLoss.t180 : race.selectedPriceProfitLoss.early,
          status: statusLabel(race.settledAt, leader?.outcome?.won ?? null),
          resultLabel: resultLabel(leader?.outcome ?? null),
          selectionResult: selectionResultLabel(leader?.outcome?.won ?? null),
          settled: race.settledAt !== null,
          defaultOutcomeSummary: outcomeSummaryFromLeader(leader?.outcome ?? null),
          review: runnerId ? reviewByKey.get(tissueValueReviewKey({ family: "jump", raceId: race.raceId, runnerId })) ?? null : null,
        };
      })}
    />
  </DiagnosticDetails>;
}

function DiagnosticDetails({ children, headingId, summaryItems, title }: {
  children: React.ReactNode;
  headingId: string;
  summaryItems: Array<[string, number]>;
  title: string;
}) {
  return <section className="mt-8" aria-labelledby={headingId}>
    <details className="border border-slate-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-lg font-semibold text-slate-950" id={headingId}>{title}</summary>
      <div className="border-t border-slate-200 px-4 py-4">
        <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
          {summaryItems.map(([label, count]) => <div key={label}><dt className="text-slate-600">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{count}</dd></div>)}
        </dl>
        <p className="mt-4 text-xs text-slate-600">Newest first. Showing up to 100 observations.</p>
        {children}
      </div>
    </details>
  </section>;
}

type TissueTableRow = {
  key: string;
  family: TissueValueReviewFamily;
  raceId: string;
  runnerId: string;
  raceDate: string;
  currentOffAt: string;
  scheduledTime: string;
  course: string;
  horseName: string;
  probability: number | null;
  prices: { early: ForwardValuePriceSnapshot | null; t180: ForwardValuePriceSnapshot | null; t60: ForwardValuePriceSnapshot | null };
  finalSp: number | null;
  profit: number | null;
  status: string;
  resultLabel: string;
  selectionResult: "WIN" | "LOSS" | "VOID";
  settled: boolean;
  defaultOutcomeSummary: OutcomeSummary;
  review: TissueValueReview | null;
};

function TissueTable({ emptyText, family, probabilityHeading, rows }: { emptyText: string; family: TissueValueReviewFamily; probabilityHeading: string; rows: TissueTableRow[] }) {
  return <div className="mt-3 overflow-x-auto border border-slate-200 bg-white">
    <table className="w-full min-w-[1440px] text-left text-xs">
      <thead className="bg-slate-100 text-[10px] uppercase text-slate-600"><tr>
        {["Date / time", "Course / horse", probabilityHeading, "Median bookmaker", "Implied", "Edge", "Best", "Forecast", "Quotes", "Early", "T-180", "T-60", "Final SP", "Median P/L", "Settlement/status", "Review"].map((label) => <th key={label} className="px-2 py-2 font-semibold">{label}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-slate-200">
        {!rows.length ? <tr><td colSpan={16} className="px-2 py-5 text-slate-500">{emptyText}</td></tr> : rows.map((row) => {
          const price = row.prices.t60 ?? row.prices.t180 ?? row.prices.early;
          return <tr key={row.key}>
            <td className="whitespace-nowrap px-2 py-2">{row.raceDate}<br />{formatRaceTimeForDisplay({ raceDateTime: new Date(row.currentOffAt), scheduledTime: row.scheduledTime })}</td>
            <td className="px-2 py-2"><span className="font-medium">{row.course}</span><br />{row.horseName}<ReviewTagSummary review={row.review} /></td>
            <td className="px-2 py-2 tabular-nums">{pct(row.probability)}</td>
            <td className="px-2 py-2 tabular-nums">{decimal(price?.decimalPrice)}</td>
            <td className="px-2 py-2 tabular-nums">{pct(price?.impliedProbability)}</td>
            <td className="px-2 py-2 tabular-nums">{price ? `${price.ratingEdgePercentagePoints.toFixed(2)}pp` : "-"}</td>
            <td className="px-2 py-2 tabular-nums" title={price?.bestBookmakerName ?? undefined}>{decimal(price?.bestBookmakerPriceDecimal)}</td>
            <td className="px-2 py-2">{price?.forecastPrice ?? "-"}</td>
            <td className="px-2 py-2 tabular-nums">{price?.bookmakerQuoteCount ?? 0}</td>
            <TissueSnapshot snapshot={row.prices.early} /><TissueSnapshot snapshot={row.prices.t180} /><TissueSnapshot snapshot={row.prices.t60} />
            <td className="px-2 py-2 tabular-nums">{decimal(row.finalSp)}</td>
            <td className="px-2 py-2 tabular-nums">{money(row.profit)}</td>
            <td className="px-2 py-2 font-medium">{row.status}</td>
            <td className="w-[260px] px-2 py-2"><ReviewCell row={row} family={family} /></td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

function TissueSnapshot({ snapshot }: { snapshot: ForwardValuePriceSnapshot | null }) {
  return <td className="px-2 py-2 tabular-nums">{snapshot ? <details>
    <summary className="cursor-pointer">{snapshot.decimalPrice.toFixed(2)}</summary>
    <div className="mt-1 whitespace-nowrap text-[11px] text-slate-600">
      <p>{snapshot.capturedAt}</p>
      <p>Edge {snapshot.ratingEdgePercentagePoints.toFixed(2)}pp</p>
      {(snapshot.bookmakerQuotes ?? []).map((quote, index) => <p key={`${quote.bookmakerId}:${index}`}>{quote.bookmakerName ?? "Bookmaker"}: {quote.decimalOdds.toFixed(2)}</p>)}
    </div>
  </details> : "-"}</td>;
}

function ReviewDiagnostics({ reviews }: { reviews: TissueValueReviewData }) {
  const summary = summarizeTissueValueReviews(reviews);
  const activeTags = POST_RACE_REVIEW_TAGS.filter((tag) => summary.tagCounts[tag] > 0);
  return <div className="mt-4 border border-slate-200 bg-slate-50 p-3">
    <h4 className="text-xs font-semibold uppercase text-slate-600">Post-race review diagnostics</h4>
    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs">
      <Metric label="Reviewed" value={summary.reviewed} />
      <Metric label="Reviewed losers" value={summary.reviewedLosers} />
      <Metric label="With tags" value={summary.taggedReviews} />
    </dl>
    {activeTags.length ? <table className="mt-3 w-full text-left text-[11px]">
      <thead className="text-[10px] uppercase text-slate-500"><tr>{["Tag", "Count", "Winner", "Placed", "Unplaced", "Non-runner"].map((heading) => <th key={heading} className="py-1 pr-3 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>
        {activeTags.map((tag) => {
          const results = summary.resultsByTag[tag];
          return <tr key={tag} className="border-t border-slate-200">
            <td className="py-1 pr-3">{REVIEW_TAG_LABELS[tag]}</td>
            <td className="py-1 pr-3 tabular-nums">{summary.tagCounts[tag]}</td>
            <td className="py-1 pr-3 tabular-nums">{results.winner}</td>
            <td className="py-1 pr-3 tabular-nums">{results.placed_non_winner}</td>
            <td className="py-1 pr-3 tabular-nums">{results.unplaced}</td>
            <td className="py-1 pr-3 tabular-nums">{results.non_runner}</td>
          </tr>;
        })}
      </tbody>
    </table> : <p className="mt-2 text-xs text-slate-500">No reviewed tags yet.</p>}
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><dt className="text-slate-600">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>;
}

function ReviewCell({ row, family }: { row: TissueTableRow; family: TissueValueReviewFamily }) {
  if (!row.settled || !row.runnerId) return <span className="text-slate-500">Pending</span>;
  const review = row.review;
  const status = review?.status ?? "not_reviewed";
  const outcome = review?.outcomeSummary ?? row.defaultOutcomeSummary;
  return <details>
    <summary className="cursor-pointer whitespace-nowrap font-medium text-emerald-800">
      {status === "reviewed" ? "View / edit review" : "Add review"}
      {status === "reviewed" ? <span className="ml-2 font-normal text-slate-500">Note added</span> : null}
    </summary>
    <form action={saveTissueValueReviewAction} className="mt-2 w-[360px] space-y-3 border border-slate-200 bg-white p-3 shadow-sm">
      <input type="hidden" name="family" value={family} />
      <input type="hidden" name="raceId" value={row.raceId} />
      <input type="hidden" name="runnerId" value={row.runnerId} />
      <input type="hidden" name="status" value="reviewed" />
      <input type="hidden" name="outcomeSummary" value={outcome} />
      <ReviewContext row={row} family={family} />
      <ReviewTagGroup tags={POST_RACE_REVIEW_TAGS} selected={review?.tags ?? []} />
      <label className="block text-[11px] font-semibold text-slate-600">
        Note
        <textarea
          name="note"
          defaultValue={review?.note ?? ""}
          maxLength={TISSUE_VALUE_REVIEW_NOTE_MAX_LENGTH}
          rows={4}
          className="mt-1 w-full border border-slate-300 px-2 py-1 text-xs"
        />
      </label>
      <button type="submit" className="border border-emerald-700 bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800">Save review</button>
    </form>
  </details>;
}

function ReviewContext({ row, family }: { row: TissueTableRow; family: TissueValueReviewFamily }) {
  const price = row.prices.t60 ?? row.prices.t180 ?? row.prices.early;
  const items: Array<[string, string]> = [
    ["Horse", row.horseName],
    ["Date", row.raceDate],
    ["Course", row.course],
    ["Race time", formatRaceTimeForDisplay({ raceDateTime: new Date(row.currentOffAt), scheduledTime: row.scheduledTime })],
    ["Family", familyLabel(family)],
    ["Tissue probability", pct(row.probability)],
    ["Qualifying price", decimal(price?.decimalPrice)],
    ["Finishing position/result", row.resultLabel],
    ["Settlement", row.selectionResult],
    ["£1 P/L", money(row.profit)],
  ];
  return <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border border-slate-200 bg-slate-50 p-2 text-[11px]">
    {items.map(([label, value]) => <div key={label}>
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{value}</dd>
    </div>)}
  </dl>;
}

function ReviewTagGroup({ selected, tags }: { selected: ReviewTag[]; tags: readonly ReviewTag[] }) {
  const selectedTags = new Set(selected);
  return <fieldset className="space-y-1">
    <legend className="text-[11px] font-semibold text-slate-600">Tags</legend>
    <div className="grid grid-cols-2 gap-1">
      {tags.map((tag) => <label key={tag} className="flex items-start gap-2 text-[11px] text-slate-700">
        <input type="checkbox" name="tags" value={tag} defaultChecked={selectedTags.has(tag)} className="mt-0.5" />
        <span>{REVIEW_TAG_LABELS[tag]}</span>
      </label>)}
    </div>
  </fieldset>;
}

function ReviewTagSummary({ review }: { review: TissueValueReview | null }) {
  if (!review || review.status !== "reviewed") return null;
  const tags = review.tags.slice(0, 3);
  return <div className="mt-1 text-[11px] text-slate-500">
    <span className="font-medium text-slate-600">Reviewed</span>
    {tags.length ? `: ${tags.map((tag) => REVIEW_TAG_LABELS[tag]).join(", ")}${review.tags.length > tags.length ? "..." : ""}` : ""}
  </div>;
}

function reviewsForFamily(data: TissueValueReviewData, family: TissueValueReviewFamily): TissueValueReviewData {
  return { ...data, reviews: data.reviews.filter((review) => review.family === family) };
}

function isSettledTissueValueRace(race: { settledAt: string | null; prices: TissueTableRow["prices"] }) {
  const price = race.prices.t60 ?? race.prices.t180 ?? race.prices.early;
  return race.settledAt !== null && price !== null && price.ratingEdgePercentagePoints > 0;
}

function isTurfTissueValueSelection(record: ForwardValueRecord): boolean {
  return record.family === "turf" &&
    record.settledAt !== null &&
    record.tissueRunnerId !== null &&
    record.tissueHorseName !== null &&
    record.tissueProbability !== null &&
    record.tissueCapturedDecimalOdds !== null &&
    record.tissueCapturedDecimalOdds !== undefined &&
    record.tissueEdgePercentagePoints !== null &&
    record.tissueEdgePercentagePoints !== undefined &&
    record.tissueEdgePercentagePoints > 0;
}

function fallbackTurfPriceSnapshot(record: ForwardValueRecord, capturedAt: string): ForwardValuePriceSnapshot | null {
  if (record.tissueCapturedDecimalOdds == null || record.tissueProbability == null) return null;
  const impliedProbability = record.tissueMarketProbability ?? 1 / record.tissueCapturedDecimalOdds;
  return {
    price: record.tissueCapturedPrice ?? null,
    decimalPrice: record.tissueCapturedDecimalOdds,
    impliedProbability,
    capturedAt,
    minutesBeforeScheduledOff: record.minutesBeforeScheduledOff ?? 0,
    ratingProbability: record.tissueProbability,
    ratingEdgePercentagePoints: record.tissueEdgePercentagePoints ?? (record.tissueProbability - impliedProbability) * 100,
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
    bookmakerQuoteCount: record.tissueBookmakerQuoteCount ?? record.tissueBookmakerQuotes?.length ?? 0,
    bookmakerQuotes: record.tissueBookmakerQuotes ?? [],
    bestBookmakerPriceDecimal: record.tissueBestBookmakerPriceDecimal ?? null,
    bestBookmakerPriceFractional: record.tissueBestBookmakerPriceFractional ?? null,
    bestBookmakerName: record.tissueBestBookmakerName ?? null,
    forecastPrice: record.tissueForecastPrice ?? null,
    forecastDecimalPrice: record.tissueForecastDecimalPrice ?? null,
  };
}

function outcomeSummaryFromTurfTissueRecord(record: ForwardValueRecord): OutcomeSummary {
  if (record.settledAt === null || record.tissueRunnerId === null) return "non_runner";
  return record.winnerRunnerIds.includes(record.tissueRunnerId) ? "winner" : "unplaced";
}

function turfTissueStatusLabel(record: ForwardValueRecord) {
  if (record.settledAt === null) return "Pending";
  if (record.tissueRunnerId === null) return "Settled";
  return record.winnerRunnerIds.includes(record.tissueRunnerId) ? "Won" : "Lost";
}

function turfTissueResultLabel(record: ForwardValueRecord) {
  if (record.tissueRunnerId === null) return "Void";
  if (record.winnerRunnerIds.includes(record.tissueRunnerId)) return "Finished 1";
  return record.leaderResultStatus ?? "Lost";
}

function turfTissueSelectionResult(record: ForwardValueRecord): "WIN" | "LOSS" | "VOID" {
  if (record.tissueRunnerId === null) return "VOID";
  return record.winnerRunnerIds.includes(record.tissueRunnerId) ? "WIN" : "LOSS";
}

function outcomeSummaryFromLeader(outcome: { resultStatus: string | null; finishingPosition: number | null; won: boolean | null } | null): OutcomeSummary {
  if (!outcome || outcome.resultStatus === "non_runner" || outcome.won === null) return "non_runner";
  if (outcome.won === true) return "winner";
  if (outcome.finishingPosition !== null && outcome.finishingPosition > 1 && outcome.finishingPosition <= 3) return "placed_non_winner";
  return "unplaced";
}

function newestFirst(left: { recordedAt: string }, right: { recordedAt: string }) {
  return right.recordedAt.localeCompare(left.recordedAt);
}

function statusLabel(settledAt: string | null, won: boolean | null) {
  if (settledAt === null) return "Pending";
  return won === null ? "Settled" : won ? "Won" : "Lost";
}

function resultLabel(outcome: { resultStatus: string | null; finishingPosition: number | null; won: boolean | null } | null) {
  if (!outcome || outcome.resultStatus === "non_runner" || outcome.won === null) return "Void";
  if (outcome.finishingPosition !== null) return `Finished ${outcome.finishingPosition}`;
  return outcome.resultStatus ?? "Settled";
}

function selectionResultLabel(won: boolean | null): "WIN" | "LOSS" | "VOID" {
  if (won === null) return "VOID";
  return won ? "WIN" : "LOSS";
}

function familyLabel(family: TissueValueReviewFamily) {
  if (family === "aw") return "AW Tissue";
  if (family === "jump") return "Jump Tissue";
  return "Turf Tissue";
}

function money(value: number | null | undefined) { return value == null ? "-" : `${value >= 0 ? "+" : "-"}£${Math.abs(value).toFixed(2)}`; }
function decimal(value: number | null | undefined) { return value == null ? "-" : value.toFixed(2); }
function pct(value: number | null | undefined) { return value == null ? "-" : `${(value * 100).toFixed(1)}%`; }
