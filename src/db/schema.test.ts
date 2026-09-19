import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { races, sourceImports } from "./schema";

describe("Turf context indexes", () => {
  test("keeps completed-race and payload-surface lookup indexes", () => {
    const raceIndexes = new Set(getTableConfig(races).indexes.map((index) => index.config.name));
    const sourceImportIndexes = new Set(
      getTableConfig(sourceImports).indexes.map((index) => index.config.name),
    );

    assert.ok(raceIndexes.has("races_completed_context_distance_idx"));
    assert.ok(raceIndexes.has("races_completed_context_day_idx"));
    assert.ok(sourceImportIndexes.has("source_imports_surface_lookup_idx"));
  });
});
