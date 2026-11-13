// Cloudflare Worker cho cuốn sổ: các file của trang (html, ảnh, nhạc...) Cloudflare tự phục vụ;
// file này chỉ chạy cho 2 đường dẫn máy chủ: /api/votes (lượt 👍) và /api/suggest (hộp góp ý).
// Code xử lý nằm trong functions/api/*.js (dùng chung với bản Cloudflare Pages).
// Cài đặt: wrangler.jsonc (database D1 tên "DB") + secret ADMIN_KEY trong Settings → Variables and Secrets.
import * as votes from "./functions/api/votes.js";
import * as suggest from "./functions/api/suggest.js";

const ROUTES = { "/api/votes": votes, "/api/suggest": suggest };

export default {
  async fetch(request, env) {
    const mod = ROUTES[new URL(request.url).pathname];
    if (!mod) return env.ASSETS.fetch(request);
    const m = request.method.toUpperCase();
    const handler = mod["onRequest" + m.charAt(0) + m.slice(1).toLowerCase()];
    if (!handler) return new Response("Method not allowed", { status: 405 });
    try {
      return await handler({ request, env });
    } catch (e) {
      return new Response("Lỗi máy chủ: " + (e && e.message || e), { status: 500 });
    }
  }
};
