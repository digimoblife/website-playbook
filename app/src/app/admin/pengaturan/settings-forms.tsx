"use client";

import { useActionState, useState } from "react";
import {
  clearGithubTokenAction,
  saveGithubTokenAction,
  saveSettingsAction,
  testGithubConnectionAction,
  type SettingsActionResult,
} from "./actions";

function Result({ state }: { state: SettingsActionResult | undefined }) {
  if (!state) return null;
  if (!state.ok) {
    return (
      <div role="alert" className="alert alert-danger" style={{ marginTop: "1rem" }}>
        {state.error}
      </div>
    );
  }
  return (
    <>
      <div role="status" className="alert alert-success" style={{ marginTop: "1rem" }}>
        {state.message}
      </div>
      {state.warning && (
        <div role="alert" className="alert alert-danger" style={{ marginTop: "0.5rem" }}>
          {state.warning}
        </div>
      )}
    </>
  );
}

export function GeneralSettingsForm({
  productName,
  productNameMax,
  githubRepo,
  demoStoreUrl,
}: {
  productName: string;
  productNameMax: number;
  githubRepo: string;
  demoStoreUrl: string;
}) {
  const [state, action, pending] = useActionState<SettingsActionResult | undefined, FormData>(
    saveSettingsAction,
    undefined,
  );
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="productName">Nama produk</label>
        <input
          id="productName"
          name="productName"
          className="input"
          defaultValue={productName}
          maxLength={productNameMax}
          required
          aria-describedby="productName-hint"
        />
        <span id="productName-hint" className="hint">
          Tampil sebagai &ldquo;{"{nama}"} Playbook&rdquo; di navbar, dashboard, halaman masuk, dan judul halaman.
        </span>
      </div>
      <div className="field">
        <label htmlFor="githubRepo">Repo GitHub</label>
        <input
          id="githubRepo"
          name="githubRepo"
          className="input"
          defaultValue={githubRepo}
          placeholder="https://github.com/pemilik/repo"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="githubRepo-hint"
        />
        <span id="githubRepo-hint" className="hint">
          URL repo atau pemilik/repo. Kosongkan untuk memakai GITHUB_REPO dari server.
        </span>
      </div>
      <div className="field">
        <label htmlFor="demoStoreUrl">URL toko demo</label>
        <input
          id="demoStoreUrl"
          name="demoStoreUrl"
          type="url"
          className="input"
          defaultValue={demoStoreUrl}
          placeholder="https://demo.contoh.id"
          autoComplete="off"
          aria-describedby="demoStoreUrl-hint"
        />
        <span id="demoStoreUrl-hint" className="hint">
          Dipakai tombol &ldquo;Coba di toko demo&rdquo;. Kosongkan untuk memakai DEMO_STORE_URL dari server.
        </span>
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan pengaturan"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function TokenForm({
  hasStoredToken,
  encryptionError,
}: {
  hasStoredToken: boolean;
  encryptionError: string | null;
}) {
  const [formKey, setFormKey] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<SettingsActionResult | undefined, FormData>(
    async (prev, formData) => {
      const result = await saveGithubTokenAction(prev, formData);
      // Kosongkan isian setelah berhasil: token tidak dibiarkan tertinggal di halaman.
      if (result.ok) setFormKey((k) => k + 1);
      return result;
    },
    undefined,
  );
  const [clearState, clearAction, clearing] = useActionState<SettingsActionResult | undefined, FormData>(
    clearGithubTokenAction,
    undefined,
  );
  return (
    <div>
      {encryptionError ? (
        <div role="alert" className="alert alert-danger">
          Token belum bisa disimpan dari sini. {encryptionError}
        </div>
      ) : (
        <form key={formKey} action={action}>
          <div className="field">
            <label htmlFor="token">{hasStoredToken ? "Ganti token" : "Isi token"}</label>
            <input
              id="token"
              name="token"
              type="password"
              className="input"
              autoComplete="off"
              spellCheck={false}
              placeholder="github_pat_…"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan token"}
          </button>
        </form>
      )}
      <Result state={state} />

      {hasStoredToken && (
        <form action={clearAction} onSubmit={() => setConfirming(false)} style={{ marginTop: "1rem" }}>
          {!confirming ? (
            <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
              Hapus token
            </button>
          ) : (
            <span className="row-action">
              <span className="confirm-text">Hapus token dari Pengaturan?</span>
              <button type="submit" className="btn btn-danger" disabled={clearing}>
                Ya, hapus
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
                Batal
              </button>
            </span>
          )}
          <Result state={clearState} />
        </form>
      )}
    </div>
  );
}

export function ConnectionTest() {
  const [state, action, pending] = useActionState<SettingsActionResult | undefined, FormData>(
    testGithubConnectionAction,
    undefined,
  );
  return (
    <form action={action}>
      <button type="submit" className="btn btn-secondary" disabled={pending}>
        {pending ? "Menguji…" : "Uji koneksi"}
      </button>
      <Result state={state} />
    </form>
  );
}
