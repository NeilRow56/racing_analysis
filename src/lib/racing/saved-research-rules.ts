import { desc, eq } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { savedResearchRules } from "@/db/schema";
import { evaluateHoldoutForSavedRule } from "./research-holdout";
import {
  RESEARCH_RULE_VERSION,
  parseResearchRule,
  type ResearchResult,
  type ResearchRuleV1,
} from "./research-rule";
import {
  canonicalResearchRule,
  researchRuleKey,
} from "./research-rule-identity";

type Db = ReturnType<typeof createDbConnection>["db"];
type DbConnection = ReturnType<typeof createDbConnection>;
type SavedResearchRuleRow = typeof savedResearchRules.$inferSelect;
type InsertSavedResearchRuleRow = typeof savedResearchRules.$inferInsert;

export type SavedResearchRuleStatus = "draft" | "frozen";
export type CanonicalResearchRuleV1 = ReturnType<typeof canonicalResearchRule>;

export type DevelopmentResultSnapshot = {
  eligibleRunners: number;
  selections: number;
  settledSelections: number;
  winners: number;
  strikeRate: number | null;
  places: number;
  placeStrikeRate: number | null;
  profitLoss: number;
  roiPercentage: number | null;
  maxConsecutiveLosers: number;
};

export type ResearchRuleCacheMetadata = {
  featureSchemaVersion: string | null;
  sourceFeatureVersion: string | null;
  cacheFamily: string | null;
  cacheGeneratedAt: string | null;
  calculationVersions: Record<string, string>;
};

export type HoldoutResultStatus =
  | "completed"
  | "no_settled_holdout_selections"
  | "insufficient_holdout_sample";

export type HoldoutResultSnapshot = DevelopmentResultSnapshot & {
  holdoutYear: "2026";
  holdoutFrom: string;
  holdoutTo: string;
  validatedAt: string;
  ruleSchemaVersion: string;
  ruleIdentity: string;
  cacheMetadata: ResearchRuleCacheMetadata;
  status: HoldoutResultStatus;
};

export type SavedResearchRule = {
  id: string;
  name: string;
  notes: string | null;
  status: SavedResearchRuleStatus;
  ruleSchemaVersion: string;
  ruleIdentity: string;
  canonicalRule: CanonicalResearchRuleV1;
  family: ResearchRuleV1["family"];
  developmentFrom: string;
  developmentTo: string;
  developmentSnapshot: DevelopmentResultSnapshot;
  holdoutSnapshot: HoldoutResultSnapshot | null;
  cacheMetadata: ResearchRuleCacheMetadata | null;
  createdAt: Date;
  updatedAt: Date;
  frozenAt: Date | null;
};

export type SaveExecutedResearchRuleInput = {
  name: string;
  notes?: string | null;
  result: ResearchResult;
};

export type SaveResearchRuleSnapshotInput = {
  name: string;
  notes?: string | null;
  rule: ResearchRuleV1;
  developmentSnapshot: DevelopmentResultSnapshot;
  cacheMetadata?: ResearchRuleCacheMetadata | null;
};

export type PreparedSavedResearchRule = Omit<InsertSavedResearchRuleRow, "id" | "createdAt" | "updatedAt">;

export async function listSavedResearchRules(): Promise<SavedResearchRule[]> {
  return withSavedResearchRulesDb(listSavedResearchRulesWithDb);
}

export async function saveExecutedResearchRule(input: SaveExecutedResearchRuleInput): Promise<SavedResearchRule> {
  return withSavedResearchRulesDb((db) => saveExecutedResearchRuleWithDb(db, input));
}

export async function saveResearchRuleSnapshot(input: SaveResearchRuleSnapshotInput): Promise<SavedResearchRule> {
  return withSavedResearchRulesDb((db) => saveResearchRuleSnapshotWithDb(db, input));
}

export async function saveFrozenResearchRuleSnapshot(input: SaveResearchRuleSnapshotInput): Promise<SavedResearchRule> {
  return withSavedResearchRulesDb((db) => saveFrozenResearchRuleSnapshotWithDb(db, input));
}

