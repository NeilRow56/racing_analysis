import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Home from "./page";

describe("home route", () => {
  test("renders primary navigation routes", () => {
    const text = collectText(Home()).join(" ");

    assert.match(text, /Today/);
    assert.match(text, /Research Filters/);
    assert.equal(text.includes("/racing/today"), true);
    assert.equal(text.includes("/racing/research"), true);
  });
});

function collectText(value: unknown, seen = new WeakSet<object>()): string[] {
  if (value === null || value === undefined || typeof value === "boolean") {
    return [];
  }
  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectText(item, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return [];
    }
    seen.add(value);
    const record = value as { props?: { children?: unknown; href?: unknown } };
    return [
      ...collectText(record.props?.href, seen),
      ...collectText(record.props?.children, seen),
    ];
  }
  return [];
}
