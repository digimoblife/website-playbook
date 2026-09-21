"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { updateUserAction, type UpdateUserState } from "@/app/admin/pengguna/actions";
import type { Role } from "@/lib/domain";

export function EditUserForm({
  user,
}: {
  user: { id: number; name: string; email: string; role: Role; partnerName: string | null };
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [partnerName, setPartnerName] = useState(user.partnerName ?? "");
  const [state, setState] = useState<UpdateUserState>(undefined);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const form = new FormData();
      form.set("id", String(user.id));
      form.set("name", name);
      form.set("email", email);
      form.set("partnerName", partnerName);
      setState(await updateUserAction(undefined, form));
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit}>
      {state && !state.ok && (
        <div role="alert" className="alert alert-danger" style={{ marginBottom: "1rem" }}>
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div role="status" className="alert alert-success" style={{ marginBottom: "1rem" }}>
          {state.message}
        </div>
      )}
      <div className="field">
        <label htmlFor="nama">Nama</label>
        <input id="nama" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required />
      </div>
      <div className="field">
        <label htmlFor="surel">Email</label>
        <input
          id="surel"
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          required
        />
      </div>
      {user.role === "partner" && (
        <div className="field">
          <label htmlFor="nama-partner">Nama partner</label>
          <input
            id="nama-partner"
            className="input"
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            autoComplete="off"
            required
          />
        </div>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan"}
      </button>
    </form>
  );
}
