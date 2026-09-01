import { and, eq } from "drizzle-orm";
import { createDbConnection } from "@/db";
import {
  courses,
  horses,
  jockeys,
  raceRunners,
  races,
  trainers,
} from "@/db/schema";

const source = "smoke-test";

async function main() {
  const { client, db } = createDbConnection();

  try {
    const course = await ensureCourse();

    const race = await ensureRace({
      sourceId: "race-fictional-meadow-2026-01-01-1400",
      courseId: course.id,
    });

    const trainerRows = await Promise.all([
      ensureImportedEntity(trainers, {
        sourceId: "trainer-synthetic-ada",
        displayName: "Synthetic Trainer Ada",
        normalizedName: "synthetic trainer ada",
      }),
      ensureImportedEntity(trainers, {
        sourceId: "trainer-synthetic-bert",
        displayName: "Synthetic Trainer Bert",
        normalizedName: "synthetic trainer bert",
      }),
      ensureImportedEntity(trainers, {
        sourceId: "trainer-synthetic-clio",
        displayName: "Synthetic Trainer Clio",
        normalizedName: "synthetic trainer clio",
      }),
    ]);

    const jockeyRows = await Promise.all([
      ensureImportedEntity(jockeys, {
        sourceId: "jockey-synthetic-ivy",
        displayName: "Synthetic Jockey Ivy",
        normalizedName: "synthetic jockey ivy",
      }),
      ensureImportedEntity(jockeys, {
        sourceId: "jockey-synthetic-jo",
        displayName: "Synthetic Jockey Jo",
        normalizedName: "synthetic jockey jo",
      }),
      ensureImportedEntity(jockeys, {
        sourceId: "jockey-synthetic-kai",
        displayName: "Synthetic Jockey Kai",
        normalizedName: "synthetic jockey kai",
      }),
    ]);

    const horseRows = await Promise.all([
      ensureImportedEntity(horses, {
        sourceId: "horse-test-only-moonlit-widget",
        displayName: "Test Only Moonlit Widget",
        normalizedName: "test only moonlit widget",
      }),
      ensureImportedEntity(horses, {
        sourceId: "horse-test-only-copper-notebook",
        displayName: "Test Only Copper Notebook",
        normalizedName: "test only copper notebook",
      }),
      ensureImportedEntity(horses, {
        sourceId: "horse-test-only-silver-paperclip",
        displayName: "Test Only Silver Paperclip",
        normalizedName: "test only silver paperclip",
      }),
    ]);

    await Promise.all([
      ensureRunner({
        sourceId: "runner-fictional-meadow-1",
        raceId: race.id,
        horseId: horseRows[0].id,
        trainerId: trainerRows[0].id,
        jockeyId: jockeyRows[0].id,
        finishingPosition: 1,
        finishingStatus: "finished",
        draw: 2,
        weight: "11st 0lb",
        startingPrice: "4/1",
        startingPriceDecimal: "5.000",
      }),
      ensureRunner({
        sourceId: "runner-fictional-meadow-2",
        raceId: race.id,
        horseId: horseRows[1].id,
        trainerId: trainerRows[1].id,
        jockeyId: jockeyRows[1].id,
        finishingPosition: 2,
        finishingStatus: "finished",
        draw: 1,
        weight: "10st 12lb",
        startingPrice: "9/2",
        startingPriceDecimal: "5.500",
      }),
      ensureRunner({
        sourceId: "runner-fictional-meadow-3",
        raceId: race.id,
        horseId: horseRows[2].id,
        trainerId: trainerRows[2].id,
        jockeyId: jockeyRows[2].id,
        finishingPosition: 3,
        finishingStatus: "finished",
        draw: 3,
        weight: "10st 10lb",
        startingPrice: "6/1",
        startingPriceDecimal: "7.000",
      }),
    ]);

    console.log("Seed complete: fictional smoke-test race is present.");
  } finally {
    await client.end();
  }

  async function ensureCourse() {
    const sourceId = "course-fictional-meadow";
    const inserted = await db
      .insert(courses)
      .values({
        source,
        sourceId,
        displayName: "Fictional Meadow Testcourse",
        normalizedName: "fictional meadow testcourse",
        country: "UK",
      })
      .onConflictDoNothing({
        target: [courses.source, courses.sourceId],
      })
      .returning({ id: courses.id });

    const existing =
      inserted[0] ??
      (
        await db
          .select({ id: courses.id })
          .from(courses)
          .where(and(eq(courses.source, source), eq(courses.sourceId, sourceId)))
          .limit(1)
      )[0];

    if (!existing) {
      throw new Error(`Could not find or create ${sourceId}`);
    }

    return existing;
  }

  async function ensureImportedEntity(
    table: typeof horses | typeof trainers | typeof jockeys,
    values: {
      sourceId: string;
      displayName: string;
      normalizedName: string;
    },
  ) {
    if (table === horses) {
      return ensureHorse(values);
    }

    if (table === trainers) {
      return ensureTrainer(values);
    }

    return ensureJockey(values);
  }

  async function ensureHorse(values: {
    sourceId: string;
    displayName: string;
    normalizedName: string;
  }) {
    const inserted = await db
      .insert(horses)
      .values({ source, ...values })
      .onConflictDoNothing({
        target: [horses.source, horses.sourceId],
      })
      .returning({ id: horses.id });

    const existing =
      inserted[0] ??
      (
        await db
          .select({ id: horses.id })
          .from(horses)
          .where(and(eq(horses.source, source), eq(horses.sourceId, values.sourceId)))
          .limit(1)
      )[0];

    if (!existing) {
      throw new Error(`Could not find or create ${values.sourceId}`);
    }

    return existing;
  }

  async function ensureTrainer(values: {
    sourceId: string;
    displayName: string;
    normalizedName: string;
  }) {
    const inserted = await db
      .insert(trainers)
      .values({ source, ...values })
      .onConflictDoNothing({
        target: [trainers.source, trainers.sourceId],
      })
      .returning({ id: trainers.id });

    const existing =
      inserted[0] ??
      (
        await db
          .select({ id: trainers.id })
          .from(trainers)
          .where(and(eq(trainers.source, source), eq(trainers.sourceId, values.sourceId)))
          .limit(1)
      )[0];

    if (!existing) {
      throw new Error(`Could not find or create ${values.sourceId}`);
    }

    return existing;
  }

  async function ensureJockey(values: {
    sourceId: string;
    displayName: string;
    normalizedName: string;
  }) {
    const inserted = await db
      .insert(jockeys)
      .values({ source, ...values })
      .onConflictDoNothing({
        target: [jockeys.source, jockeys.sourceId],
      })
      .returning({ id: jockeys.id });

    const existing =
      inserted[0] ??
      (
        await db
          .select({ id: jockeys.id })
          .from(jockeys)
          .where(and(eq(jockeys.source, source), eq(jockeys.sourceId, values.sourceId)))
          .limit(1)
      )[0];

    if (!existing) {
      throw new Error(`Could not find or create ${values.sourceId}`);
    }

    return existing;
  }

  async function ensureRace(values: { sourceId: string; courseId: string }) {
    const inserted = await db
      .insert(races)
      .values({
        source,
        sourceId: values.sourceId,
        raceDate: "2026-01-01",
        courseId: values.courseId,
        scheduledTime: "14:00:00",
        raceName: "Fictional Foundation Smoke Test Stakes",
        raceType: "synthetic-test",
        distance: "1m 2f",
        going: "Good to Imaginary",
      })
      .onConflictDoNothing({
        target: [races.source, races.sourceId],
      })
      .returning({ id: races.id });

    const existing =
      inserted[0] ??
      (
        await db
          .select({ id: races.id })
          .from(races)
          .where(and(eq(races.source, source), eq(races.sourceId, values.sourceId)))
          .limit(1)
      )[0];

    if (!existing) {
      throw new Error(`Could not find or create ${values.sourceId}`);
    }

    return existing;
  }

  async function ensureRunner(values: {
    sourceId: string;
    raceId: string;
    horseId: string;
    trainerId: string;
    jockeyId: string;
    finishingPosition: number;
    finishingStatus: string;
    draw: number;
    weight: string;
    startingPrice: string;
    startingPriceDecimal: string;
  }) {
    await db
      .insert(raceRunners)
      .values({ source, ...values })
      .onConflictDoNothing({
        target: [raceRunners.source, raceRunners.sourceId],
      });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
