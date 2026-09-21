"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "./actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    undefined,
  );

  return (
    <form action={action}>
      {state?.error && (
        <div role="alert" className="alert alert-danger" style={{ marginBottom: "1rem" }}>
          {state.error}
        </div>
      )}
      <div className="field">
        <label htmlFor="current">Kata sandi saat ini</label>
        <input id="current" name="current" type="password" className="input" autoComplete="current-password" required />
      </div>
      <div className="field">
        <label htmlFor="next">Kata sandi baru</label>
        <input id="next" name="next" type="password" className="input" autoComplete="new-password" minLength={12} aria-describedby="next-hint" required />
        <span id="next-hint" className="hint">
          Minimal 12 karakter.
        </span>
      </div>
      <div className="field">
        <label htmlFor="confirm">Ulangi kata sandi baru</label>
        <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" required />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Menyimpan…" : "Simpan kata sandi"}
      </button>
    </form>
  );
}
