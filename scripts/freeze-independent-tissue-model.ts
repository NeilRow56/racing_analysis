import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { loadBacktestFeatureCache } from "@/lib/racing/backtest-cache";
import {
  COMMENT_FEATURE_NAMES,
  EPOCHS,
  L2,
  NUMERIC_FEATURES,
  buildExamples,
  fitModel,
  loadHistoricalComments,
} from "./diagnose-independent-tissue-feasibility";

const OUTPUT = "data/research/tissue-model-v1.json";
const VERSION = "independent_tissue_numeric_comments_v1_2025";

const cache = await loadBacktestFeatureCache({
  from: "2025-01-01",
  to: "2025-12-31",
  family: "turf_flat",
});
if (!cache) throw new Error("The frozen 2025 Turf cache is required");

const connection = createDbConnection();
try {
  const comments = await loadHistoricalComments(connection.client);
  const examples = buildExamples(cache.rows, comments);
  const model = fitModel(examples, true);
  const specification = {
    numericFeatures: NUMERIC_FEATURES.map(([name]) => name),
    commentFeatures: COMMENT_FEATURE_NAMES,
    epochs: EPOCHS,
    l2: L2,
    probabilityNormalisation: "race_softmax",
    priorCommentLimit: 3,
    chronology: "prior_comment_race_datetime_lt_target_race_datetime",
  };
  const checksum = createHash("sha256")
    .update(JSON.stringify({ specification, model }))
    .digest("hex");
  await writeFile(OUTPUT, `${JSON.stringify({
    version: VERSION,
    trainedAt: new Date().toISOString(),
    trainingWindow: { from: "2025-01-01", to: "2025-12-31" },
    trainingSample: { races: new Set(examples.map((example) => example.raceId)).size, runners: examples.length },
    sourceCache: { generatedAt: cache.manifest.generatedAt, featureSchemaVersion: cache.manifest.featureSchemaVersion },
    specification,
    checksum,
    model,
  }, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUTPUT} (${VERSION}, ${checksum})`);
} finally {
  await connection.client.end();
}
