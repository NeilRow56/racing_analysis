/** Required mutable ledgers, audited against the capture/settlement scripts.
 * Keep this list in sync when introducing or retiring a prospective writer.
 * V1 Turf remains included because tissue:v1:sync is still supported.
 * Frozen models, calibration exports, diagnostics and the superseded
 * aw-tissue-paired-forward-v1.json are deliberately excluded.
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
  ["hurdle-recency-completion-forward-v1.json", "src/lib/racing/hurdle-recency-forward.ts"],
  ["tissue-forward-v3.json", "src/lib/racing/tissue-forward.ts"],
  ["aw-tissue-forward-v2.json", "src/lib/racing/aw-tissue-v2.ts"],
  ["turf-tissue-v3-value-forward-v1.json", "src/lib/racing/turf-value-definition.ts"],
  ["aw-tissue-v2-value-forward-v1.json", "src/lib/racing/tissue-value-config.ts"],
  ["hurdle-jump-tissue-v1-value-forward-v1.json", "src/lib/racing/tissue-value-config.ts"],
  ["chase-jump-tissue-v1-value-forward-v1.json", "src/lib/racing/tissue-value-config.ts"],
] as const;
