import type { SportingLifeBookmakerQuote } from "@/lib/racing/todays-racing";

export function BookmakerQuoteLines({ quotes }: { quotes: SportingLifeBookmakerQuote[] }) {
  const occurrences = new Map<string, number>();
  return quotes.map((quote) => {
    const identity = JSON.stringify([quote.bookmakerId, quote.bookmakerName, quote.decimalOdds, quote.fractionalOdds]);
    // Frozen source quotes have no record IDs or individual timestamps. Preserve
    // identical entries and distinguish only their occurrences within this list.
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return <p key={`${identity}:${occurrence}`}>{quote.bookmakerName ?? quote.bookmakerId ?? "Unknown"}: {quote.fractionalOdds ? `${quote.fractionalOdds} (${quote.decimalOdds.toFixed(2)})` : quote.decimalOdds.toFixed(2)}</p>;
  });
}
