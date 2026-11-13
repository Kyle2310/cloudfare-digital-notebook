// Bản Cloudflare Pages của netlify/functions/votes.mjs — lưu lượt 👍 trong database D1 (gắn tên "DB").
// GET    /api/votes                          -> { "pho-goc-cho": { up: 12, down: 0, v: 0 }, ... }
// POST   /api/votes { id, from, to, v }      -> { up, down, v } của quán đó
// DELETE /api/votes { id? } + "Authorization: Bearer <ADMIN_KEY>" -> đưa 1 quán / tất cả về 0
// ADMIN_KEY đặt trong Cloudflare: project → Settings → Variables and Secrets.

const ID = /^[a-z0-9-]{1,80}$/;
const VALID = new Set(["up", "down", null]);
const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function ready(env) {
  if (!env.DB) throw new Error("Chưa gắn database D1 tên DB");
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS votes (id TEXT PRIMARY KEY, up INTEGER NOT NULL DEFAULT 0, down INTEGER NOT NULL DEFAULT 0, v INTEGER NOT NULL DEFAULT 0)").run();
  return env.DB;
}
const isAdmin = (request, env) => {
  const sent = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return !!env.ADMIN_KEY && sent === env.ADMIN_KEY;
};

export async function onRequestGet({ env }) {
  const db = await ready(env);
  const { results } = await db.prepare("SELECT id, up, down, v FROM votes").all();
  return json(Object.fromEntries(results.map(r => [r.id, { up: r.up, down: r.down, v: r.v }])));
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
  const { id, from = null, to = null, v = 0 } = body || {};
  if (typeof id !== "string" || !ID.test(id) || !VALID.has(from) || !VALID.has(to) || from === to) {
    return new Response("Bad vote", { status: 400 });
  }
  const db = await ready(env);
  const steps = [db.prepare("INSERT INTO votes (id) VALUES (?) ON CONFLICT(id) DO NOTHING").bind(id)];
  // chỉ trừ lựa chọn cũ nếu quán chưa bị admin reset kể từ lúc người này bấm (v khớp)
  if (from) steps.push(db.prepare(`UPDATE votes SET ${from} = MAX(0, ${from} - 1) WHERE id = ? AND v = ?`).bind(id, Number(v) || 0));
  if (to) steps.push(db.prepare(`UPDATE votes SET ${to} = ${to} + 1 WHERE id = ?`).bind(id));
  steps.push(db.prepare("SELECT up, down, v FROM votes WHERE id = ?").bind(id));
  const out = await db.batch(steps);
  return json(out[out.length - 1].results[0]);
}

export async function onRequestDelete({ request, env }) {
  if (!isAdmin(request, env)) return new Response("Sai mã admin", { status: 403 });
  let body = {};
  try { body = await request.json(); } catch {}
  const db = await ready(env);
  let r;
  if (body && body.id) {
    if (typeof body.id !== "string" || !ID.test(body.id)) return new Response("Bad id", { status: 400 });
    r = await db.prepare("INSERT INTO votes (id, up, down, v) VALUES (?, 0, 0, 1) ON CONFLICT(id) DO UPDATE SET up = 0, down = 0, v = v + 1").bind(body.id).run();
  } else {
    r = await db.prepare("UPDATE votes SET up = 0, down = 0, v = v + 1").run();
  }
  return json({ reset: r.meta.changes });
}
