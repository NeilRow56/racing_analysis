import assert from "node:assert/strict";
import { test } from "node:test";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyHurdleRecency } from "@/lib/racing/hurdle-recency-forward";
import { emptyHurdlePair } from "@/lib/racing/hurdle-tissue-challenger-forward";
import { emptyChasePair } from "@/lib/racing/chase-tissue-challenger-forward";
import { emptyAwTissuePairedForward } from "@/lib/racing/aw-tissue-paired-forward";
import { RESEARCH_SIGNALS, type ResearchDashboard, type ResearchSignalKind } from "@/lib/racing/research-monitor";
import { ResearchPageLayout } from "./research-page-layout";
import { DailyResearchDashboard, ResearchHistory, SecondaryResearchMonitoring } from "./research-dashboard";
import { HurdleRecencyResearchSection } from "./hurdle-recency-research";
import { HurdleTissueChallengerSection } from "./hurdle-tissue-challenger";
import { ChaseTissueChallengerSection } from "./chase-tissue-challenger";
import { AwTurfChallengerSection } from "./aw-turf-challenger";

type NodeProps = { id?: string; open?: boolean; children?: ReactNode };
function elements(node: ReactNode): ReactElement<NodeProps>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<NodeProps>(child) ? [child, ...elements(child.props.children)] : []);
}
function fixture(): ResearchDashboard {
  const horse = (id: string, kinds: ResearchSignalKind[]) => ({ raceId: `race-${id}`, runnerId: id, horseId: `horse-${id}`, horseName: id,
    course: "Teston", time: "14:00", sortTime: "2026-10-17T13:00:00Z", price: 8, priceSource: "stored_snapshot" as const,
    signals: kinds.map((kind) => ({ kind, reason: `${kind} saved reason`, context: `${kind} saved context`, movement: null })) });
  const monitor = (name: string) => ({ name, status: "SHADOW" as const, tracked: 24, settled: 20, winners: 4, strike: .2, ae: .9, roi: .15,
    roiBasis: "qualifying_median" as const, pricedSettled: 20, profitLoss: 3, cohort: "Saved prospective cohort" });
  return { date: "2026-10-17", emptyMessage: null, horses: [horse("Tissue Horse", ["turf_tissue"]), horse("Weight Horse", ["todays_rating_weight"]),
    horse("Overlap Horse", ["todays_rating_weight", "jump_g4"]), horse("Disagreement Horse", ["model_disagreement"])],
    monitors: [monitor("Turf Tissue"), monitor("Jump Tissue"), monitor("AW Tissue"), monitor("Jump G4"), monitor(RESEARCH_SIGNALS.todays_rating_weight.name)],
    historicalTissueMonitors: [monitor("Saved Turf History")], hurdleValueMonitor: monitor("Hurdle Tissue"), hurdleValues: [], longPriceShadows: [] };
}
function view(dashboard = fixture()) {
  return ResearchPageLayout({ date: dashboard.date, active: <HurdleRecencyResearchSection data={emptyHurdleRecency()} />,
    secondary: <SecondaryResearchMonitoring dashboard={dashboard} />,
    children: <>
      <DailyResearchDashboard dashboard={dashboard} excludeSecondaryMonitoring>
        <AwTurfChallengerSection data={emptyAwTissuePairedForward()} date={dashboard.date} />
      </DailyResearchDashboard>
      <HurdleTissueChallengerSection data={emptyHurdlePair()} date={dashboard.date} />
      <ChaseTissueChallengerSection data={emptyChasePair()} date={dashboard.date} />
      <details><summary>Performance</summary>Saved Tissue aggregate performance</details>
      <details><summary>Details · model comparisons and value records</summary><ResearchHistory /></details>
    </> });
}
function openArchive(node: ReactNode): ReactNode {
  return Children.map(node, (child) => isValidElement<NodeProps>(child)
    ? cloneElement(child, { ...(child.props.id === "archived-research" ? { open: true } : {}), children: openArchive(child.props.children) }) : child);
}

test("active research stays outside disclosures and is the first research section", () => {
  const tree = view(), nodes = elements(tree), active = nodes.find((n) => n.props.id === "active-research-heading");
  assert.ok(active);
  const activeSection = nodes.find((n) => n.type === "section" && elements(n.props.children).some((child) => child.props.id === "active-research-heading"));
  assert.ok(activeSection);
  assert.equal(elements(activeSection).some((n) => n.type === HurdleRecencyResearchSection), true);
  for (const details of nodes.filter((n) => n.type === "details")) {
    assert.equal(elements(details).some((n) => n.type === HurdleRecencyResearchSection), false);
  }
  const html = renderToStaticMarkup(tree);
  assert.match(html, /ACTIVE RESEARCH/);
  assert.ok(html.indexOf("active-research-heading") < html.indexOf('id="secondary-monitoring"'));
  assert.ok(html.indexOf("Hurdle Recency / Completion Research") < html.indexOf('id="archived-research"'));
  assert.match(html, /Not a betting signal/);
  assert.match(html, /TOO EARLY/);
  assert.match(html, /Recent frozen observations/);
});

