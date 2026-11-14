/** Required mutable ledgers, audited against the capture/settlement scripts.
 * Keep this list in sync when introducing or retiring a prospective writer.
 * V1 Turf remains included because tissue:v1:sync is still supported.
 * Immutable artifacts are listed separately in backup-artifact-inventory.ts.
 * Diagnostics and superseded aw-tissue-paired-forward-v1.json remain excluded.
 */
export const BACKUP_TRACKERS = [
  ["tpr-vs-timewise-forward.json", "scripts/diagnose-tpr-vs-timewise-forward.ts"],
  ["aw-forward-comparisons.json", "src/lib/racing/aw-forward-comparisons.ts"],
  ["tissue-forward.json", "src/lib/racing/tissue-forward.ts"],
  ["tissue-forward-v2.json", "src/lib/racing/tissue-forward.ts"],
  ["jump-rating-forward-v1.json", "src/lib/racing/jump-rating-forward.ts"],
  ["jump-tissue-forward-v1.json", "src/lib/racing/jump-tissue-forward.ts"],
  ["aw-rating-forward-v1.json", "src/lib/racing/aw-rating-forward.ts"],
  ["aw-tissue-forward-v1.json", "src/lib/racing/aw-tissue-forward.ts"],
  ["aw-longshot-tj-paired-forward-v1.json", "src/lib/racing/aw-tissue-paired-forward.ts"],
  ["aw-tissue-parity-shadow-forward-v1.json", "src/lib/racing/aw-tissue-shadow-forward.ts"],
  ["hurdle-tissue-challenger-forward-v1.json", "src/lib/racing/hurdle-tissue-challenger-forward.ts"],
  ["chase-tissue-mismatch-zero-forward-v1.json", "src/lib/racing/chase-tissue-challenger-forward.ts"],
  ["jump-g4-forward-v1.json", "src/lib/racing/jump-g4-forward.ts"],
  ["todays-rating-weight-forward-v1.json", "src/lib/racing/todays-rating-weight-forward.ts"],
  ["forward-value-v1.json", "src/lib/racing/forward-value.ts"],
  ["model-disagreement-forward-v1.json", "src/lib/racing/model-disagreement-forward.ts"],
  ["rank-one-forward-v1.json", "src/lib/racing/rank-one-forward.ts"],
  ["tissue-generation-forward-2026-11.json", "src/lib/racing/tissue-generation-forward.ts"],
  ["context-weight-shadow-v1.json", "src/lib/racing/context-weight-shadow-config.ts"],
  ["hurdle-recency-completion-forward-v1.json", "src/lib/racing/hurdle-recency-forward.ts"],
  ["tissue-forward-v3.json", "src/lib/racing/tissue-forward.ts"],
  ["aw-tissue-forward-v2.json", "src/lib/racing/aw-tissue-v2.ts"],
  ["turf-tissue-v3-value-forward-v1.json", "src/lib/racing/turf-value-definition.ts"],
  ["aw-tissue-v2-value-forward-v1.json", "src/lib/racing/tissue-value-config.ts"],
  ["hurdle-jump-tissue-v1-value-forward-v1.json", "src/lib/racing/tissue-value-config.ts"],
  ["chase-jump-tissue-v1-value-forward-v1.json", "src/lib/racing/tissue-value-config.ts"],
  ["hurdle-v3-prospective-shadow-v1.json", "src/lib/racing/hurdle-v3-shadow.ts"],
  ["hurdle-low-form-prospective-v1.json", "src/lib/racing/hurdle-low-form.ts"],
  ["hurdle-v3-market-edge-prospective-v1.json", "src/lib/racing/hurdle-v3-market-edge.ts"],
  ["tissue-positive-neutral-prospective-v1.json", "src/lib/racing/tissue-positive-neutral.ts"],
  ["turf-2027-early-season-v1.json", "src/lib/racing/turf-early-season.ts"],
  ["prospective-epochs-2026-11-11/positive-neutral-v2.json", "src/lib/racing/prospective-epoch-config.ts"],
  ["prospective-epochs-2026-11-11/hurdle-v3-shadow-v2.json", "src/lib/racing/prospective-epoch-config.ts"],
  ["prospective-epochs-2026-11-11/hurdle-v3-market-edge-v2.json", "src/lib/racing/prospective-epoch-config.ts"],
  ["chase-shadow-prospective-v1.json", "src/lib/racing/chase-shadow-forward.ts"],
  ["or-best-l3-speed-forward-v1.json", "src/lib/racing/or-speed-forward.ts"],
] as const;
