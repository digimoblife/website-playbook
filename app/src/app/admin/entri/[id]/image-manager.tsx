"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteMediaAction } from "@/app/admin/entri/actions";
import { InlineConfirm } from "@/components/inline-confirm";
import type { ImageInfo } from "@/lib/admin-entries";
import { LIMITS } from "@/lib/domain";
import { MEDIA_KIND_LABEL } from "@/lib/labels";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_CLIENT_BYTES = 10 * 1024 * 1024;

type Notice = { ok: boolean; text: string } | null;

export function ImageManager({ entryId, images }: { entryId: number; images: ImageInfo[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("screenshot");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setNotice({ ok: false, text: "Pilih berkas gambar dulu." });
      return;
    }
    if (file.size > MAX_CLIENT_BYTES) {
      setNotice({ ok: false, text: "Berkas terlalu besar. PNG, JPEG, dan WebP maksimal 5 MB; GIF maksimal 10 MB." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      const res = await fetch(`/admin/entri/${entryId}/unggah`, { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && json?.ok) {
        setNotice({ ok: true, text: "Gambar diunggah." });
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else {
        setNotice({ ok: false, text: json?.error ?? "Unggahan gagal. Coba lagi." });
      }
    } catch {
      setNotice({ ok: false, text: "Unggahan gagal. Periksa koneksi Anda, lalu coba lagi." });
    } finally {
      setBusy(false);
    }
  }

  function remove(id: number) {
    startTransition(async () => {
      const form = new FormData();
      form.set("id", String(id));
      const res = await deleteMediaAction(undefined, form);
      setNotice(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
      router.refresh();
    });
  }

  const full = images.length >= LIMITS.imagesPerEntry;

  return (
    <div>
      <div className="upload-row">
        <div className="field">
          <label htmlFor="berkas-gambar">Berkas gambar</label>
          <input id="berkas-gambar" ref={fileRef} type="file" accept={ACCEPT} disabled={busy || full} />
        </div>
        <div className="field">
          <label htmlFor="jenis-gambar">Jenis gambar</label>
          <select
            id="jenis-gambar"
            className="select"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={busy || full}
          >
            <option value="screenshot">Screenshot</option>
            <option value="promo">Gambar promosi</option>
          </select>
        </div>
        <button type="button" className="btn btn-primary" onClick={upload} disabled={busy || full}>
          {busy ? "Mengunggah…" : "Unggah"}
        </button>
      </div>
      <p className="note">
        PNG, JPEG, dan WebP maksimal 5 MB; GIF maksimal 10 MB (GIF otomatis bertanda GIF). {images.length} dari{" "}
        {LIMITS.imagesPerEntry} gambar.
      </p>

      {notice && (
        <div
          role={notice.ok ? "status" : "alert"}
          className={`alert ${notice.ok ? "alert-success" : "alert-danger"}`}
          style={{ marginTop: "0.75rem" }}
        >
          {notice.text}
        </div>
      )}

      {images.length > 0 && (
        <ul className="image-grid">
          {images.map((image, index) => (
            <li key={image.id} className="image-item">
              {/* eslint-disable-next-line @next/next/no-img-element -- gambar dilayani rute /media yang wajib login */}
              <img
                className="thumb"
                src={`/media/${image.id}`}
                alt={`Gambar ${index + 1}, ${MEDIA_KIND_LABEL[image.kind]}`}
                loading="lazy"
              />
              <span>
                <strong>Gambar {index + 1}</strong>
                <br />
                <span className="muted">
                  {MEDIA_KIND_LABEL[image.kind]}
                  {image.source === "auto" ? " (otomatis)" : ""}
                </span>
                {image.failed && (
                  <>
                    <br />
                    <span className="badge badge-internal inline-error">Screenshot gagal diperbarui: tidak tampil ke pembaca</span>
                  </>
                )}
              </span>
              <InlineConfirm
                label="Hapus"
                question="Hapus gambar ini?"
                confirmLabel="Ya, hapus"
                variant="danger"
                disabled={pending}
                onConfirm={() => remove(image.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
