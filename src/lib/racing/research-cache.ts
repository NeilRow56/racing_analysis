import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** Bounded, process-local derived cache. Coalesces concurrent reads; never caches failures.
 * The caller supplies source identity on EVERY request, so workflow writes invalidate
 * without a Next restart. A changed source during a read is retried on the next visit.
 */
export function createResearchCache<T>(maxAgeMs = Infinity) {
  let entry: { key: string; expires: number; value: Promise<T> } | undefined;
  return (key: string, calculate: () => Promise<T>): Promise<T> => {
    if (entry?.key === key && Date.now() < entry.expires) return entry.value;
    const value = Promise.resolve().then(calculate);
    const next = { key, expires: Date.now() + maxAgeMs, value };
    entry = next;
    void value.catch(() => { if (entry === next) entry = undefined; });
    return value;
  };
}

/** Only ledger JSON files and the small chase snapshot directory, never holdout
 * archives/large nested diagnostic caches. Atomic renames and same-size edits
 * change inode/ctime/mtime. Missing directories are valid empty sources.
 */
export async function researchFileIdentity(directory = "data/research"): Promise<string> {
  const files: string[] = [];
  for (const path of [directory, join(directory, "chase-speed-reliability-shadow-v1")]) {
    try {
      for (const name of (await readdir(path)).filter(n => n.endsWith(".json")).sort()) files.push(join(path, name));
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return JSON.stringify(await Promise.all(files.map(async path => {
    try {
      const info = await stat(path, { bigint: true });
      return [path, String(info.ino), String(info.size), String(info.mtimeNs), String(info.ctimeNs)];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return [path, "missing"];
    }
  })));
}
