"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetPasswordAction, type ResetPasswordState } from "@/app/admin/pengguna/actions";
import { InlineConfirm } from "@/components/inline-confirm";

export function ResetPasswordPanel({ userId, userName }: { userId: number; userName: string }) {
  const router = useRouter();
  const [state, setState] = useState<ResetPasswordState>(undefined);
  const [pending, startTransition] = useTransition();

  function reset() {
    startTransition(async () => {
      const form = new FormData();
      form.set("id", String(userId));
      setState(await resetPasswordAction(undefined, form));
      router.refresh();
    });
  }

  return (
    <div>
      {state && !state.ok && (
        <div role="alert" className="alert alert-danger" style={{ marginBottom: "1rem" }}>
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div role="status" className="alert alert-success" style={{ marginBottom: "1rem" }}>
          <strong>{state.message}</strong>
          <p style={{ margin: "0.5rem 0 0" }}>Kata sandi sementara (hanya tampil sekali, catat sekarang):</p>
          <code className="secret">{state.tempPassword}</code>
          <p style={{ margin: 0 }}>Berikan lewat jalur yang aman. Pengguna wajib menggantinya saat masuk.</p>
        </div>
      )}
      <InlineConfirm
        label="Reset kata sandi"
        question={`Reset kata sandi ${userName}?`}
        confirmLabel="Ya, reset"
        variant="danger"
        disabled={pending}
        onConfirm={reset}
      />
    </div>
  );
}
