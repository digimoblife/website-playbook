"use client";

import { useState } from "react";

/** Tombol dua langkah: klik pertama meminta konfirmasi, klik kedua menjalankan. */
export function InlineConfirm({
  label,
  question,
  confirmLabel,
  onConfirm,
  disabled,
  variant = "secondary",
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  variant?: "secondary" | "danger";
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className={`btn btn-${variant}`}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
    );
  }
  return (
    <span className="confirm-box" role="group" aria-label={question}>
      <span className="confirm-text">{question}</span>
      <button
        type="button"
        className="btn btn-danger"
        disabled={disabled}
        onClick={() => {
          setOpen(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
        Batal
      </button>
    </span>
  );
}
