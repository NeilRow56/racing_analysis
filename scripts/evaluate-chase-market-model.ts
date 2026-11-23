/** Read-only research. Prints a reproducible JSON report to stdout. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CHASE_T3_REVIEW_CUTOFF, chaseT3Books, dateClusterInterval, describeChaseRaceContexts, describeMatchedChase, frozenFeature,
  mean, recordedStake, stakeSensitivity, sum, winnerCredit,
} from "../src/lib/racing/chase-t3-research";
import { assertEpochSources, loadEpochManifest, sha256 } from "../src/lib/racing/prospective-epoch-integrity";
import { loadTissueGeneration, type GenerationRace } from "../src/lib/racing/tissue-generation-forward";
import { loadTissueGenerationModels } from "../src/lib/racing/tissue-generation-model";
import { BADGE_PRICE_BANDS, tissueBadgePriceBand } from "../src/lib/racing/tissue-positive-neutral-method";
import type { TissueValueRace } from "../src/lib/racing/tissue-value-forward";
import { normalizeCompleteMarket } from "../src/lib/racing/tissue-value-metrics";
import { raceSoftmax } from "./diagnose-independent-tissue-feasibility";

const developmentPath = "data/research/tissue-generation-development-2026-11.json";
const manifestPath = "data/research/tissue-generation-2026-11-manifest.json";
const trainingCutoff = "2026-11-05T00:00:00.000Z";
const validationPeriods = ["2026-11-05 to 2026-11-11", "2026-11-12 to 2026-11-18"] as const;
const penalty = .05;
const predictors = ["official_rating", "best_l3_jump_speed"] as const;
type ExperimentBook = Pick<GenerationRace, "raceId" | "raceDate" | "capturedAt" | "scheduledOff" | "featureCutoffAt" | "featureNames" | "marketSource"> & {
  runners: Pick<GenerationRace["runners"][number], "runnerId" | "modelInputs" | "capturedPrice" | "probability" | "outcome">[];
};

export function predictionInputs(book: ExperimentBook) {
  const market = normalizeCompleteMarket(book.runners.map(runner => runner.capturedPrice));
  if (!market || book.marketSource !== "sporting_life_median_bookmaker_at_capture_v1" ||
    !(Date.parse(book.featureCutoffAt) <= Date.parse(book.capturedAt) && Date.parse(book.capturedAt) < Date.parse(book.scheduledOff)) ||
    new Set(book.runners.map(runner => runner.runnerId)).size !== book.runners.length ||
    !predictors.every(name => book.featureNames.includes(name) && book.featureNames.includes(`${name}_missing`))) return null;
  const columns = predictors.map(name => book.runners.map(runner => frozenFeature(book, runner, name)));
  const observed = columns.map(column => column.filter((value): value is number => value !== null));
  const x = book.runners.map((_, index) => columns.map((column, feature) => {
    const value = column[index], distribution = observed[feature];
    if (value === null || distribution.length < 2) return 0;
    const below = distribution.filter(other => other < value).length;
    const tied = distribution.filter(other => other === value).length;
    return (below + (tied - 1) / 2) / (distribution.length - 1) - .5;
  }));
  return { market: market.probabilities, x };
}

export function eligibleFields(books: ExperimentBook[], outcomeCutoff: string) {
  assert.equal(new Set(books.map(book => book.raceId)).size, books.length, "Duplicate race");
  return books.flatMap(book => {
    const inputs = predictionInputs(book);
    if (!inputs || book.runners.some(runner => runner.outcome?.status !== "settled" ||
      runner.outcome.winner === null || !(Date.parse(runner.outcome.settledAt) >= Date.parse(book.scheduledOff) &&
        Date.parse(runner.outcome.settledAt) <= Date.parse(outcomeCutoff)))) return [];
    const labels = book.runners.map(runner => winnerCredit(runner.outcome));
    if (Math.abs(sum(labels) - 1) > 1e-10) return [];
    return [{ book, ...inputs, labels }];
  });
}
type Field = ReturnType<typeof eligibleFields>[number];
export function chronologicalSplit(training: ExperimentBook[], validation: ExperimentBook[]) {
  const validationIds = new Set(validation.map(book => book.raceId));
  assert(training.every(book => Date.parse(book.scheduledOff) < Date.parse(trainingCutoff) && !validationIds.has(book.raceId)),
    "Training races must precede validation and have distinct IDs");
  assert(validation.every(book => Date.parse(book.capturedAt) >= Date.parse(trainingCutoff)), "Validation capture overlaps training");
  return { train: eligibleFields(training, trainingCutoff), validate: eligibleFields(validation, CHASE_T3_REVIEW_CUTOFF) };
}

type FitMode = "standalone" | "marketOffset";
export function predict(field: Pick<Field, "x" | "market">, weights: number[], mode: FitMode) {
  return raceSoftmax(field.x.map((row, index) =>
    sum(row.map((value, j) => value * weights[j])) + (mode === "marketOffset" ? Math.log(field.market[index]) : 0)));
}

function fit(fields: Field[], mode: FitMode) {
  let weights: number[] = predictors.map(() => 0);
  for (let iteration = 0; iteration < 400; iteration++) {
    const gradient = weights.map(weight => penalty * weight);
    for (const field of fields) {
      const probabilities = predict(field, weights, mode);
      field.x.forEach((row, i) => row.forEach((value, j) => {
        gradient[j] += (probabilities[i] - field.labels[i]) * value / fields.length;
      }));
    }
    if (Math.max(...gradient.map(Math.abs)) < 1e-9) return weights;
    weights = weights.map((weight, j) => weight - gradient[j]);
  }
  throw new Error(`Chase conditional logit did not converge for ${mode}`);
}

function compare(fields: Field[], standalone: number[], marketOffset: number[]) {
  const races = fields.map(field => {
    const { book, market, labels } = field;
    const forecasts = [
      market, book.runners.map(runner => runner.probability),
      predict(field, standalone, "standalone"), predict(field, marketOffset, "marketOffset"),
    ];
    const results = forecasts.map(probabilities => {
      assert(Math.abs(sum(probabilities) - 1) < 1e-10 && probabilities.every(p => p > 0));
      const selection = [...probabilities.keys()].sort((a, b) =>
        probabilities[b] - probabilities[a] || book.runners[a].runnerId.localeCompare(book.runners[b].runnerId))[0];
      return {
        probabilities, selection, winner: labels[selection] > 0, credit: labels[selection], expected: market[selection],
        logLoss: -sum(probabilities.map((p, i) => labels[i] * Math.log(p))),
        brier: sum(probabilities.map((p, i) => (p - labels[i]) ** 2)),
      };
    });
    const stakes = results.map(result => recordedStake(book.runners[result.selection]));
    return { field, results, stakes };
  });
  const labels = ["Captured market", "Chase V2 Tissue", "Form ranks", "Market + form ranks"];
  const monetary = races.filter(race => race.stakes.every(stake => stake !== null));
  return labels.map((label, index) => {
    const rows = races.map(race => race.results[index]);
    const credited = sum(rows.map(row => row.credit)), expected = sum(rows.map(row => row.expected));
    const runnerRows = races.flatMap(({ field, results }) => results[index].probabilities.map((p, i) => ({ p, y: field.labels[i] })));
    const edges = [0, .05, .1, .2, .4, .6, 1];
    return {
      label, races: rows.length, dates: new Set(races.map(race => race.field.book.raceDate)).size,
      winners: rows.filter(row => row.winner).length, credited, expected, marketAE: expected ? credited / expected : null,
      logLoss: mean(rows.map(row => row.logLoss)), brier: mean(rows.map(row => row.brier)),
      pairedLogLoss: mean(races.map(race => race.results[index].logLoss - race.results[0].logLoss)),
      pairedLogLossInterval: dateClusterInterval(races.map(race => ({
        date: race.field.book.raceDate, value: race.results[index].logLoss - race.results[0].logLoss, denominator: 1,
      }))),
      pairedBrier: mean(races.map(race => race.results[index].brier - race.results[0].brier)),
      pairedBrierInterval: dateClusterInterval(races.map(race => ({
        date: race.field.book.raceDate, value: race.results[index].brier - race.results[0].brier, denominator: 1,
      }))),
      calibration: edges.slice(1).map((upper, i) => {
        const bin = runnerRows.filter(row => row.p >= edges[i] && (row.p < upper || upper === 1));
        return { lower: edges[i], upper, n: bin.length, forecast: mean(bin.map(r => r.p)), actual: mean(bin.map(r => r.y)) };
      }),
      priced: rows.length, canonicalPriced: races.filter(race => race.stakes[index] !== null).length,
      stakeDates: new Set(monetary.map(race => race.field.book.raceDate)).size,
      stakedWinners: monetary.filter(race => race.stakes[index]?.winner).length,
      ...stakeSensitivity(monetary.map(race => race.stakes[index]!)),
      roiInterval: dateClusterInterval(monetary.map(race => ({
        date: race.field.book.raceDate, value: race.stakes[index]!.profit, denominator: 1,
      }))),
      priceBands: BADGE_PRICE_BANDS.map(band => {
        const bandRaces = races.filter(race => tissueBadgePriceBand(race.field.book.runners[race.results[index].selection].capturedPrice!) === band);
        const actual = sum(bandRaces.map(race => race.results[index].credit));
        const marketExpected = sum(bandRaces.map(race => race.results[index].expected));
        return { band, races: bandRaces.length, dates: new Set(bandRaces.map(race => race.field.book.raceDate)).size, actual, marketExpected,
          marketAE: marketExpected ? actual / marketExpected : null };
      }),
    };
  });
}

async function verifySources(developmentText: string) {
  const epoch = await loadEpochManifest();
  assert(epoch);
  await assertEpochSources(epoch);
  for (const [path, hash] of Object.entries(epoch.originalEvidenceHashes)) assert.equal(sha256(await readFile(path)), hash, path);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    models: Record<string, string>; auditDatasets: { path: string; sha256: string }[];
  };
  const models = await loadTissueGenerationModels();
  for (const model of Object.values(models)) assert.equal(model.checksum, manifest.models[model.family]);
  assert(manifest.auditDatasets.some(artifact => artifact.path === developmentPath));
  for (const artifact of manifest.auditDatasets) {
    const bytes = artifact.path === developmentPath ? developmentText : await readFile(artifact.path);
    assert.equal(sha256(bytes), artifact.sha256, artifact.path);
  }
  return { developmentSha256: sha256(developmentText), chaseModelChecksum: models.CHASE.checksum };
}

async function main() {
  const [developmentText, data] = await Promise.all([readFile(developmentPath, "utf8"), loadTissueGeneration()]);
  const sources = await verifySources(developmentText);
  const { races } = JSON.parse(developmentText) as { races: TissueValueRace[] };
  const training = races.filter(book => book.family === "CHASE").map(book => ({
    ...book, runners: book.runners.map(runner => ({ ...runner, capturedPrice: runner.marketPrice })),
  }));
  const { historical } = chaseT3Books(data);
  const { train, validate } = chronologicalSplit(training, historical);
  assert(train.length && validate.length, "Missing eligible Chase races");
  const standalone = fit(train, "standalone"), marketOffset = fit(train, "marketOffset");
  const period = (fields: Field[]) => ({
    from: fields.map(field => field.book.raceDate).sort()[0],
    to: fields.map(field => field.book.raceDate).sort().at(-1),
    races: fields.length, dates: new Set(fields.map(field => field.book.raceDate)).size,
    featureCutoffRange: fields.map(field => field.book.featureCutoffAt).sort().filter((_, index, list) => index === 0 || index === list.length - 1),
    captureRange: fields.map(field => field.book.capturedAt).sort().filter((_, index, list) => index === 0 || index === list.length - 1),
  });
  process.stdout.write(JSON.stringify({
    asOf: CHASE_T3_REVIEW_CUTOFF, sources, predictors, penalty, trainingCutoff, family: "CHASE", year: 2026,
    training: { rawRaces: training.length, ...period(train) }, validation: { rawRaces: historical.length, ...period(validate) },
    coefficients: { standalone, marketOffset }, models: compare(validate, standalone, marketOffset),
    periods: validationPeriods.map((name, index) => ({
      name, models: compare(validate.filter(field => Number(field.book.raceDate >= "2026-11-12") === index), standalone, marketOffset),
    })),
    matchedRanks: describeMatchedChase(historical), contextBands: describeChaseRaceContexts(historical),
  }, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
