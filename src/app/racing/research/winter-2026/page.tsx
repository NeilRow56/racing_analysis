import { loadWinterResearch } from "@/lib/racing/winter-research-sources";
import { WinterResearchDashboard } from "./dashboard";
import { ChaseShadowPanel } from "./chase-shadow";
import { loadChaseShadow } from "@/lib/racing/chase-shadow-forward";
import { loadChaseShadowModel } from "@/lib/racing/chase-shadow-model";
import { summarizeChaseShadow } from "@/lib/racing/chase-shadow-summary";

export const dynamic = "force-dynamic";

export default async function WinterResearchPage() {
  const [{ summary, quarantined }, shadow] = await Promise.all([loadWinterResearch(), loadChaseShadow(), loadChaseShadowModel()]);
  return <WinterResearchDashboard summary={summary} quarantined={quarantined.length} shadowPanel={<ChaseShadowPanel summary={summarizeChaseShadow(shadow)} />} />;
}
