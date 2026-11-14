import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

test("diagnostic CLI forces request-local read-only mode and PostgreSQL read-only options; completes both renders", () => {
  for (const page of ["today", "forward-value"]) {
    const code = `
      import {mock} from 'bun:test';
      import React from 'react';
      import {isReadOnlyDiagnostic} from './src/lib/racing/performance-profile';
      let calls=0;
      const Page=async()=>{
        if(!isReadOnlyDiagnostic())throw Error('missing read-only scope');
        const url=new URL(process.env.DATABASE_URL);
        if(url.searchParams.get('options')!=='-c default_transaction_read_only=on')throw Error('missing database read-only options');
        calls++;
        return React.createElement('p',null,'stored fixture');
      };
      mock.module('./src/app/racing/today/page',()=>({default:Page}));
      mock.module('./src/app/racing/research/forward-value/forward-value-page',()=>({default:Page}));
      process.argv=['bun','scripts/profile-pages.tsx',${JSON.stringify(page)}];
      process.env.DATABASE_URL='postgres://fixture:secret@example.invalid/fixture?options=unsafe';
      await import('./scripts/profile-pages');
      if(calls!==2||isReadOnlyDiagnostic())throw Error('diagnostic scope leaked or render incomplete');
    `;
    const result = spawnSync(process.execPath, ["--eval", code], { cwd: process.cwd(), env: { ...process.env }, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.stdout.includes("secret"));
    const rows = result.stdout.trim().split("\n").map(line => JSON.parse(line));
    assert.equal(new Set(rows.map(row => row.requestId)).size, 2);
    assert.equal(rows.filter(row => row.operation === "server_render").length, 2);
  }
});
