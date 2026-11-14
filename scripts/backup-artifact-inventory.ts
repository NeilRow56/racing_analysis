/** Authoritative research evidence, relative to data/research.
 * These are not rebuildable caches: retraining does not recreate frozen bytes.
 * Keep historical models needed to interpret earlier prospective observations.
 */
export const BACKUP_ARTIFACTS = [
  ["tissue-model-v1.json", "model", "src/lib/racing/tissue-forward.ts"],
  ["tissue-model-v2.json", "model", "src/lib/racing/tissue-forward.ts"],
  ["tissue-model-v3.json", "model", "src/lib/racing/tissue-forward.ts"],
  ["aw-tissue-model-v1.json", "model", "src/lib/racing/aw-tissue-model.ts"],
  ["aw-tissue-model-v2.json", "model", "src/lib/racing/aw-tissue-v2.ts"],
  ["jump-tissue-model-v1.json", "model", "src/lib/racing/jump-tissue-model.ts"],
  ["aw-tissue-parity-shadow-model-v1.json", "model", "src/lib/racing/aw-tissue-shadow-model.ts"],
  ["chase-shadow-v1-frozen.json", "model", "src/lib/racing/chase-shadow-model.ts"],
  ["hurdle-tissue-v3-challenger.json", "model", "src/lib/racing/hurdle-v3-challenger-model.ts"],
  ["tissue-generation-2026-11-turf.json", "model", "src/lib/racing/tissue-generation-model.ts"],
  ["tissue-generation-2026-11-aw.json", "model", "src/lib/racing/tissue-generation-model.ts"],
  ["tissue-generation-2026-11-hurdle.json", "model", "src/lib/racing/tissue-generation-model.ts"],
  ["tissue-generation-2026-11-chase.json", "model", "src/lib/racing/tissue-generation-model.ts"],
  ["forward-value-calibration-v1.json", "calibration", "src/lib/racing/forward-value.ts"],
  ["aw-surface-material-v1.json", "configuration", "scripts/fit-aw-tissue-v2.ts"],
  ["tissue-generation-2026-11-manifest.json", "provenance", "scripts/develop-tissue-generation.ts"],
  ["tissue-generation-development-2026-11.json", "provenance", "scripts/develop-tissue-generation.ts"],
  ["tissue-generation-chase-promotion-2026-11.json", "provenance", "scripts/develop-tissue-generation.ts"],
  ["prospective-epochs-2026-11-11/activation.json", "provenance", "scripts/activate-prospective-epochs.ts"],
  ["prospective-epochs-2026-11-11/activation-receipt.json", "provenance", "scripts/activate-prospective-epochs.ts"],
  ["prospective-epochs-2026-11-11/activation-report.json", "provenance", "scripts/activate-prospective-epochs.ts"],
  ["prospective-epochs-2026-11-11/preservation-before.json", "provenance", "scripts/activate-prospective-epochs.ts"],
  ["prospective-epochs-2026-11-11/preservation-after.json", "provenance", "scripts/activate-prospective-epochs.ts"],
] as const;

// Preserve actual methodology bytes, including uncommitted implementations.
// Additional pinned sources are discovered from ledger/artifact hash metadata.
export const BACKUP_RECOVERY_SOURCES = [
  "package.json", "bun.lock", "tsconfig.json",
  "scripts/backup-weekly.ts", "scripts/backup-tracker-inventory.ts", "scripts/backup-artifact-inventory.ts",
  "scripts/train-hurdle-v3-challenger.py",
  "scripts/backup-historical-dependencies.ts",
  "src/lib/racing/prospective-epoch-integrity.ts",
] as const;
