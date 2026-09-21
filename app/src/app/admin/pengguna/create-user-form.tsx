"use client";

import { useActionState } from "react";
import { createUserAction, type CreateUserState } from "./actions";

export function CreateUserForm() {
  const [state, action, pending] = useActionState<CreateUserState, FormData>(
    createUserAction,
    undefined,
  );

  return (
    <form action={action}>
      {state?.error && (
        <div role="alert" className="alert alert-danger" style={{ marginBottom: "1rem" }}>
          {state.error}
        </div>
      )}
      {state?.success && state.tempPassword && (
        <div role="status" className="alert alert-success" style={{ marginBottom: "1rem" }}>
          <strong>{state.success}</strong>
          <p style={{ margin: "0.5rem 0 0" }}>
            Kata sandi sementara untuk {state.email} (hanya tampil sekali, catat sekarang):
          </p>
          <code className="secret">{state.tempPassword}</code>
          <p style={{ margin: 0 }}>
            Berikan lewat jalur yang aman. Pengguna wajib menggantinya saat masuk pertama kali.
          </p>
        </div>
      )}
      <div className="field">
        <label htmlFor="name">Nama</label>
        <input id="name" name="name" className="input" autoComplete="off" required />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="off" required />
      </div>
      <div className="field">
        <label htmlFor="role">Peran</label>
        <select id="role" name="role" className="select" defaultValue="marketing" required>
          <option value="marketing">Marketing internal</option>
          <option value="partner">Partner JV</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="partnerName">Nama partner</label>
        <input id="partnerName" name="partnerName" className="input" autoComplete="off" aria-describedby="partner-hint" />
        <span id="partner-hint" className="hint">
          Wajib diisi untuk peran Partner JV. Kosongkan untuk Marketing.
        </span>
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Membuat…" : "Buat akun"}
      </button>
    </form>
  );
}
