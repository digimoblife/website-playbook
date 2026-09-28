"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runScenarioAction, saveScenarioAction, type ActionResult } from "@/app/admin/entri/actions";
import { formatDateTime } from "@/lib/format";
import { SCENARIO_LIMITS } from "@/lib/screenshot-scenario";

const EXAMPLE = `# Contoh (hapus baris yang tidak perlu)
ukuran 390x844
buka /produk
klik text=Kaos Polos
tunggu .tombol-beli
foto`;

/** Skenario screenshot otomatis satu entri (Langkah 6e). Hanya Admin. */
export function ScenarioCard({
  entryId,
  script,
  lastRunAt,
  lastStatus,
  lastError,
  demoStoreUrl,
  archived,
}: {
  entryId: number;
  script: string;
  lastRunAt: Date | null;
  lastStatus: "berhasil" | "gagal" | null;
  lastError: string | null;
  demoStoreUrl: string | null;
  archived: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(script);
  const [saved, setSaved] = useState(script);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = text.trim() !== saved.trim();

  function save(then?: () => Promise<void>) {
    startTransition(async () => {
      const res = await saveScenarioAction(entryId, text);
      setNotice(res);
      if (res.ok) {
        setSaved(text);
        if (then) await then();
      }
      router.refresh();
    });
  }

  function run() {
    save(async () => {
      setNotice({ ok: true, message: "Menjalankan skenario di toko demo…" });
      const res = await runScenarioAction(entryId);
      setNotice(res);
    });
  }

  return (
    <section className="card" aria-labelledby="bagian-screenshot" style={{ marginTop: "1.5rem" }}>
      <h2 id="bagian-screenshot">Screenshot otomatis</h2>
      <p className="note" style={{ marginTop: 0 }}>
        Skenario membuka toko demo{demoStoreUrl ? ` (${demoStoreUrl})` : ""} dan mengambil foto. Satu perintah per
        baris: <code>ukuran</code>, <code>buka</code>, <code>klik</code>, <code>isi selector =&gt; nilai</code>,{" "}
        <code>tunggu</code>, <code>foto</code>. Maksimal {SCENARIO_LIMITS.photos} foto. Untuk akun demo, tulis{" "}
        <code>{"${DEMO_STORE_EMAIL}"}</code> dan <code>{"${DEMO_STORE_PASSWORD}"}</code>, bukan nilai aslinya. Bila
        gagal, screenshot lama disembunyikan dari pembaca dan unggahan manual tetap bisa dipakai.
      </p>
      {!demoStoreUrl && (
        <div className="alert alert-danger" role="status">
          URL toko demo belum diatur. Isi dulu di Pengaturan.
        </div>
      )}
      <div className="field">
        <label htmlFor="skenario">Skenario</label>
        <textarea
          id="skenario"
          className="textarea"
          rows={8}
          maxLength={SCENARIO_LIMITS.scriptChars}
          value={text}
          placeholder={EXAMPLE}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          disabled={archived}
          style={{ fontFamily: "ui-monospace, monospace" }}
        />
      </div>
      <p role="status" className="note">
        Terakhir dijalankan: {formatDateTime(lastRunAt)}
        {lastStatus === "berhasil" && " (berhasil)"}
        {lastStatus === "gagal" && <span className="inline-error"> (gagal: {lastError})</span>}
      </p>
      {!archived && (
        <div className="editor-actions">
          <button type="button" className="btn btn-secondary" disabled={pending || !dirty} onClick={() => save()}>
            Simpan skenario
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !text.trim() || !demoStoreUrl}
            onClick={run}
          >
            {pending ? "Memproses…" : "Simpan dan jalankan sekarang"}
          </button>
        </div>
      )}
      {notice && (
        <div
          role={notice.ok ? "status" : "alert"}
          className={`alert ${notice.ok ? "alert-success" : "alert-danger"}`}
          style={{ marginTop: "0.75rem" }}
        >
          {notice.ok ? notice.message : notice.error}
        </div>
      )}
    </section>
  );
}