export async function freezeSavedResearchRule(id: string): Promise<SavedResearchRule> {
  return withSavedResearchRulesDb((db) => freezeSavedResearchRuleWithDb(db, id));
}

export async function deleteSavedResearchRule(id: string, input: { confirmFrozenDelete?: boolean } = {}): Promise<void> {
  return withSavedResearchRulesDb((db) => deleteSavedResearchRuleWithDb(db, id, input));
}

export async function validateSavedResearchRuleHoldout(id: string): Promise<SavedResearchRule> {
  return withSavedResearchRulesDb((db) => validateSavedResearchRuleHoldoutWithDb(db, id));
}

export async function replaceDraftResearchRule(input: {
  id: string;
  result: ResearchResult;
}): Promise<SavedResearchRule> {
  return withSavedResearchRulesDb((db) => replaceDraftResearchRuleWithDb(db, input));
}

export async function withSavedResearchRulesDb<T>(
  operation: (db: Db) => Promise<T>,
  createConnection: () => DbConnection = createDbConnection,
): Promise<T> {
  const { client, db } = createConnection();
  try {
    return await operation(db);
  } finally {
    await client.end();
  }
}

export async function listSavedResearchRulesWithDb(db: Db): Promise<SavedResearchRule[]> {
  const rows = await db.select().from(savedResearchRules).orderBy(desc(savedResearchRules.createdAt));
  return rows.map(savedResearchRuleFromRow);
}

export async function saveExecutedResearchRuleWithDb(
  db: Db,
  input: SaveExecutedResearchRuleInput,
): Promise<SavedResearchRule> {
  return saveResearchRuleSnapshotWithDb(db, snapshotInputFromResult(input));
}

export async function saveResearchRuleSnapshotWithDb(
  db: Db,
  input: SaveResearchRuleSnapshotInput,
): Promise<SavedResearchRule> {
  const record = prepareSavedResearchRule(input);
  const [saved] = await db.insert(savedResearchRules).values(record).returning();
  if (!saved) {
    throw new Error("Saved research rule insert did not return a row");
  }
  return savedResearchRuleFromRow(saved);
}

export async function saveFrozenResearchRuleSnapshotWithDb(
  db: Db,
  input: SaveResearchRuleSnapshotInput,
): Promise<SavedResearchRule> {
  const record = prepareFrozenSavedResearchRule(input);
  const [saved] = await db.insert(savedResearchRules).values(record).returning();
  if (!saved) {
    throw new Error("Frozen research rule insert did not return a row");
  }
  return savedResearchRuleFromRow(saved);
}

export function prepareFrozenSavedResearchRule(input: SaveResearchRuleSnapshotInput): PreparedSavedResearchRule {
  return {
    ...prepareSavedResearchRule(input),
    status: "frozen",
    frozenAt: new Date(),
  };
}

export async function freezeSavedResearchRuleWithDb(db: Db, id: string): Promise<SavedResearchRule> {
  const existing = await findSavedResearchRuleRow(db, id);
  if (existing.status === "frozen") {
    return savedResearchRuleFromRow(existing);
  }
  const frozen = freezeSavedResearchRuleRecord(savedResearchRuleFromRow(existing));

  const [updated] = await db.update(savedResearchRules)
    .set({
      status: frozen.status,
      frozenAt: frozen.frozenAt,
      updatedAt: frozen.updatedAt,
    })
    .where(eq(savedResearchRules.id, id))
    .returning();
  if (!updated) {
    throw new Error(`Saved research rule not found: ${id}`);
  }
  return savedResearchRuleFromRow(updated);
}

export async function deleteSavedResearchRuleWithDb(
  db: Db,
  id: string,
  input: { confirmFrozenDelete?: boolean } = {},
): Promise<void> {
  const existing = await findSavedResearchRuleRow(db, id);
  if (existing.status === "frozen" && !input.confirmFrozenDelete) {
    throw new Error("Deleting a frozen research rule requires confirmation");
  }
  await db.delete(savedResearchRules).where(eq(savedResearchRules.id, id));
}

