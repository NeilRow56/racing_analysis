import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import OrSpeedPage from "./page";

test("old route redirects to the expanded Forward Research monitoring section", () => {
  assert.throws(() => OrSpeedPage(), (error: unknown) => {
    assert.ok(error instanceof Error && "digest" in error);
    assert.equal(error.digest, "NEXT_REDIRECT;replace;/racing/research/forward-value?monitor=or-speed#or-speed-monitoring;307;");
    return true;
  });
});

test("Research navigation retains Forward Research and removes the standalone OR + Speed entry", async () => {
  const source = await readFile("src/app/racing/research/page.tsx", "utf8");
  assert.match(source, /href="\/racing\/research\/forward-value"/);
  assert.doesNotMatch(source, /href="\/racing\/research\/or-speed"|OR \+ Speed Research/);
});
