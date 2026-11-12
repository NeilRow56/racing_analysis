import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const root = "data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te";
async function digest(path: string) { const h = createHash("sha256"); for await (const chunk of createReadStream(path)) h.update(chunk); return h.digest("hex"); }
async function files(path: string): Promise<string[]> { const entries = await readdir(path, { withFileTypes: true }); const found: string[] = []; for (const e of entries) { const p = join(path,e.name); if (p===root) continue; if(e.isDirectory()) found.push(...await files(p)); else if(e.isFile()) found.push(p); } return found; }
if (process.argv[2]==="before") {
 const paths = [...(await files("data/research")), ...(await files("data/raw/sporting-life")), ...(await files("data/corrections")), ...(await files("src")), ...(await files("scripts")), ...(await files("docs")), "package.json", "bun.lock", "tsconfig.json", "AGENTS.md"].sort();
 const hashes: Record<string,string> = {};
 for(const [i,path] of paths.entries()) { hashes[path]=await digest(path); if(i%5000===0) console.log(`hashed ${i}/${paths.length}`); }
 await writeFile(join(root,"preservation-before.json"),JSON.stringify(hashes,null,2)+"\n",{flag:"wx"}); console.log(`Protected ${paths.length} original files`);
} else {
 const before: Record<string,string> = JSON.parse(await readFile(join(root,"preservation-before.json"),"utf8")); const changed=[];
 for(const [path,expected] of Object.entries(before)) { const actual=await digest(path); if(actual!==expected) changed.push({path,expected,actual}); }
 await writeFile(join(root,"preservation-after.json"),JSON.stringify({filesChecked:Object.keys(before).length,changed,unchanged:changed.length===0},null,2)+"\n");
 console.log(JSON.stringify({filesChecked:Object.keys(before).length,changed})); if(changed.length) process.exitCode=1;
}