export async function replaceDraftResearchRuleWithDb(
  db: Db,
  input: { id: string; result: ResearchResult },
): Promise<SavedResearchRule> {
  const existing = await findSavedResearchRuleRow(db, input.id);
  const replacement = replaceDraftResearchRuleRecord(savedResearchRuleFromRow(existing), input.result);
  const [updated] = await db.update(savedResearchRules)
    .set({
      ruleSchemaVersion: replacement.ruleSchemaVersion,
      ruleIdentity: replacement.ruleIdentity,
      canonicalRule: replacement.canonicalRule,
      family: replacement.family,
      developmentFrom: replacement.developmentFrom,
      developmentTo: replacement.developmentTo,
      developmentSnapshot: replacement.developmentSnapshot,
      cacheMetadata: replacement.cacheMetadata,
      updatedAt: replacement.updatedAt,
    })
    .where(eq(savedResearchRules.id, input.id))
    .returning();
  if (!updated) {
    throw new Error(`Saved research rule not found: ${input.id}`);
  }
  return savedResearchRuleFromRow(updated);
}

export async function validateSavedResearchRuleHoldoutWithDb(db: Db, id: string): Promise<SavedResearchRule> {
  const existing = savedResearchRuleFromRow(await findSavedResearchRuleRow(db, id));
  assertCanValidateHoldout(existing);
  const holdoutSnapshot = await evaluateHoldoutForSavedRule(existing);

  const [updated] = await db.update(savedResearchRules)
    .set({
      holdoutSnapshot,
      updatedAt: new Date(),
    })
    .where(eq(savedResearchRules.id, id))
    .returning();
  if (!updated) {
    throw new Error(`Saved research rule not found: ${id}`);
  }
  return savedResearchRuleFromRow(updated);
}

export function prepareSavedResearchRule(input: SaveResearchRuleSnapshotInput): PreparedSavedResearchRule {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Saved research rule name is required");
  }

  return {
    name,
    notes: normalizedNotes(input.notes),
    status: "draft",
    ...preparedRuleDefinitionFieldsFromSnapshot(input),
    holdoutSnapshot: null,
    frozenAt: null,
  };
}

export function canValidateHoldout(rule: SavedResearchRule): boolean {
  return rule.status === "frozen" && rule.holdoutSnapshot === null;
}

export function assertCanValidateHoldout(rule: SavedResearchRule): void {
  if (rule.status !== "frozen") {
    throw new Error("Only frozen research rules can be validated on the 2026 holdout");
  }
  if (rule.holdoutSnapshot) {
    throw new Error("2026 holdout has already been completed for this research rule");
  }
}

export function developmentSnapshotFromResult(result: ResearchResult): DevelopmentResultSnapshot {
  return {
    eligibleRunners: result.baselineRows,
    selections: result.summary.selections,
    settledSelections: result.summary.settledSelections,
    winners: result.summary.wins,
    strikeRate: result.summary.winStrikeRate,
    places: result.summary.places,
    placeStrikeRate: result.summary.placeStrikeRate,
    profitLoss: result.summary.profitLoss,
    roiPercentage: result.summary.roiPercentage,
    maxConsecutiveLosers: result.summary.maxConsecutiveLosers,
  };
}

export function cacheMetadataFromResult(result: ResearchResult): ResearchRuleCacheMetadata | null {
  const manifest = result.cache?.manifest;
  if (!manifest) {
    return null;
  }
  return {
    featureSchemaVersion: manifest.featureSchemaVersion,
    sourceFeatureVersion: manifest.sourceFeatureVersion,
    cacheFamily: manifest.family,
    cacheGeneratedAt: manifest.generatedAt,
    calculationVersions: manifest.calculationVersions,
  };
}

