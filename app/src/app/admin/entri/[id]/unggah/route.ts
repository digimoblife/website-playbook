import { isAdmin } from "@/lib/access";
import { getCurrentUser } from "@/lib/dal";
import { MAX_UPLOAD_BYTES, saveImage } from "@/lib/media";

// Unggah gambar untuk satu entri. Memakai route handler (bukan Server Action) karena berkas
// bisa sampai 10 MB. Admin diperiksa PERTAMA, sebelum badan permintaan dibaca. Nama berkas dari
// klien diabaikan sepenuhnya; jenis ditentukan dari isi berkas (lihat lib/media.ts).
const json = (status: number, body: object) => Response.json(body, { status });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) {
    return json(401, { ok: false, error: "Sesi berakhir. Masuk lagi." });
  }
  if (!isAdmin(user)) return json(404, { ok: false, error: "Tidak ditemukan." });

  // Perlindungan tambahan terhadap permintaan lintas situs (cookie sesi sudah SameSite=lax).
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin) {
    try {
      if (host && new URL(origin).host !== host) throw new Error("beda asal");
    } catch {
      return json(403, { ok: false, error: "Permintaan ditolak." });
    }
  }

  const { id } = await context.params;
  if (!/^[1-9][0-9]{0,9}$/.test(id)) return json(404, { ok: false, error: "Tidak ditemukan." });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return json(413, { ok: false, error: "Berkas terlalu besar." });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, error: "Permintaan tidak valid." });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json(400, { ok: false, error: "Pilih berkas gambar dulu." });

  const result = await saveImage({
    entryId: Number(id),
    bytes: new Uint8Array(await file.arrayBuffer()),
    kind: String(form.get("kind") ?? ""),
    actorId: user.id,
  });
  if (!result.ok) return json(400, result);
  return json(200, { ok: true, image: result.image });
}
