import { collectionEpochReport } from "@/lib/racing/prospective-epoch-report";
console.log(JSON.stringify(await collectionEpochReport(), null, 2));
