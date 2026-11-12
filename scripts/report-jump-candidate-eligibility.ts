import { candidateSha256, readIsolatedJumpCandidate } from "@/lib/racing/jump-candidate-reader";
import { CANDIDATE_FEATURES } from "@/lib/racing/jump-candidate-eligibility";

// Read-only, explicit opt-in report. Redirect stdout to a NEW report artifact.
const candidate = await readIsolatedJumpCandidate();
console.log(JSON.stringify({
  warning: candidate.warning, activated: candidate.activated, audit: candidate.audit,
  sourcePins: candidate.sourcePins,
  independentlyVerifiedFullResultFields: candidate.fieldProofs.length,
  fieldProofDigest: candidateSha256(JSON.stringify(candidate.fieldProofs)),
  fieldFailures: candidate.fieldFailures,
  features: CANDIDATE_FEATURES.map(feature => candidate.analyze(feature).coverage),
}, null, 2));
