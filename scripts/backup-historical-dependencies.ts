// Reviewed historical ledger dependencies only; never used by collection guards.
// Git bytes are verified against the original ledger hash before archiving.
export const HISTORICAL_DEPENDENCIES = [
  {
    "owner": "hurdle-v3-prospective-shadow-v1.json",
    "path": "src/lib/racing/hurdle-v3-challenger-features.ts",
    "expected": "acfc91b8ccab7991868ef1fa3128c5fbd5320b04936c34bd65ddc039ab46b86f",
    "current": "d8285c3f117813b41b191ba06e08f10dfabe99ccffc66884c5a46d074814a858",
    "revision": "f6ef593db20e3ff2367c52dbc4626493e3bdddee"
  },
  {
    "owner": "hurdle-v3-prospective-shadow-v1.json",
    "path": "src/lib/racing/hurdle-v3-shadow-sync.ts",
    "expected": "8e2947d0e0525614c408e23528f4733a23e272f353e1d1ea52eec180de3803dc",
    "current": "cea47bb18e7e371ca94fa57cd4082c2a3d42e7845ada87fb794c4211015fc93e",
    "revision": "416dc9cabfccbded40018f2ab3ea5281f630943e"
  },
  {
    "owner": "hurdle-v3-prospective-shadow-v1.json",
    "path": "src/lib/racing/backtest.ts",
    "expected": "706244d81205ca3d87aa31619c2e7b5f44ff97a32780f8fbc9543524115bbef4",
    "current": "b078ee2c1473903facb2fc9ed6c81424c0bfbc56742091d7f1e25d1c968839f8",
    "revision": "c27dd1594ee38d5dff709600a474beaea6207d1e"
  },
  {
    "owner": "hurdle-v3-market-edge-prospective-v1.json",
    "path": "src/lib/racing/hurdle-v3-market-edge.ts",
    "expected": "2b9a8681f36f469f6d29b350132a37b26ca26efbae2602e1359ac1f66237dbb3",
    "current": "004fc189541d6459c43e421cc5a9eacc555b0d2260a8176878fb928f5ac95dc9",
    "revision": "77167d7287dc8280df6a8411aa3845e85369d348"
  },
  {
    "owner": "hurdle-v3-market-edge-prospective-v1.json",
    "path": "src/lib/racing/hurdle-v3-challenger-features.ts",
    "expected": "acfc91b8ccab7991868ef1fa3128c5fbd5320b04936c34bd65ddc039ab46b86f",
    "current": "d8285c3f117813b41b191ba06e08f10dfabe99ccffc66884c5a46d074814a858",
    "revision": "f6ef593db20e3ff2367c52dbc4626493e3bdddee"
  },
  {
    "owner": "tissue-positive-neutral-prospective-v1.json",
    "path": "src/lib/racing/tissue-generation-forward.ts",
    "expected": "aaa05107464bb76c6bc8b275005917792b411db15bf80d722aef428a8c087c36",
    "current": "a3848acc043e85d2cea8af10e9c64e927720fae0634d91692ea34f7578aa3782",
    "revision": "77167d7287dc8280df6a8411aa3845e85369d348"
  },
  {
    "owner": "turf-2027-early-season-v1.json",
    "path": "src/lib/racing/turf-early-season.ts",
    "expected": "b804276dda20baa62ef14cd4599ce1f2343937c82d9de86eca03e5cdbfdc47c0",
    "current": "d58c93f61614e2906d66c8f8cf2bfc1dfff759ec19ba8fbd3736bb9d40a215d1",
    "revision": "77167d7287dc8280df6a8411aa3845e85369d348"
  },
  {
    "owner": "turf-2027-early-season-v1.json",
    "path": "src/lib/racing/turf-early-season-inputs.ts",
    "expected": "8084678fd3b79d000f4ef16bb5c0f5ef692e8cc7861b5e35ea1e15f8c008daff",
    "current": "0f87d766700d6175a25727b30fef651292f3f5e6eca47b04ef6884f617b0117a",
    "revision": "77167d7287dc8280df6a8411aa3845e85369d348"
  }
] as const;
