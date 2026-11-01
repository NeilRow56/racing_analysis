import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BookmakerQuoteLines } from "./bookmaker-quote-lines";

test("quote keys preserve repeated, changed, and different bookmaker prices", () => {
  const quote = { bookmakerId: 4, bookmakerName: "Betfair Sportsbook", decimalOdds: 3.5, fractionalOdds: "5/2" };
  const quotes = [quote, { ...quote }, { ...quote, decimalOdds: 4, fractionalOdds: "3/1" },
    { ...quote, bookmakerId: 17, bookmakerName: "Sky Bet v2" },
    { ...quote, fractionalOdds: null }];
  const before = structuredClone(quotes);
  const lines = BookmakerQuoteLines({ quotes });
  assert.equal(new Set(lines.map(line => line.key)).size, quotes.length);
  assert.deepEqual(BookmakerQuoteLines({ quotes }).map(line => line.key), lines.map(line => line.key));
  // Unrelated insertions do not change existing quote identities.
  const inserted = BookmakerQuoteLines({ quotes: [{ ...quote, bookmakerId: 99 }, ...quotes] });
  assert.deepEqual(inserted.slice(1).map(line => line.key), lines.map(line => line.key));
  assert.deepEqual(quotes, before);
  const html = renderToStaticMarkup(<BookmakerQuoteLines quotes={quotes} />);
  assert.equal((html.match(/<p>/g) ?? []).length, quotes.length);
  assert.equal((html.match(/Betfair Sportsbook: 5\/2 \(3.50\)/g) ?? []).length, 2);
  assert.match(html, /Betfair Sportsbook: 3\/1 \(4.00\)/);
  assert.match(html, /Sky Bet v2: 5\/2 \(3.50\)/);
});
