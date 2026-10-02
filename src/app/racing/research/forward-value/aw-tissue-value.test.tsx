import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AwTissueValueSection } from "./aw-tissue-value";
import { emptyAwTissueForward } from "@/lib/racing/aw-tissue-forward";
import { AwTissueCell } from "../../today/page";
import type { TodayRunner } from "@/lib/racing/todays-racing";

test("AW Forward Value has a separate responsive section and explicit empty state", () => {
  const html = renderToStaticMarkup(<AwTissueValueSection data={emptyAwTissueForward()} ratings={[]} />);
  assert.match(html, /AW Tissue \(diagnostic\)/);
  assert.match(html, /No prospective AW Tissue observations/);
  assert.match(html, /Median bookmaker/);
  assert.match(html, /T-180/);
  assert.match(html, /Final SP/);
  assert.match(html, /overflow-x-auto/);
});

test("Today shows frozen AW probability/rank, zero history and explicit unavailable state", () => {
  const runner = { awTissue: { predictionAvailable: true, probability: .234, rank: 2, zeroHistoryRunner: true } } as TodayRunner;
  const html = renderToStaticMarkup(<AwTissueCell runner={runner} />);
  assert.match(html, /23\.4%/);
  assert.match(html, /#2/);
  assert.match(html, /0 prior AW starts/);
  const unavailable = { awTissue: { predictionAvailable: false, probability: null, unavailableReason: "prior_aw_starts_unavailable" } } as TodayRunner;
  assert.match(renderToStaticMarkup(<AwTissueCell runner={unavailable} />), /prior_aw_starts_unavailable/);
});
