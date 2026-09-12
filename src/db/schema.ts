import {
  date,
  index,
  integer,
  boolean,
  jsonb,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  };
}

function importedEntityFields() {
  return {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source"),
    sourceId: text("source_id"),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name"),
    ...timestamps(),
  };
}

export const courses = pgTable(
  "courses",
  {
    ...importedEntityFields(),
    country: text("country").default("UK"),
  },
  (table) => [
    uniqueIndex("courses_source_source_id_idx").on(table.source, table.sourceId),
    index("courses_normalized_name_idx").on(table.normalizedName),
  ],
);

export const horses = pgTable(
  "horses",
  {
    ...importedEntityFields(),
  },
  (table) => [
    uniqueIndex("horses_source_source_id_idx").on(table.source, table.sourceId),
    index("horses_normalized_name_idx").on(table.normalizedName),
  ],
);

export const trainers = pgTable(
  "trainers",
  {
    ...importedEntityFields(),
  },
  (table) => [
    uniqueIndex("trainers_source_source_id_idx").on(table.source, table.sourceId),
    index("trainers_normalized_name_idx").on(table.normalizedName),
  ],
);

export const jockeys = pgTable(
  "jockeys",
  {
    ...importedEntityFields(),
  },
  (table) => [
    uniqueIndex("jockeys_source_source_id_idx").on(table.source, table.sourceId),
    index("jockeys_normalized_name_idx").on(table.normalizedName),
  ],
);

export const races = pgTable(
  "races",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source"),
    sourceId: text("source_id"),
    raceDate: date("race_date").notNull(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    scheduledTime: time("scheduled_time"),
    offTime: time("off_time"),
    raceDatetime: timestamp("race_datetime", { withTimezone: true }),
    localRaceDatetime: timestamp("local_race_datetime", { withTimezone: true }),
    raceName: text("race_name"),
    raceType: text("race_type"),
    raceTypeCode: text("race_type_code"),
    raceClass: text("race_class"),
    distance: text("distance"),
    distanceYards: integer("distance_yards"),
    going: text("going"),
    declaredRunnerCount: integer("declared_runner_count"),
    actualRunnerCount: integer("actual_runner_count"),
    winningTime: text("winning_time"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("races_source_source_id_idx").on(table.source, table.sourceId),
    index("races_course_date_idx").on(table.courseId, table.raceDate),
  ],
);

export const raceRunners = pgTable(
  "race_runners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source"),
    sourceId: text("source_id"),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id, { onDelete: "cascade" }),
    horseId: uuid("horse_id")
      .notNull()
      .references(() => horses.id),
    trainerId: uuid("trainer_id").references(() => trainers.id),
    jockeyId: uuid("jockey_id").references(() => jockeys.id),
    saddleclothNumber: integer("saddlecloth_number"),
    finishingPosition: integer("finishing_position"),
    finishingStatus: text("finishing_status"),
    resultStatus: text("result_status"),
    outcomeCode: text("outcome_code"),
    runnerComment: text("runner_comment"),
    draw: integer("draw"),
    beatenDistance: text("beaten_distance"),
    beatenDistanceToWinner: text("beaten_distance_to_winner"),
    weight: text("weight"),
    weightCarriedLbs: integer("weight_carried_lbs"),
    jockeyClaimLbs: integer("jockey_claim_lbs"),
    headgear: text("headgear"),
    officialRating: integer("official_rating"),
    racingPostRating: integer("racing_post_rating"),
    topspeedRating: integer("topspeed_rating"),
    startingPrice: text("starting_price"),
    startingPriceDecimal: numeric("starting_price_decimal", {
      precision: 8,
      scale: 3,
    }),
    isFavourite: boolean("is_favourite"),
    horseAge: integer("horse_age"),
    horseSex: text("horse_sex"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("race_runners_source_source_id_idx").on(
      table.source,
      table.sourceId,
    ),
    uniqueIndex("race_runners_race_horse_idx").on(table.raceId, table.horseId),
    index("race_runners_trainer_idx").on(table.trainerId),
    index("race_runners_jockey_idx").on(table.jockeyId),
  ],
);

export const sourceImports = pgTable(
  "source_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    sourceType: text("source_type").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    payload: jsonb("payload").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("source_imports_source_type_id_idx").on(
      table.source,
      table.sourceType,
      table.sourceId,
    ),
  ],
);

export const savedResearchRules = pgTable(
  "saved_research_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("draft"),
    ruleSchemaVersion: text("rule_schema_version").notNull(),
    ruleIdentity: text("rule_identity").notNull(),
    canonicalRule: jsonb("canonical_rule").notNull(),
    family: text("family").notNull(),
    developmentFrom: date("development_from").notNull(),
    developmentTo: date("development_to").notNull(),
    developmentSnapshot: jsonb("development_snapshot").notNull(),
    holdoutSnapshot: jsonb("holdout_snapshot"),
    cacheMetadata: jsonb("cache_metadata"),
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("saved_research_rules_status_idx").on(table.status),
    index("saved_research_rules_family_idx").on(table.family),
    index("saved_research_rules_rule_identity_idx").on(table.ruleIdentity),
  ],
);
