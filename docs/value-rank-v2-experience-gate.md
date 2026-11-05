# Value Rank V2: prospective experience gate

Selection version: `VALUE_RANK_V2`. Prospective epoch: **2026-11-05T06:37:02.000Z**.

The original all-field expected-return score and competition ranks are unchanged.
Only original Value rank 1 runners are considered. At the frozen median bookmaker
price **21.00 <= price < 51.00**, the runner must have **5–9 prior career runs**.
Counts 0–4, 10+, missing, or invalid fail. A rejected leader leaves no Value 1;
Value 2 is never promoted. Outside this price band there is no experience gate.
If original leaders tie, each is gated individually without breaking the existing
competition-rank policy.

New pre-race captures freeze `valueRankPolicy` in the existing family Value JSON
books: selection version, epoch, each original leader's runner ID, prior-run count,
retained/rejected decision, and rejection reason. Their original runner records
retain every frozen rank, score, probability, quote, price, and canonical outcome;
these are the **Legacy Value 1 V1 shadow**, for research only. This references the
same canonical settlement rather than creating another settlement implementation.
Existing atomic append and capture-immutability checks protect the decisions.

The family JSON header versions describe the all-runner capture formats and stay
unchanged; `valueRankPolicy.version` versions the active selection policy. Readers
validate the new policy against the frozen inputs and require it on post-epoch
captures. Pre-epoch books must not gain this field or enter V2/shadow statistics.
No retrospective capture or metadata backfill is performed. Races already frozen
before activation, including races captured earlier on implementation day, remain
V1 evidence and are not recaptured. Their historical displays retain V1 semantics.

Experience comes from the frozen pre-race `log_prior_runs` feature, decoded from
`log1p` with its missing flag. For Jump the inherited `log_prior_jump_starts` slot
is populated from `metrics.priorRuns` (the available all-code prior history), as
in the diagnostic. No current career totals or target-race results are consulted.
This is the application's known prior history, not a guarantee of complete
official lifetime records. Missing history is not converted to zero.

Today hides Value 1 on rejected V2 leaders, leaves all other ranks and Tissue
markers unchanged, and uses active V2 membership for T1=V1 and its daily list.
Research race tables label rejected leaders explicitly as legacy selections.

The existing family filter applies to the new research monitoring section. It
reports races evaluated/with/without Value 1, active V2, all legacy V1 shadow,
rejected shadow by reason, and target-band retained/rejected cohorts. Performance
uses settled £1 selections; Actual/Market uses normalised frozen full-field
market probabilities. NR/void/unresolved observations do not enter stakes.
Active and shadow overlap; never add them together. With tied leaders, selection
counts can exceed race counts.

Normal capture/settlement continues through `bun run tissue-value:sync`; read-only
monitoring is `bun run tissue-value:summary`. Implementation itself does not run
sync, write research JSON, backfill observations, fit a model, alter settlement,
or migrate a database. New observations will arrive through the existing workflow.

The rule was explicitly requested after retrospective discovery (three winners).
It has **no independent validation**. The new retained and rejected cohorts test
whether that finding replicates prospectively.
