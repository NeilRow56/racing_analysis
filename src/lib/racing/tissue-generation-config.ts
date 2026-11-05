/** Activation is finalised only after the frozen models and integration checks are ready. */
export const TISSUE_GENERATION = "TISSUE_GENERATION_2026_11" as const;
export const TISSUE_GENERATION_EPOCH = "2026-11-05T07:26:36.629Z";
export const TISSUE_DEVELOPMENT_CUTOFF = "2026-11-05T06:57:32.000Z";
export const GENERATION_MODEL_HASHES: Record<string, string> = {
  "TURF": "e106fadd07263b1fcc4ece821a4bfcad645faeae873db026433a4902eabbe3fe",
  "AW": "c8f75faa0aeacc88ba76f100e7d154a872bc9b2ee31a5a42d18e611e3e64f9a5",
  "HURDLE": "53defc50d717aba63c80c9f3c01c4df4360b709f6f4a21509a514179e23cce90",
  "CHASE": "be65702490403f6a287d11ecb19307a67b58ca975ee7bd9ece71b4e0d759aa81"
};
export function tissueGenerationActive(at = new Date()): boolean {
  return Number.isFinite(at.getTime()) && at.getTime() >= Date.parse(TISSUE_GENERATION_EPOCH);
}
export const retiredTissueCaptureAllowed = (capturedAt: string) => Date.parse(capturedAt) < Date.parse(TISSUE_GENERATION_EPOCH);
