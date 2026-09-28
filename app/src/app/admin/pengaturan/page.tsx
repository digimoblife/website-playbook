import type { Metadata } from "next";
import { requireAdmin } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import { getSettingsView, listSettingsHistory, PRODUCT_NAME_MAX } from "@/lib/settings";
import { ConnectionTest, GeneralSettingsForm, TokenForm } from "./settings-forms";

export const metadata: Metadata = { title: "Pengaturan" };

const SOURCE_LABEL = {
  pengaturan: "dari Pengaturan",
  lingkungan: "dari variabel lingkungan server",
  "tidak-ada": "belum diatur",
} as const;

export default async function PengaturanPage() {
  await requireAdmin();
  const view = getSettingsView();
  const history = listSettingsHistory(30);

  return (
    <>
      <div className="page-head">
        <h1>Pengaturan</h1>
        <p className="muted" style={{ margin: 0 }}>
          Satu instalasi untuk satu produk. Kolom yang dikosongkan memakai nilai dari variabel lingkungan server
          (.env.local), bila ada.
        </p>
      </div>

      <div className="stack">
        <section className="card" aria-labelledby="pengaturan-umum">
          <h2 id="pengaturan-umum">Produk, repo, dan toko demo</h2>
          <GeneralSettingsForm
            productName={view.productName}
            productNameMax={PRODUCT_NAME_MAX}
            githubRepo={view.githubRepoSetting ?? ""}
            demoStoreUrl={view.demoStoreUrlSetting ?? ""}
          />
          <ul className="note" style={{ marginTop: "1rem" }}>
            <li>
              Repo yang dipakai: <strong>{view.githubRepo ?? "tidak ada"}</strong> ({SOURCE_LABEL[view.githubRepoSource]})
            </li>
            <li>
              Toko demo yang dipakai: <strong>{view.demoStoreUrl ?? "tidak ada (tombol disembunyikan)"}</strong> (
              {SOURCE_LABEL[view.demoStoreUrlSource]})
            </li>
          </ul>
        </section>

        <section className="card" aria-labelledby="pengaturan-token">
          <h2 id="pengaturan-token">Token GitHub</h2>
          <p role="status" style={{ marginTop: 0 }}>
            {view.token.source === "pengaturan" && (
              <>
                Tersimpan terenkripsi di Pengaturan, berakhiran <strong>…{view.token.last4}</strong>.
              </>
            )}
            {view.token.source === "pengaturan-rusak" && (
              <span className="inline-error">
                Tersimpan (…{view.token.last4}), tetapi tidak bisa dipakai: {view.token.error}
              </span>
            )}
            {view.token.source === "lingkungan" && <>Memakai GITHUB_TOKEN dari variabel lingkungan server.</>}
            {view.token.source === "tidak-ada" && <>Belum ada token. Hanya repo publik yang bisa dibaca.</>}
          </p>
          <TokenForm
            hasStoredToken={view.token.source === "pengaturan" || view.token.source === "pengaturan-rusak"}
            encryptionError={view.encryptionError}
          />
          <p className="note" style={{ marginBottom: 0 }}>
            Pakai fine-grained token dengan akses <strong>hanya-baca</strong> ke repo ini saja (Contents dan Pull
            requests: Read-only). Token tidak pernah ditampilkan lagi setelah disimpan.
          </p>
        </section>

        <section className="card" aria-labelledby="pengaturan-uji">
          <h2 id="pengaturan-uji">Uji koneksi</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Memeriksa apakah repo dan token yang sedang berlaku bisa dibaca. Hanya membaca; tidak ada yang diubah di
            GitHub.
          </p>
          <ConnectionTest />
        </section>

        <section className="card" aria-labelledby="pengaturan-riwayat">
          <h2 id="pengaturan-riwayat">Riwayat pengaturan</h2>
          {history.length === 0 ? (
            <p className="muted">Belum ada perubahan.</p>
          ) : (
            <ol className="history-list">
              {history.map((row) => (
                <li key={row.id}>
                  <span className="history-time">{formatDateTime(row.at)}</span>
                  <span>
                    <strong>{row.userName}</strong>: {row.summary}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
