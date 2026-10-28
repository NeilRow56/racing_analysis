import { loadJumpTissueForward } from "@/lib/racing/jump-tissue-forward";
import { loadAwV2Forward } from "@/lib/racing/aw-tissue-v2";
import { loadTissueForward, ACTIVE_TURF_TISSUE_CONFIG } from "@/lib/racing/tissue-forward";
import { loadAllTissueValue } from "@/lib/racing/tissue-value-readers";
import { buildProspectiveTissueSources } from "@/lib/racing/tissue-prospective-sources";
import { attachChaseSpeedState, loadChaseSpeedSnapshots } from "@/lib/racing/chase-speed-reliability-capture";
import { CHASE_SPEED_RELIABILITY_DECLARED, CHASE_SPEED_RELIABILITY_EPOCH, summarizeChaseSpeedReliability } from "@/lib/racing/chase-speed-reliability-shadow";

// Read-only: no database, capture, settlement, history reconstruction or backfill.
const [jump, aw, turf, cohorts, snapshots] = await Promise.all([
  loadJumpTissueForward(), loadAwV2Forward(), loadTissueForward(ACTIVE_TURF_TISSUE_CONFIG.forwardPath, ACTIVE_TURF_TISSUE_CONFIG), loadAllTissueValue(), loadChaseSpeedSnapshots(),
]);
const sources = buildProspectiveTissueSources({ jump, aw, turf, cohorts });
console.log(JSON.stringify({ declared: CHASE_SPEED_RELIABILITY_DECLARED, epoch: CHASE_SPEED_RELIABILITY_EPOCH,
  comparison: "HIGH vs MEDIUM/LOW", periods: summarizeChaseSpeedReliability(attachChaseSpeedState(sources.observations, snapshots, "primary"), attachChaseSpeedState(sources.priceObservations, snapshots, "price")),
}, null, 2));
