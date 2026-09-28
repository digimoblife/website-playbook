"use client";

import { useActionState } from "react";
import { createGuideAction, type GuideActionResult } from "@/app/admin/panduan/actions";
import { LIMITS } from "@/lib/domain";

export function NewGuideForm() {
  const [state, action, pending] = useActionState<GuideActionResult | undefined, FormData>(
    createGuideAction,
    undefined,
  );

  return (
    <form action={action}>
      {state && !state.ok && (
        <div role="alert" className="alert alert-danger" style={{ marginBottom: "1rem" }}>
          {state.error}
        </div>
      )}
      <div className="field">
        <label htmlFor="title">Judul</label>
        <input
          id="title"
          name="title"
          className="input"
          maxLength={LIMITS.title}
          autoComplete="off"
          aria-describedby="title-hint"
          placeholder="Menunjukkan produk ke calon pelanggan dalam 10 menit"
          required
        />
        <span id="title-hint" className="hint">
          Maksimal {LIMITS.title} karakter. Slug dibuat otomatis dan bisa diubah di editor.
        </span>
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Membuat…" : "Buat panduan"}
      </button>
    </form>
  );
}
