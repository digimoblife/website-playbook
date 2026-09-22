"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard tidak tersedia (mis. tanpa HTTPS); biarkan pengguna menyalin manual.
    }
  }

  return (
    <button type="button" className="btn btn-secondary" onClick={copy}>
      {copied ? "Tersalin" : "Salin teks"}
    </button>
  );
}
