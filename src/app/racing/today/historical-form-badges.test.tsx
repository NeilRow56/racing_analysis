import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { HistoricalFormFlags } from "@/lib/racing/historical-form-flags";
import { HistoricalFormBadges } from "./historical-form-badges";
const flags: HistoricalFormFlags = {
  lastWinWithin3lbOr: true, lastWinningOr: 109, winningOrDifference: 2,
  courseFirstOrSecond: true, courseWins: 1, courseSeconds: 2,
  latestCourseFinish: { position: 2, raceDateTime: "2026-09-01T14:00:00Z" },
};
const render = (form?: HistoricalFormFlags) => renderToStaticMarkup(<HistoricalFormBadges flags={form} officialRating={107} />);
describe("racecard historical-form badges", () => {
  test("no enrichment renders nothing", () => assert.equal(render(), ""));
  test("ineligible flags render nothing", () => assert.equal(render({ ...flags, lastWinWithin3lbOr: false, courseFirstOrSecond: false }), ""));
  test("OR-only eligibility displays the correct winning and current marks", () => {
    const html = render({ ...flags, courseFirstOrSecond: false });
    assert.match(html, /OR ±3/); assert.doesNotMatch(html, /COURSE 1\/2/);
    assert.match(html, /Last win off OR 109; today&#x27;s OR 107/);
  });
  test("course-only eligibility includes counts and latest finish", () => {
    const html = render({ ...flags, lastWinWithin3lbOr: false });
    assert.match(html, /COURSE 1\/2/); assert.doesNotMatch(html, /OR ±3/);
    assert.match(html, /Course record: 1 win, 2 seconds; latest: 2nd on 2026-09-01/);
  });
  test("both badges can render together with distinct existing palette colours", () => {
    const html = render(flags); assert.match(html, /OR ±3/); assert.match(html, /COURSE 1\/2/);
    assert.match(html, /bg-amber-50/); assert.match(html, /bg-emerald-50/);
  });
});
