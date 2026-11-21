// Admin only. Reads and changes the site structure in config/modules.json through the GitHub API (one commit on main per change).
//   GET  /api/admin/config                      -> { ok, config, sha }   (fresh from GitHub, never a stale deployed copy)
//   POST /api/admin/config  { action, ... }     -> { ok, config, sha, topicId? }
//     set_module  { moduleId, ongoing?, hidden? }                       ongoing is exclusive: switching one module on switches the others off
//     set_topic   { moduleId, exam, subject, topicId, label?, professor?, hidden? }
//     add_topic   { moduleId, exam, subject, label, professor? }        creates an EMPTY data file and registers the topic as hidden
// "hidden: true" means students do not see it; admins still do (with a Hidden badge). A missing field means visible.
// The change is read-modify-write on the latest file (retried once if someone else committed in between), so two admins do not overwrite each other.
import { json, readJson, errorResponse, HttpError } from '../../_lib/http.js';
import { requireAdmin } from '../../_lib/admin.js';
import { gh, readFile, writeFile, listDataFiles } from '../../_lib/github.js';
import { applyConfigOp, bad } from '../../_lib/adminops.js';

const CFG = 'config/modules.json';
async function load(g) {
  const f = await readFile(g, CFG);
  let cfg; try { cfg = JSON.parse(f.text); } catch (e) { throw new HttpError(422, 'bad_file', 'config/modules.json is not valid JSON'); }
  if (!cfg || !Array.isArray(cfg.modules)) throw new HttpError(422, 'bad_file', 'config/modules.json has no modules');
  return { cfg, sha: f.sha, nl: f.text.endsWith('\n') };
}

export async function onRequest({ request, env, data }) {
  try {
    await requireAdmin(env, data);
    const g = gh(request, env);
    if (request.method === 'GET') { const c = await load(g); return json({ ok: true, config: c.cfg, sha: c.sha, files: await listDataFiles(g) }); }
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use GET or POST');
    const b = await readJson(request);
    if (!['set_module', 'set_topic', 'add_topic'].includes(b.action)) throw bad('unknown action');
    let fileMade = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const c = await load(g);
      const r = applyConfigOp(c.cfg, b);
      if (r.file && !fileMade) {   // the data file goes in first; until the config names it, nobody can see it
        if (await readFile(g, r.file.path, true)) throw new HttpError(409, 'exists', 'A data file with that name already exists in the repository');
        await writeFile(g, r.file.path, r.file.text, null, 'Admin: create ' + r.file.path);
        fileMade = true;
      }
      try {
        const sha = await writeFile(g, CFG, JSON.stringify(c.cfg, null, 2) + (c.nl ? '\n' : ''), c.sha, r.msg);
        return json({ ok: true, config: c.cfg, sha, topicId: r.topicId || null });
      } catch (e) {
        if (!(e instanceof HttpError) || e.code !== 'file_changed' || attempt === 1) throw e;
      }
    }
  } catch (err) {
    return errorResponse(err);
  }
}