test("secondary and legacy disclosures are closed by default with clear research-status wording", () => {
  const tree = view(), nodes = elements(tree), html = renderToStaticMarkup(tree);
  for (const id of ["secondary-monitoring", "archived-research"]) {
    const disclosure = nodes.find((n) => n.type === "details" && n.props.id === id);
    assert.ok(disclosure);
    assert.equal(disclosure.props.open, undefined);
    assert.doesNotMatch(html.match(new RegExp(`<details[^>]*id="${id}"[^>]*>`))![0], /\bopen\b/);
  }
  assert.match(html, /ARCHIVED \/ LEGACY RESEARCH/);
  const secondary = nodes.find((n) => n.props.id === "secondary-monitoring")!;
  const archive = nodes.find((n) => n.props.id === "archived-research")!;
  const summaryHtml = (node: ReactElement<NodeProps>) => renderToStaticMarkup(elements(node.props.children).find((n) => n.type === "summary")!);
  assert.match(summaryHtml(secondary), /Today&#x27;s Rating - Lighter Weight/);
  assert.match(summaryHtml(archive), /Tissue VALUE, model monitors, challengers and research history/);
  assert.match(html, /These are not current active research signals/);
  assert.match(html, /did not establish a robust betting edge/);
  assert.doesNotMatch(html, /Daily Tissue VALUE first|<h1[^>]*>Tissue VALUE Monitor/);
});

test("date and utility navigation remain above active research and outside archive", () => {
  const tree = view(), html = renderToStaticMarkup(tree);
  const nav = elements(tree).find((n) => n.type === "nav");assert.ok(nav);
  const navigation = renderToStaticMarkup(nav);
  assert.match(navigation, /2026-10-17/);assert.match(navigation, /Refresh/);assert.match(navigation, /Research Filters/);assert.match(navigation, /Today&#x27;s Racing/);
  assert.match(navigation, /href="\/racing\/today"/);assert.match(navigation, /href="\/racing\/research"/);
  assert.ok(html.indexOf("<nav") < html.indexOf("active-research-heading"));
  const archive = elements(tree).find((n) => n.props.id === "archived-research")!;
  assert.doesNotMatch(renderToStaticMarkup(archive), /<nav/);
});

test("opening native archive retains Tissue VALUE, historical monitors, all shadows and challengers", () => {
  const tree = view(); const archive = elements(tree).find((n) => n.props.id === "archived-research")!;
  const html = renderToStaticMarkup(openArchive(tree));
  assert.match(html, /<details(?=[^>]*id="archived-research")(?=[^>]*open="")[^>]*>/);
  const archiveHtml = renderToStaticMarkup(archive);
  for (const text of ["Today&#x27;s Tissue VALUE", "Turf VALUE", "Jump VALUE", "AW VALUE", "Hurdle VALUE", "Settled Tissue VALUE Today",
    "Historical rank-one Tissue evidence", "Saved Turf History", "Prospective monitors", "Turf Tissue", "Jump Tissue", "AW Tissue", "Jump G4",
    "LONG-PRICE SHADOWS", "HURDLE LONG-PRICE SHADOW", "TURF LONG-PRICE SHADOW", "AW LONG-PRICE SHADOW",
    "AW LONGSHOT TRAINER/JOCKEY CHALLENGER", "HURDLE TISSUE CHALLENGER", "CHASE TISSUE CHALLENGER", "Model / Market Disagreement",
    "Performance", "Details · model comparisons and value records", "Saved rule research"]) {
    assert.ok(archiveHtml.includes(text), `Archived content retained: ${text}`);
  }
  assert.ok(archiveHtml.includes("Tissue Horse"));assert.ok(archiveHtml.includes("Disagreement Horse"));
});

test("lighter-weight monitor and every overlapping weight signal move only to secondary monitoring", () => {
  const dashboard = fixture(), tree = view(dashboard), nodes = elements(tree);
  const secondary = nodes.find((n) => n.props.id === "secondary-monitoring")!, archive = nodes.find((n) => n.props.id === "archived-research")!;
  const secondaryHtml = renderToStaticMarkup(secondary), archiveHtml = renderToStaticMarkup(archive);
  assert.match(secondaryHtml, /Today&#x27;s Rating - Lighter Weight/);assert.match(secondaryHtml, /Weight Horse/);assert.match(secondaryHtml, /Overlap Horse/);
  assert.match(secondaryHtml, /24 \/ 20/);assert.match(secondaryHtml, /Market A\/E/);assert.match(secondaryHtml, /Qualifying median ROI/);
  assert.doesNotMatch(secondaryHtml, /Tissue Horse|jump_g4 saved reason|Disagreement Horse/);
  assert.doesNotMatch(archiveHtml, /Weight Horse|todays_rating_weight saved reason/);
  assert.match(archiveHtml, /Overlap Horse/);assert.match(archiveHtml, /jump_g4 saved reason/);
});

test("presentational separation preserves every supplied observation, monitor and numeric result unchanged", () => {
  const dashboard = fixture();
  dashboard.horses.push({ ...dashboard.horses[0]!, runnerId: "both", horseName: "Tissue and Weight", signals: [
    ...dashboard.horses[0]!.signals, { kind: "todays_rating_weight", reason: "Separate weight context", context: "Frozen context", movement: null },
  ] });
  const before = structuredClone(dashboard);
  renderToStaticMarkup(view(dashboard));
  assert.deepEqual(dashboard, before);
  const secondary = renderToStaticMarkup(<SecondaryResearchMonitoring dashboard={dashboard} />);
  const legacy = renderToStaticMarkup(<DailyResearchDashboard dashboard={dashboard} excludeSecondaryMonitoring />);
  assert.match(secondary, /Separate weight context/);assert.match(secondary, /Tissue and Weight/);
  assert.match(legacy, /Tissue and Weight/);assert.doesNotMatch(legacy, /Separate weight context/);
  assert.match(legacy, /P\/L \+£3\.00/);assert.match(legacy, /ROI \+15\.0%/);
});