export function savedResearchRuleFromRow(row: SavedResearchRuleRow): SavedResearchRule {
  const normalizedRule = normalizedCanonicalRule(row.canonicalRule);
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    status: savedResearchRuleStatus(row.status),
    ruleSchemaVersion: row.ruleSchemaVersion,
    ruleIdentity: normalizedRule ? researchRuleKey(normalizedRule) : row.ruleIdentity,
    canonicalRule: normalizedRule ? canonicalResearchRule(normalizedRule) : row.canonicalRule as CanonicalResearchRuleV1,
    family: savedResearchRuleFamily(row.family),
    developmentFrom: row.developmentFrom,
    developmentTo: row.developmentTo,
    developmentSnapshot: row.developmentSnapshot as DevelopmentResultSnapshot,
    holdoutSnapshot: row.holdoutSnapshot as HoldoutResultSnapshot | null,
    cacheMetadata: row.cacheMetadata as ResearchRuleCacheMetadata | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    frozenAt: row.frozenAt,
  };
}

function normalizedCanonicalRule(value: unknown): ResearchRuleV1 | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return parseResearchRule(JSON.stringify(value));
}

export function freezeSavedResearchRuleRecord(
  rule: SavedResearchRule,
  frozenAt = new Date(),
): SavedResearchRule {
  if (rule.status === "frozen") {
    return rule;
  }
  return {
    ...rule,
    status: "frozen",
    frozenAt,
    updatedAt: frozenAt,
  };
}

export function replaceDraftResearchRuleRecord(
  rule: SavedResearchRule,
  result: ResearchResult,
): SavedResearchRule {
  if (rule.status === "frozen") {
    throw new Error("Frozen research rule definitions cannot be replaced");
  }
  return {
    ...rule,
    ...preparedRuleDefinitionFields(result),
    updatedAt: new Date(),
  };
}

function preparedRuleDefinitionFields(result: ResearchResult) {
  return preparedRuleDefinitionFieldsFromSnapshot({
    name: "",
    rule: result.rule,
    developmentSnapshot: developmentSnapshotFromResult(result),
    cacheMetadata: cacheMetadataFromResult(result),
  });
}

function preparedRuleDefinitionFieldsFromSnapshot(input: SaveResearchRuleSnapshotInput) {
  const canonicalRule = canonicalResearchRule(input.rule);
  return {
    ruleSchemaVersion: RESEARCH_RULE_VERSION,
    ruleIdentity: researchRuleKey(input.rule),
    canonicalRule,
    family: input.rule.family,
    developmentFrom: input.rule.dateRange.from,
    developmentTo: input.rule.dateRange.to,
    developmentSnapshot: input.developmentSnapshot,
    cacheMetadata: input.cacheMetadata ?? null,
  };
}

function snapshotInputFromResult(input: SaveExecutedResearchRuleInput): SaveResearchRuleSnapshotInput {
  return {
    name: input.name,
    notes: input.notes,
    rule: input.result.rule,
    developmentSnapshot: developmentSnapshotFromResult(input.result),
    cacheMetadata: cacheMetadataFromResult(input.result),
  };
}

async function findSavedResearchRuleRow(db: Db, id: string): Promise<SavedResearchRuleRow> {
  const [row] = await db.select().from(savedResearchRules).where(eq(savedResearchRules.id, id)).limit(1);
  if (!row) {
    throw new Error(`Saved research rule not found: ${id}`);
  }
  return row;
}

function normalizedNotes(notes: string | null | undefined): string | null {
  const text = notes?.trim();
  return text ? text : null;
}

function savedResearchRuleStatus(value: string): SavedResearchRuleStatus {
  if (value === "draft" || value === "frozen") {
    return value;
  }
  throw new Error(`Unknown saved research rule status: ${value}`);
}

function savedResearchRuleFamily(value: string): ResearchRuleV1["family"] {
  if (value === "jump" || value === "all_weather_flat" || value === "turf_flat") {
    return value;
  }
  throw new Error(`Unknown saved research rule family: ${value}`);
}
