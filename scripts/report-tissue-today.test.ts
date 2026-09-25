import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { TISSUE_V2_CONFIG, type TissueForwardData } from "@/lib/racing/tissue-forward";
import { reportTissueToday } from "./report-tissue-today";

test("today command reads the v2 tracker without changing a byte", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tissue-today-command-"));
  try {
    const path = join(directory, "forward.json");
    const bytes = `${JSON.stringify(data(), null, 2)}\n`;
    await writeFile(path, bytes, "utf8");
    let written = "";

    const output = await reportTissueToday(path, (value) => { written = value; }, async (raceDate) => {
      assert.equal(raceDate, "2026-09-25");
      return [{
        raceId: "race-1",
        runnerId: "runner-1",
        estimatedSp: "5/1",
        estimatedDecimalOdds: "6.000",
        displayRaceTime: "15:10",
      }];
    });

    assert.equal(written, output);
    assert.match(output, /Tissue Today - 2026-09-25/);
    assert.match(output, /15:10 Newmarket/);
    assert.match(output, /Tissue 40\.0% \| Est SP 5\/1 \| Market 16\.7% \| Edge \+23\.3pp \| VALUE/);
    assert.equal(await readFile(path, "utf8"), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function data(): TissueForwardData {
  return {
    version: TISSUE_V2_CONFIG.forwardVersion,
    tissueModelVersion: TISSUE_V2_CONFIG.modelVersion,
    forwardStart: TISSUE_V2_CONFIG.forwardStart,
    forwardStartAt: TISSUE_V2_CONFIG.forwardStartAt,
    races: [{
      raceDate: "2026-09-25",
      course: "Newmarket",
      raceTime: "14:10",
      raceId: "race-1",
      sourceId: "source-1",
      raceName: "Example Stakes",
      tissueModelVersion: TISSUE_V2_CONFIG.modelVersion,
      tissueModelChecksum: "checksum",
      recordedAt: "2026-09-25T10:00:00.000Z",
      recordedPreRace: true,
      runners: [runner("Horse A", 1, 0.4)],
      winners: [],
      settledAt: null,
    }],
  };
}

function runner(horseName: string, tissueRank: number, probability: number) {
  return {
    runnerId: `runner-${tissueRank}`,
    horseId: `horse-${tissueRank}`,
    horseName,
    probability,
    fairDecimalOdds: 1 / probability,
    tissueRank,
    commentFeatures: [],
    finishingPosition: null,
    finalSp: null,
    marketImpliedProbability: null,
    marketRank: null,
  };
}
