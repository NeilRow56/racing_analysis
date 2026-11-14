/** Server-only, opt-in diagnostics. Never log arguments, errors, SQL or credentials. */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type Context = { requestId: string; counts: Map<string, number>; sequence: { next: number }; parent?: number };
const scope = new AsyncLocalStorage<Context>();
const diagnostic = new AsyncLocalStorage<boolean>();
export const isReadOnlyDiagnostic = () => diagnostic.getStore() === true;
export const withReadOnlyDiagnostic = <T>(work: () => T): T => diagnostic.run(true, work);
export const profilingEnabled = () => process.env.RACING_PROFILE === "1" || process.env.RESEARCH_PROFILE === "1";

function emit(context: Context, operation: string, durationMs: number, status: string, spanId?: number, parentSpanId = context.parent) {
  const occurrence = (context.counts.get(operation) ?? 0) + 1;
  context.counts.set(operation, occurrence);
  // Diagnostics must never mask the application's result or exception.
  try { console.info(JSON.stringify({ type: "racing_profile", requestId: context.requestId, operation, durationMs: Math.round(durationMs * 100) / 100, status, spanId, parentSpanId, occurrence, repeated: occurrence > 1 })); } catch { /* logging is best effort */ }
}
export function recordTiming(operation: string, durationMs: number, status = "ok") {
  const context = scope.getStore();
  if (context) emit(context, operation, durationMs, status);
}
export function profileSync<T>(operation: string, work: () => T): T {
  const context = scope.getStore();
  if (!context) return work();
  const spanId = ++context.sequence.next;
  const start = performance.now();
  let status = "ok";
  try { return scope.run({ ...context, parent: spanId }, work); }
  catch (error) { status = "error"; throw error; }
  finally { emit(context, operation, performance.now() - start, status, spanId); }
}
export async function profileStage<T>(operation: string, work: () => Promise<T>): Promise<T> {
  const context = scope.getStore();
  if (!context) return work();
  const spanId = ++context.sequence.next;
  const start = performance.now();
  let status = "ok";
  try { return await scope.run({ ...context, parent: spanId }, work); }
  catch (error) { status = "error"; throw error; }
  finally { emit(context, operation, performance.now() - start, status, spanId); }
}
export function profileRequest<T>(operation: string, work: () => Promise<T>): Promise<T> {
  if (scope.getStore()) return profileStage(operation, work);
  if (!profilingEnabled()) return work();
  return scope.run({ requestId: randomUUID(), counts: new Map(), sequence: { next: 0 } }, () => profileStage(operation, work));
}
/** Capture context before React defers rendering a server component. */
export function bindProfileContext<T>(work: () => T): () => T {
  const context = scope.getStore();
  return () => context ? scope.run(context, work) : work();
}

export function profileCall<A extends unknown[], T>(operation: string, work: (...args: A) => Promise<T>, ...args: A): Promise<T> {
  return profileStage(operation, () => work(...args));
}
