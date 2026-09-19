import assert from "node:assert/strict";
import { describe, test } from "node:test";

describe("Next.js response compression", () => {
  test("is disabled for the development server", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    Reflect.set(process.env, "NODE_ENV", "development");

    try {
      const { default: config } = await import(`./next.config.ts?development=${Date.now()}`);
      assert.equal(config.compress, false);
    } finally {
      if (previousNodeEnv === undefined) {
        Reflect.deleteProperty(process.env, "NODE_ENV");
      } else {
        Reflect.set(process.env, "NODE_ENV", previousNodeEnv);
      }
    }
  });

  test("remains enabled outside the development server", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    Reflect.set(process.env, "NODE_ENV", "production");

    try {
      const { default: config } = await import(`./next.config.ts?production=${Date.now()}`);
      assert.equal(config.compress, true);
    } finally {
      if (previousNodeEnv === undefined) {
        Reflect.deleteProperty(process.env, "NODE_ENV");
      } else {
        Reflect.set(process.env, "NODE_ENV", previousNodeEnv);
      }
    }
  });
});
