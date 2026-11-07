import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/** Generation-ledger lock and atomic-replace protocol shared by paired shadows. */
export async function mutateFrozenJson<T>(path: string, load: () => Promise<T>, parse: (value: unknown) => T,
  validateChange: (before: T, after: T) => void, mutate: (data: T) => T | Promise<T>) {
  const lock = `${resolve(path)}.lock`; await mkdir(dirname(lock), { recursive: true }); const deadline = Date.now() + 30000;
  while (true) { try { await mkdir(lock); break; } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() > deadline) throw e; await new Promise(r => setTimeout(r, 10)); } }
  let temporary: string | undefined;
  try {
    const before = await load(), after = parse(await mutate(structuredClone(before)));
    validateChange(before, after);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      temporary = `${path}.tmp-${process.pid}`; await writeFile(temporary, JSON.stringify(after, null, 2) + "\n"); await rename(temporary, path);
    }
    return after;
  } finally { if (temporary) await rm(temporary, { force: true }); await rm(lock, { recursive: true, force: true }); }
}
