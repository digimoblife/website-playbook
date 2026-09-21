import { getCurrentUser } from "@/lib/dal";
import { getMediaForViewer, readStoredImage } from "@/lib/media";

// Semua gambar disajikan lewat rute ini (tidak ada berkas statis). Wajib login. Keputusan akses
// ada di getMediaForViewer -> canView() (lib/access.ts). "Tidak ada" dan "tidak boleh" menjawab
// 404 yang persis sama supaya keberadaan gambar tidak bisa ditebak.
function notFound(): Response {
  return new Response("Tidak ditemukan", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  if (!/^[1-9][0-9]{0,9}$/.test(id)) return notFound();

  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return notFound();

  const found = getMediaForViewer(user, Number(id));
  if (!found) return notFound();
  const bytes = await readStoredImage(found.name);
  if (!bytes) return notFound();

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": found.mime, // dari jenis yang sudah divalidasi saat unggah
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
