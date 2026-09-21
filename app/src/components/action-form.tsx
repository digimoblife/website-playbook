"use client";

import { useActionState, useState } from "react";
import type { ActionResult } from "@/app/admin/entri/actions";

type Action = (prev: ActionResult | undefined, formData: FormData) => Promise<ActionResult>;

/**
 * Tombol aksi kecil untuk daftar (Ke arsip, Publish, Pulihkan). Formulir asli dengan input
 * tersembunyi berisi id; hasilnya (sukses atau galat) ditampilkan di sebelah tombol.
 * Bila `confirmText` diisi, tombol meminta konfirmasi dulu.
 */
export function ActionForm({
  action,
  id,
  label,
  variant = "secondary",
  confirmText,
}: {
  action: Action;
  id: number;
  label: string;
  variant?: "primary" | "secondary" | "danger";
  confirmText?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  // Aksi server diteruskan langsung (bukan dibungkus fungsi klien) supaya formulir tetap
  // membawa rujukan aksinya dan bisa dikirim tanpa JavaScript.
  const [state, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} onSubmit={() => setConfirming(false)} className="row-action">
      <input type="hidden" name="id" value={id} />
      {confirmText && !confirming ? (
        <button type="button" className={`btn btn-${variant}`} onClick={() => setConfirming(true)}>
          {label}
        </button>
      ) : confirmText ? (
        <>
          <span className="confirm-text">{confirmText}</span>
          <button type="submit" className="btn btn-danger" disabled={pending}>
            Ya, {label.toLowerCase()}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
            Batal
          </button>
        </>
      ) : (
        <button type="submit" className={`btn btn-${variant}`} disabled={pending}>
          {pending ? "Memproses…" : label}
        </button>
      )}
      {state && !state.ok && (
        <span role="alert" className="inline-error">
          {state.error}
        </span>
      )}
      {state?.ok && (
        <span role="status" className="inline-ok">
          {state.message}
        </span>
      )}
    </form>
  );
}
