import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
import { createDbConnection } from "../src/db";
import { sourceImports } from "../src/db/schema";
import {
  canCaptureMorning, evidenceHash, makeTrainerCapture, observationPeriod, settleTrainerCapture, trainerTargetingProtocol,
  type ImportedCard, type ObservationPeriod, type TrainerCapture,
} from "../src/lib/racing/trainer-targeting";
import { renderTrainerTargetingReport } from "../src/lib/racing/trainer-targeting-report";

const directory = resolve("data/research/trainer-targeting-prospective-v1");
const periodFile = "period.json";
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

async function publishOnce(root: string, name: string, value: unknown, stillValid = () => true) {
  await mkdir(root, { recursive: true });
  const staging = join(root, `.${randomUUID()}.tmp`);
  try {
    await writeFile(staging, JSON.stringify(value) + "\n", { flag: "wx", mode: 0o444 });
    if (!stillValid()) return false;
    await link(staging, join(root, name));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    await rm(staging, { force: true });
  }
}

export async function activateTrainerTargeting(root: string, now: Date, start?: string) {
  const period = observationPeriod(now, start);
  if (!(await publishOnce(root, periodFile, period))) throw new Error("Trainer targeting already has a frozen period.");
  return period;
}

async function loadPeriod(root: string): Promise<ObservationPeriod | null> {
  let period: ObservationPeriod;
  try {
    period = JSON.parse(await readFile(join(root, periodFile), "utf8"));
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
  const expected = observationPeriod(new Date(period.activatedAt), period.from);
  if (evidenceHash(period) !== evidenceHash(expected)) throw new Error("Trainer targeting period or protocol mismatch.");
  return period;
}

export async function appendTrainerCapture(root: string, period: ObservationPeriod, date: string, card: ImportedCard, clock = () => new Date()) {
  const capture = makeTrainerCapture(card, period, date, clock());
  return capture !== null && publishOnce(root, `sporting-life-${capture.raceId}.json`, { capture, hash: evidenceHash(capture) }, () => {
    const now = clock();
    return canCaptureMorning(period, date, now) && now >= new Date(capture.capturedAt) && now < new Date(capture.scheduledOff);
  });
}

export async function* readTrainerCaptures(root: string, period: ObservationPeriod) {
  const files = (await readdir(root)).filter(name => /^sporting-life-\d+\.json$/.test(name)).sort();
  for (const name of files) {
    const { capture, hash } = JSON.parse(await readFile(join(root, name), "utf8")) as { capture: TrainerCapture; hash: string };
    if (evidenceHash(capture) !== hash || capture.periodHash !== evidenceHash(period) ||
        evidenceHash(capture.payload) !== capture.payloadHash || name !== `sporting-life-${capture.raceId}.json`) {
      throw new Error(`Trainer targeting evidence mismatch in ${name}.`);
    }
    yield capture;
  }
}

/** The morning importer passes its private handoff only after returning successfully. */
export async function captureTrainerImport(date: string, handoff: string, root = directory, clock = () => new Date()) {
  const period = await loadPeriod(root);
  if (!period || !canCaptureMorning(period, date, clock())) return 0;
  let captured = 0;
  for (const name of (await readdir(handoff)).filter(name => /^\d+\.json$/.test(name)).sort()) {
    const card: ImportedCard = JSON.parse(await readFile(join(handoff, name), "utf8"));
    if (name !== `${card.raceId}.json`) throw new Error("Trainer targeting import handoff identity mismatch.");
    captured += Number(await appendTrainerCapture(root, period, date, card, clock));
  }
  return captured;
}

async function report() {
  const period = await loadPeriod(directory);
  if (!period) return renderTrainerTargetingReport([], null);
  const captures = readTrainerCaptures(directory, period);
  const first = await captures.next();
  if (first.done) return renderTrainerTargetingReport([], period);
  const { client, db } = createDbConnection();
  const rows: ReturnType<typeof settleTrainerCapture> = [];
  let batch = [first.value];
  const settleBatch = async (captures: TrainerCapture[]) => {
    const results = await db.select({ id: sourceImports.sourceId, payload: sourceImports.payload }).from(sourceImports)
      .where(and(eq(sourceImports.source, trainerTargetingProtocol.source), eq(sourceImports.sourceType, trainerTargetingProtocol.resultSource),
        inArray(sourceImports.sourceId, captures.map(capture => capture.raceId))));
    const byId = new Map(results.map(result => [result.id, result.payload]));
    for (const capture of captures) rows.push(...settleTrainerCapture(capture, byId.get(capture.raceId)));
  };
  try {
    for await (const capture of captures) {
      batch.push(capture);
      if (batch.length === 100) {
        await settleBatch(batch);
        batch = [];
      }
    }
    if (batch.length) await settleBatch(batch);
  } finally {
    await client.end();
  }
  return renderTrainerTargetingReport(rows, period);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, start, ...extra] = process.argv.slice(2);
  if (command === "activate" && !extra.length) {
    const period = await activateTrainerTargeting(directory, new Date(), start);
    console.log(`Frozen London observation period ${period.from} to ${period.until} (end exclusive), ${period.protocol.version}, ${period.protocol.settlement}.`);
  } else if (command === "capture-import" && start && extra.length === 1 && process.env.RESEARCH_TRAINER_TARGETING_MORNING === "1") {
    console.log(`Trainer targeting appended ${await captureTrainerImport(start, extra[0])} race captures.`);
  } else if (command === "report" && !start) {
    console.log(await report());
  } else {
    throw new Error("Usage: bun run scripts/trainer-targeting.ts activate [YYYY-MM-DD] | report");
  }
}
