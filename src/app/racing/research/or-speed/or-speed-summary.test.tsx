import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyOrSpeed } from "@/lib/racing/or-speed-forward";
import { OrSpeedSummary } from "./or-speed-summary";

test("read-only summary renders both families, all cohorts, epoch and cautious empty samples", () => {
  const data = emptyOrSpeed(), before = JSON.stringify(data);
  const html = renderToStaticMarkup(<OrSpeedSummary data={data} />);
  for (const text of [data.epoch, "TURF", "AW", "ALL SPEED EDGES", "TOP-3 OR SPEED EDGES", "OR RANK 4+ SPEED EDGES", "EDGE &gt;=10", "TOP-3 OR + EDGE &gt;=10", "Mean normalized finish", "Top-3 finish %", "Small samples do not establish significance."]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/>TOO EARLY</g) ?? []).length, 10);
  assert.ok(!html.includes("<form")); assert.equal(JSON.stringify(data), before);
});
