import type { Metadata } from "next";
import { isAiConfigured } from "@/lib/ai-draft";
import { requireAdmin } from "@/lib/dal";
import { listPullRequestsWithStatus } from "@/lib/github-import-status";
import { GithubPullTable } from "./github-pull-table";

export const metadata: Metadata = { title: "Tarik dari GitHub" };

export default async function GithubPullPage() {
  await requireAdmin();
  const aiReady = isAiConfigured();
  const prs = await listPullRequestsWithStatus();

  return (
    <>
      <div className="page-head">
        <h1>Tarik dari GitHub</h1>
        <p className="muted" style={{ margin: 0 }}>
          Percobaan (Langkah 4-experimental): tarik manual PR dari bajaklautmalaka/lapaq dan buat
          draf entri lewat AI. Bukan webhook, tidak ada jadwal otomatis — klik tombol untuk menarik.
        </p>
      </div>

      {!aiReady && (
        <div className="alert alert-danger notice" role="status">
          Draf AI belum aktif — atur <code>AI_API_KEY</code> dan <code>AI_MODEL</code> di
          lingkungan server untuk mengaktifkan fitur ini. Tombol tarik tetap ada di bawah, tapi
          akan menjelaskan ini saat diklik, dan tidak akan membuat entri apa pun.
        </div>
      )}

      <section className="card" aria-labelledby="daftar-pr">
        <h2 id="daftar-pr">Pull request di bajaklautmalaka/lapaq</h2>
        {!prs.ok ? (
          <p className="inline-error" role="alert">
            {prs.error}
          </p>
        ) : prs.data.length === 0 ? (
          <p className="muted">Tidak ada PR ditemukan di repositori.</p>
        ) : (
          <GithubPullTable pullRequests={prs.data} />
        )}
      </section>
    </>
  );
}
