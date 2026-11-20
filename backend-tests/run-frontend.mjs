// Front-end tests, in independent parts (each boots its own local site + D1 on its own ports, so they can run side by side).
//   node run-frontend.mjs                 all parts (side by side when the machine has 4+ cores, one after another otherwise)
//   node run-frontend.mjs pages           only the named part(s): sync import account admin pages
//   FE_PARALLEL=1 / FE_PARALLEL=0         force side by side / one after another
// A part can also be run alone: node fe/part-pages.mjs   (the part that matters after a page or style change is `pages`, about 15 s)
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here  = path.dirname(fileURLToPath(import.meta.url));
const ALL   = ['sync', 'import', 'account', 'admin', 'pages'];
const asked = process.argv.slice(2).filter((a) => ALL.includes(a));
const parts = asked.length ? asked : ALL;
const parallel = process.env.FE_PARALLEL ? process.env.FE_PARALLEL !== '0' : os.cpus().length >= 4;

function run(name, idx) {
  return new Promise((resolve) => {
    const env = { ...process.env, FE_PORT: String(8789 + idx * 10), FE_GH_PORT: String(8798 + idx * 10) };
    const t0 = Date.now();
    const p = spawn(process.execPath, [path.join(here, 'fe', `part-${name}.mjs`)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (!parallel) process.stdout.write(d); });
    p.stderr.on('data', (d) => { out += d; if (!parallel) process.stderr.write(d); });
    p.on('close', (code) => {
      const m = out.match(/(\d+) passed, (\d+) failed/);
      const failed = (out.match(/^Failed: (.*)$/m) || [])[1] || '';
      if (parallel) process.stdout.write(out);
      resolve({ name, code, pass: m ? +m[1] : 0, fail: m ? +m[2] : 1, secs: Math.round((Date.now() - t0) / 1000), failed: m ? failed : 'part did not finish (no summary line)' });
    });
  });
}

const results = parallel ? await Promise.all(parts.map(run)) : await (async () => { const r = []; for (let i = 0; i < parts.length; i++) { console.log(`\n=== part: ${parts[i]} ===`); r.push(await run(parts[i], i)); } return r; })();
console.log('\n=== summary ===');
let pass = 0, fail = 0;
for (const r of results) { pass += r.pass; fail += r.fail; console.log(`${r.fail ? 'FAIL' : 'ok  '} ${r.name.padEnd(8)} ${String(r.pass).padStart(3)} passed, ${r.fail} failed  (${r.secs}s)${r.failed ? '  <- ' + r.failed : ''}`); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
