import { writeFile } from "node:fs/promises";
import { loadAwTissueForward } from "@/lib/racing/aw-tissue-forward";
import { loadForwardValueData } from "@/lib/racing/forward-value";
import { loadJumpTissueForward } from "@/lib/racing/jump-tissue-forward";
import {
  auditRankOneSelections,
  awTissueRankOneSelections,
  forwardValueRankOneSelections,
  jumpTissueRankOneSelections,
  renderRankOneAudit,
  turfTissueRankOneSelections,
} from "@/lib/racing/rank-one-diagnostics";
import { loadTissueForward, TISSUE_V2_CONFIG } from "@/lib/racing/tissue-forward";

const DEFAULT_OUTPUT = "data/research/rank-one-failure-diagnostic.md";

async function main() {
  const outputPath = process.argv[2] ?? DEFAULT_OUTPUT;
  const [forwardValue, turfTissueV2, jumpTissue, awTissue] = await Promise.all([
    loadForwardValueData(),
    loadTissueForward(TISSUE_V2_CONFIG.forwardPath, TISSUE_V2_CONFIG),
    loadJumpTissueForward(),
    loadAwTissueForward(),
  ]);
  const selections = [
    ...forwardValueRankOneSelections(forwardValue),
    ...turfTissueRankOneSelections(turfTissueV2, "Turf Tissue v2"),
    ...jumpTissueRankOneSelections(jumpTissue),
    ...awTissueRankOneSelections(awTissue),
  ];
  const report = renderRankOneAudit(auditRankOneSelections(selections));
  await writeFile(outputPath, report, "utf8");
  console.log(`Wrote ${outputPath}`);
}

await main();
