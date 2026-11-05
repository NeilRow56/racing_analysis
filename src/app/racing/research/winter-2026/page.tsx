import { loadWinterResearch } from "@/lib/racing/winter-research-sources";
import { WinterResearchDashboard } from "./dashboard";
import { ChaseShadowPanel } from "./chase-shadow";
import { loadChaseShadow } from "@/lib/racing/chase-shadow-forward";
import { loadChaseShadowModel } from "@/lib/racing/chase-shadow-model";
import { summarizeChaseShadow } from "@/lib/racing/chase-shadow-summary";

export const dynamic = "force-dynamic";

export default async function WinterResearchPage() {
  const [{ summary, quarantined }, shadow] = await Promise.all([loadWinterResearch(), loadChaseShadow(), loadChaseShadowModel()]);
  return <><aside className="border-b border-amber-300 bg-amber-50 p-4 text-sm"><strong>ARCHIVED TISSUE RESEARCH</strong> · Historical observations and pending settlements only. New captures are retired; the clean active Tissue monitor is on <a className="underline" href="/racing/research/forward-value">Racing Research</a>.</aside>
    <WinterResearchDashboard summary={summary} quarantined={quarantined.length} shadowPanel={<ChaseShadowPanel summary={summarizeChaseShadow(shadow)} />} /></>;
}
