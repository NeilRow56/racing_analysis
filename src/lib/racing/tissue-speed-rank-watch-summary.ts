import { isTissueTop2SpeedRankWatch } from "./tissue-speed-rank-watch";
import { summarizeProspectiveTissue, TISSUE_PROSPECTIVE_START, type ProspectiveTissueObservation } from "./tissue-prospective-summary";

// Existing frozen prospective books only. The hypothesis was declared on 24 October;
// 20–23 October results are discovery context, not independent confirmation.
export const TISSUE_SPEED_RANK_WATCH_START = TISSUE_PROSPECTIVE_START;
export const TISSUE_SPEED_RANK_WATCH_DECLARED = "2026-10-24";

export function summarizeTissueSpeedRankWatch(rows: ProspectiveTissueObservation[]) {
  const top2 = rows.filter(row => row.tissueRank === 1 || row.tissueRank === 2);
  return {
    watch: summarizeProspectiveTissue(top2.filter(isTissueTop2SpeedRankWatch)),
    complement: summarizeProspectiveTissue(top2.filter(row => !isTissueTop2SpeedRankWatch(row))),
    missingSpeedRank: top2.filter(row => row.bestL3SpeedRank == null).length,
  };
}
