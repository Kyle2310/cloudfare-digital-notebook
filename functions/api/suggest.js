// Hộp góp ý cho bản Cloudflare Pages — lưu trong database D1 (gắn tên "DB").
// POST   /api/suggest { ten-quan, dia-chi, ... }               -> người đọc gửi góp ý
// GET    /api/suggest   + "Authorization: Bearer <ADMIN_KEY>"  -> admin xem danh sách (mới nhất trước)
// DELETE /api/suggest { id? } + "Authorization: Bearer ..."    -> admin xoá 1 góp ý (có id) hoặc tất cả

const FIELDS = { "ten-quan": 120, "dia-chi": 200, "loai-quan": 60, "nen-thu": 160, "ly-do": 400, "khac": 200,
  "trai-nghiem": 600, "so-sao": 3, "khoang-cach": 60, "nguoi-goi-y": 60, "lop": 30 };
const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function ready(env) {
  if (!env.DB) throw new Error("Chưa gắn database D1 tên DB");
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT NOT NULL, data TEXT NOT NULL)").run();
  return env.DB;
}
const isAdmin = (request, env) => {
  const sent = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return !!env.ADMIN_KEY && sent === env.ADMIN_KEY;
};

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
  if (!body || typeof body !== "object") return new Response("Bad form", { status: 400 });
  if (body["bot-field"]) return json({ ok: true });                 // bẫy máy spam: giả vờ nhận
  const data = {};
  for (const [k, max] of Object.entries(FIELDS)) data[k] = String(body[k] ?? "").trim().slice(0, max);
  if (!data["ten-quan"] || !data["dia-chi"] || !data["trai-nghiem"]) return new Response("Thiếu ô bắt buộc", { status: 400 });
  const db = await ready(env);
  await db.prepare("INSERT INTO suggestions (created, data) VALUES (?, ?)").bind(new Date().toISOString(), JSON.stringify(data)).run();
  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  if (!isAdmin(request, env)) return new Response("Sai mã admin", { status: 403 });
  const db = await ready(env);
  const { results } = await db.prepare("SELECT id, created, data FROM suggestions ORDER BY id DESC LIMIT 500").all();
  return json(results.map(r => ({ id: r.id, created: r.created, ...JSON.parse(r.data) })));
}

export async function onRequestDelete({ request, env }) {
  if (!isAdmin(request, env)) return new Response("Sai mã admin", { status: 403 });
  let body = {};
  try { body = await request.json(); } catch {}
  const db = await ready(env);
  const r = body && body.id
    ? await db.prepare("DELETE FROM suggestions WHERE id = ?").bind(Number(body.id)).run()
    : await db.prepare("DELETE FROM suggestions").run();
  return json({ deleted: r.meta.changes });
}
