import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { isLongerPriceTissueTop2, LONGER_PRICE_TISSUE_WATCH_TOOLTIP } from "@/lib/racing/longer-price-tissue-watch";
import type { FrozenValueDisplay } from "@/lib/racing/tissue-value-view";
import { FrozenValueRankCell } from "./tissue-cells";

const frozen = (overrides: Partial<FrozenValueDisplay> = {}): FrozenValueDisplay => ({
  family: "TURF", modelVersion: "tissue_model_v3", valueTrackerVersion: "TURF_TISSUE_V3_VALUE_FORWARD_V1",
  capturedAt: "2026-10-29T08:00:00Z", probability: .2, tissueRank: 1, valueRank: 9,
  marketRank: 4, marketPrice: 11, marketProbability: .08, modelMarketRatio: 2.5, ...overrides,
});
const render = (row?: Partial<FrozenValueDisplay>) => renderToStaticMarkup(<FrozenValueRankCell runner={{ tissueValue: row }} kind="tissueRank" />);

for (const [tissueRank, capturedPrice, expected] of [
  [1, 11, true], [2, 7, true], [1, 6.5, true], [1, 6, false], [2, 5.5, false], [3, 11, false],
  [1, null, false], [2, undefined, false], [1, NaN, false], [2, Infinity, false], [1, -11, false],
  [null, 11, false], [undefined, 11, false],
] as const) test(`longer-price Tissue ${tissueRank}, captured price ${capturedPrice}: ${expected}`, () => {
  assert.equal(isLongerPriceTissueTop2({ tissueRank, capturedPrice }), expected);
  const row: Partial<FrozenValueDisplay> = frozen({ tissueRank: tissueRank ?? undefined });
  if (capturedPrice == null) delete row.marketPrice;
  else row.marketPrice = capturedPrice;
  assert.equal(render(row).includes("border-blue-200 bg-blue-50"), expected);
});

test("all four families use frozen price and Tissue rank independently of Value rank", () => {
  for (const family of ["TURF", "AW", "HURDLE", "CHASE"] as const) for (const tissueRank of [1, 2]) {
    for (const valueRank of [1, 3, 9]) {
      const row = frozen({ family, tissueRank, valueRank }), before = JSON.stringify(row), html = render(row);
      assert.ok(html.includes("border-blue-200 bg-blue-50"));
      assert.ok(html.includes(LONGER_PRICE_TISSUE_WATCH_TOOLTIP));
      assert.equal(JSON.stringify(row), before);
      for (const kind of ["valueRank", "marketRank"] as const) {
        const cell = (marketPrice: number) => renderToStaticMarkup(<FrozenValueRankCell runner={{ tissueValue: { ...row, marketPrice } }} kind={kind} />);
        // Provenance includes the price; the badge itself must remain neutral.
        assert.ok(!cell(11).includes("bg-blue-50"));
        assert.ok(!cell(5).includes("bg-blue-50"));
      }
    }
  }
});

test("pale-red Speed watch keeps priority with a separate blue Price marker", () => {
  for (const bestL3SpeedRank of [2, 3]) {
    const html = render(frozen({ bestL3SpeedRank }));
    assert.ok(html.includes("border-red-200 bg-red-50"));
    assert.ok(html.includes("Research watch: Tissue top-2 runner with Best L3 Speed rank 2–3."));
    assert.ok(html.includes('aria-label="Longer-price Tissue watch"'));
    assert.ok(html.includes('>Price</span>'));
    assert.ok(!html.includes("border-blue-200 bg-blue-50"));
    assert.ok(!render(frozen({ bestL3SpeedRank, marketPrice: 6 })).includes('>Price</span>'));
  }
});

test("amber Data caution markup stays identical alongside blue and red identification", () => {
  const inputReliability = { level: "CAUTION", reasons: ["Missing inputs."] } as const;
  const caution = (html: string) => html.match(/<span[^>]*aria-label="Tissue input data caution"[^>]*>Data<\/span>/)?.[0];
  for (const bestL3SpeedRank of [1, 2]) {
    const row = frozen({ tissueRank: 2, bestL3SpeedRank, inputReliability: { ...inputReliability, reasons: [...inputReliability.reasons] } });
    const html = render(row);
    assert.ok(html.includes(LONGER_PRICE_TISSUE_WATCH_TOOLTIP));
    assert.ok(caution(html)?.includes("border-amber-300"));
    assert.equal(caution(html), caution(render({ ...row, marketPrice: 5.5 })));
  }
});

test("current bookmaker movement, forecast, final SP and Betfair SP cannot change the frozen identification", () => {
  for (const capturedPrice of [5.5, 11]) {
    const runner = { tissueValue: frozen({ marketPrice: capturedPrice }), oddsDecimal: "11", forecastDecimalOdds: 11,
      startingPriceDecimal: "11", betfairSp: 11, bookmakerQuotes: [{ decimalOdds: 11 }] };
    const cell = () => renderToStaticMarkup(<FrozenValueRankCell runner={runner} kind="tissueRank" />);
    const before = cell();
    for (const later of [2, 7, 23, 99]) {
      runner.oddsDecimal = String(later); runner.forecastDecimalOdds = later;
      runner.startingPriceDecimal = String(later); runner.betfairSp = later; runner.bookmakerQuotes[0].decimalOdds = later;
      assert.equal(cell(), before);
    }
    delete (runner.tissueValue as Partial<FrozenValueDisplay>).marketPrice;
    assert.ok(!cell().includes(LONGER_PRICE_TISSUE_WATCH_TOOLTIP));
    assert.ok(!render().includes(LONGER_PRICE_TISSUE_WATCH_TOOLTIP));
  }
});
