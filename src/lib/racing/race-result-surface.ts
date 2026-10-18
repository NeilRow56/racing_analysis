import { and, eq, sql } from "drizzle-orm";
import { races, sourceImports } from "@/db/schema";

// The unique (source, source_type, source_id) index guarantees at most one row.
// Keep this lookup correlated to a matching race: filtering the imported JSON
// in a join can make PostgreSQL decompress every result payload before joining.
export function raceResultSurface(source: string) {
  return sql<string | null>`(
    select ${sourceImports.payload} #>> '{props,pageProps,race,race_summary,course_surface,surface}'
    from ${sourceImports}
    where ${and(
      eq(sourceImports.source, source),
      eq(sourceImports.sourceType, "full-result-next-data"),
      eq(sourceImports.sourceId, races.sourceId),
    )}
  )`;
}
