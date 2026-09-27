import { getGithubConfig } from "@/lib/settings";
import { handleWebhook, MAX_WEBHOOK_BYTES, verifySignature } from "@/lib/github-webhook";

// Webhook GitHub (Langkah 6c). SATU-SATUNYA rute yang bisa dipanggil tanpa login (dikecualikan di
// proxy.ts), karena pemanggilnya GitHub. Sebagai gantinya setiap kiriman wajib bertanda tangan
// GITHUB_WEBHOOK_SECRET; tanpa rahasia itu semua kiriman ditolak. Jawaban tidak pernah memuat
// data dari database.
const reply = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) return reply(503, "Webhook belum dikonfigurasi.");

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_WEBHOOK_BYTES) return reply(413, "Kiriman terlalu besar.");
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAX_WEBHOOK_BYTES) return reply(413, "Kiriman terlalu besar.");

  // Tanda tangan diperiksa SEBELUM isi dibaca sebagai JSON.
  if (!verifySignature(secret, body, request.headers.get("x-hub-signature-256"))) {
    return reply(401, "Tanda tangan tidak valid.");
  }

  const event = request.headers.get("x-github-event") ?? "";
  const deliveryId = request.headers.get("x-github-delivery") ?? "";
  if (!event || !deliveryId) return reply(400, "Header GitHub tidak lengkap.");

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return reply(400, "Isi bukan JSON yang sah.");
  }

  const outcome = handleWebhook({
    event,
    deliveryId,
    payload,
    configuredRepo: getGithubConfig()?.repo ?? null,
  });
  return reply(outcome.status, outcome.message);
}
