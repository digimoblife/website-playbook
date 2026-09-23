"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveEntryAction,
  publishEntryAction,
  restoreEntryAction,
  saveEntryAction,
  unpublishEntryAction,
  type ActionResult,
} from "@/app/admin/entri/actions";
import { InlineConfirm } from "@/components/inline-confirm";
import { StatusBadge } from "@/components/status-badge";
import { readersWhoCanView } from "@/lib/access";
import type { EditableEntry } from "@/lib/admin-entries";
import {
  AUDIENCES,
  KINDS,
  LIMITS,
  NATURES,
  NEEDS_TAGS,
  STATUSES,
  type Audience,
  type Kind,
  type Nature,
  type NeedsTagKey,
  type Status,
} from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { AUDIENCE_LABEL, KIND_LABEL, MEDIA_KIND_LABEL, NATURE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { PUBLISH_INVISIBLE_MESSAGE, publicationSummary } from "@/lib/publish";
import { slugify } from "@/lib/slug";
import { ImageManager } from "./image-manager";

type StepState = { key: number; text: string; mediaId: number | null };
type FaqState = { key: number; question: string; answer: string };
type FormState = {
  title: string;
  slug: string;
  summary: string;
  problem: string;
  forWhom: string;
  explanation: string;
  promoText: string;
  canPromise: string;
  cannotPromise: string;
  kind: Kind;
  nature: Nature;
  status: Status;
  audience: Audience;
  needsTags: NeedsTagKey[];
  steps: StepState[];
  faqs: FaqState[];
};

function toForm(entry: EditableEntry): FormState {
  return {
    title: entry.title,
    slug: entry.slug,
    summary: entry.summary,
    problem: entry.problem,
    forWhom: entry.forWhom,
    explanation: entry.explanation,
    promoText: entry.promoText,
    canPromise: entry.canPromise,
    cannotPromise: entry.cannotPromise,
    kind: entry.kind,
    nature: entry.nature,
    status: entry.status,
    audience: entry.audience,
    needsTags: entry.needsTags,
    // Kunci deterministik (urutan muat): server dan klien harus menghasilkan id yang sama saat hidrasi.
    steps: entry.steps.map((step, index) => ({ key: index + 1, ...step })),
    faqs: entry.faqs.map((faq, index) => ({ key: index + 1, ...faq })),
  };
}

/** Isi yang dikirim ke server. Tautan gambar yang sudah dihapus dilepas. */
function toPayload(form: FormState, imageIds: Set<number>) {
  const { steps, faqs, ...rest } = form;
  return {
    ...rest,
    steps: steps.map((step) => ({
      text: step.text,
      mediaId: step.mediaId !== null && imageIds.has(step.mediaId) ? step.mediaId : null,
    })),
    faqs: faqs.map((faq) => ({ question: faq.question, answer: faq.answer })),
  };
}

type Notice = { ok: boolean; text: string } | null;

function TextField({
  id,
  label,
  value,
  onChange,
  max,
  rows,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  rows?: number;
  hint?: string;
}) {
  const describedBy = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {rows ? (
        <textarea
          id={id}
          className="textarea"
          rows={rows}
          maxLength={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
        />
      ) : (
        <input
          id={id}
          className="input"
          maxLength={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
        />
      )}
      {hint && (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      )}
      <span className="field-counter" aria-hidden="true">
        {value.length}/{max}
      </span>
    </div>
  );
}

export function EntryEditor({ entry }: { entry: EditableEntry }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(entry);
  const [form, setForm] = useState<FormState>(() => toForm(entry));
  const [notice, setNotice] = useState<Notice>(null);

  const imageIds = new Set(entry.images.map((image) => image.id));
  const archived = saved.archivedAt !== null;
  const dirty =
    JSON.stringify(toPayload(form, imageIds)) !== JSON.stringify(toPayload(toForm(saved), imageIds));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function apply(next: EditableEntry) {
    setSaved(next);
    setForm(toForm(next));
  }

  function report(res: ActionResult, prefix = "") {
    setNotice(res.ok ? { ok: true, text: res.message } : { ok: false, text: `${prefix}${res.error}` });
  }

  const idForm = () => {
    const data = new FormData();
    data.set("id", String(entry.id));
    return data;
  };

  function save() {
    startTransition(async () => {
      const res = await saveEntryAction(entry.id, toPayload(form, imageIds));
      if (res.ok && res.entry) apply(res.entry);
      report(res);
      router.refresh();
    });
  }

  function publish() {
    if (cannotPublish) return;
    startTransition(async () => {
      // Simpan dulu apa yang sedang diketik, lalu publish yang tersimpan.
      const savedRes = await saveEntryAction(entry.id, toPayload(form, imageIds));
      if (!savedRes.ok) {
        report(savedRes);
        return;
      }
      if (savedRes.entry) apply(savedRes.entry);
      const res = await publishEntryAction(undefined, idForm());
      if (res.ok && res.entry) apply(res.entry);
      report(res, "Perubahan Anda sudah disimpan. ");
      router.refresh();
    });
  }

  function lifecycle(action: (prev: ActionResult | undefined, formData: FormData) => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await action(undefined, idForm());
      if (res.ok && res.entry) apply(res.entry);
      report(res);
      router.refresh();
    });
  }

  const updateStep = (key: number, patch: Partial<StepState>) =>
    setForm((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.key === key ? { ...step, ...patch } : step)),
    }));

  const addStep = () =>
    setForm((current) =>
      current.steps.length >= LIMITS.steps
        ? current
        : {
            ...current,
            steps: [
              ...current.steps,
              { key: Math.max(0, ...current.steps.map((step) => step.key)) + 1, text: "", mediaId: null },
            ],
          },
    );

  const removeStep = (key: number) =>
    setForm((current) => ({ ...current, steps: current.steps.filter((step) => step.key !== key) }));

  const moveStep = (key: number, direction: -1 | 1) =>
    setForm((current) => {
      const from = current.steps.findIndex((step) => step.key === key);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.steps.length) return current;
      const steps = [...current.steps];
      [steps[from], steps[to]] = [steps[to], steps[from]];
      return { ...current, steps };
    });

  const updateFaq = (key: number, patch: Partial<FaqState>) =>
    setForm((current) => ({
      ...current,
      faqs: current.faqs.map((faq) => (faq.key === key ? { ...faq, ...patch } : faq)),
    }));

  const addFaq = () =>
    setForm((current) =>
      current.faqs.length >= LIMITS.faqs
        ? current
        : {
            ...current,
            faqs: [
              ...current.faqs,
              { key: Math.max(0, ...current.faqs.map((faq) => faq.key)) + 1, question: "", answer: "" },
            ],
          },
    );

  const removeFaq = (key: number) =>
    setForm((current) => ({ ...current, faqs: current.faqs.filter((faq) => faq.key !== key) }));

  const moveFaq = (key: number, direction: -1 | 1) =>
    setForm((current) => {
      const from = current.faqs.findIndex((faq) => faq.key === key);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.faqs.length) return current;
      const faqs = [...current.faqs];
      [faqs[from], faqs[to]] = [faqs[to], faqs[from]];
      return { ...current, faqs };
    });

  const toggleTag = (tag: NeedsTagKey) =>
    set(
      "needsTags",
      form.needsTags.includes(tag) ? form.needsTags.filter((t) => t !== tag) : [...form.needsTags, tag],
    );

  const summary = publicationSummary({
    isPublished: saved.isPublished,
    archived,
    status: form.status,
    audience: form.audience,
  });
  // Entri yang tidak akan terlihat pembaca (status atau audiens Internal) tidak boleh dipublish.
  const cannotPublish = readersWhoCanView({ status: form.status, audience: form.audience }).length === 0;
  const summaryMuted = /^(Masih Internal|Tersimpan sebagai draf|Diarsipkan)/.test(summary);

  return (
    <div>
      <div className="page-head page-head-row">
        <div>
          <h1>{saved.title}</h1>
          <div className="badges">
            <StatusBadge status={saved.status} />
            <span className={`badge ${saved.isPublished ? "badge-siap" : "badge-internal"}`}>
              {archived ? "Diarsipkan" : saved.isPublished ? "Terbit" : "Draf"}
            </span>
            <span className="muted">Diperbarui {formatDateTime(saved.updatedAt)}</span>
          </div>
        </div>
        <Link href="/admin/entri" className="btn btn-secondary">
          Semua entri
        </Link>
      </div>

      {notice && (
        <div
          role={notice.ok ? "status" : "alert"}
          className={`alert notice ${notice.ok ? "alert-success" : "alert-danger"}`}
        >
          {notice.text}
        </div>
      )}

      {archived && (
        <div className="alert alert-danger notice" role="status">
          <p style={{ marginBottom: "0.75rem" }}>
            <strong>Entri ini diarsipkan.</strong> Isinya tidak bisa disunting dan tidak tampil ke pembaca.
            Pulihkan untuk mengembalikannya ke Inbox sebagai draf.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => lifecycle(restoreEntryAction)}
          >
            Pulihkan
          </button>
        </div>
      )}

      <fieldset className="fieldset-plain" disabled={archived}>
        <legend className="visually-hidden">Isi entri</legend>
        <div className="card editor-title" style={{ marginBottom: "1.5rem" }}>
          <TextField
            id="judul"
            label="Judul"
            value={form.title}
            onChange={(v) => set("title", v)}
            max={LIMITS.title}
          />
          <div className="field">
            <label htmlFor="slug">Slug (alamat halaman)</label>
            <input
              id="slug"
              className="input"
              maxLength={LIMITS.slug}
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              aria-describedby="slug-hint"
            />
            <span id="slug-hint" className="hint">
              Huruf kecil, angka, dan tanda hubung; maksimal {LIMITS.slug} karakter.
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => set("slug", slugify(form.title))}
            >
              Buat dari judul
            </button>
          </div>
        </div>

        <div className="editor-grid">
          <div className="editor-main">
            <section className="card" aria-labelledby="bagian-penjelasan">
              <h2 id="bagian-penjelasan">Penjelasan fitur</h2>
              <TextField
                id="ringkasan"
                label="Ringkasan satu kalimat"
                value={form.summary}
                onChange={(v) => set("summary", v)}
                max={LIMITS.summary}
              />
              <TextField
                id="masalah"
                label="Masalah yang diselesaikan"
                value={form.problem}
                onChange={(v) => set("problem", v)}
                max={LIMITS.longText}
                rows={4}
              />
              <TextField
                id="untuk-toko"
                label="Untuk toko seperti apa"
                value={form.forWhom}
                onChange={(v) => set("forWhom", v)}
                max={LIMITS.longText}
                rows={3}
              />
              <TextField
                id="penjelasan"
                label="Penjelasan"
                value={form.explanation}
                onChange={(v) => set("explanation", v)}
                max={LIMITS.longText}
                rows={6}
              />
            </section>

            <section className="card" aria-labelledby="bagian-gambar">
              <h2 id="bagian-gambar">Gambar</h2>
              <ImageManager entryId={entry.id} images={entry.images} />
            </section>

            <section className="card" aria-labelledby="bagian-langkah">
              <h2 id="bagian-langkah">Cara pakai</h2>
              <p className="note" style={{ marginBottom: "1rem" }}>
                Satu kalimat per langkah, maksimal {LIMITS.steps} langkah. Setiap langkah boleh punya satu gambar.
              </p>
              {form.steps.length === 0 ? (
                <p className="muted">Belum ada langkah.</p>
              ) : (
                <ol className="step-list">
                  {form.steps.map((step, index) => {
                    const mediaId = step.mediaId !== null && imageIds.has(step.mediaId) ? step.mediaId : null;
                    const n = index + 1;
                    return (
                      <li key={step.key} className="step-row">
                        <span className="step-number" aria-hidden="true">
                          {n}
                        </span>
                        <div>
                          <label className="visually-hidden" htmlFor={`langkah-${step.key}`}>
                            Teks langkah {n}
                          </label>
                          <textarea
                            id={`langkah-${step.key}`}
                            className="textarea"
                            rows={2}
                            maxLength={LIMITS.stepText}
                            value={step.text}
                            onChange={(e) => updateStep(step.key, { text: e.target.value })}
                            style={{ minHeight: 64 }}
                          />
                          <span className="field-counter" aria-hidden="true">
                            {step.text.length}/{LIMITS.stepText}
                          </span>
                          {mediaId !== null && (
                            // eslint-disable-next-line @next/next/no-img-element -- gambar dilayani rute /media yang wajib login
                            <img className="thumb" src={`/media/${mediaId}`} alt={`Gambar untuk langkah ${n}`} />
                          )}
                          <div className="step-controls">
                            <div className="field">
                              <label htmlFor={`gambar-${step.key}`}>Gambar langkah {n}</label>
                              <select
                                id={`gambar-${step.key}`}
                                className="select"
                                value={mediaId ?? ""}
                                onChange={(e) =>
                                  updateStep(step.key, {
                                    mediaId: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                              >
                                <option value="">Tanpa gambar</option>
                                {entry.images.map((image, i) => (
                                  <option key={image.id} value={image.id}>
                                    Gambar {i + 1} ({MEDIA_KIND_LABEL[image.kind]})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => moveStep(step.key, -1)}
                              disabled={index === 0}
                              aria-label={`Naikkan langkah ${n}`}
                            >
                              Naik
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => moveStep(step.key, 1)}
                              disabled={index === form.steps.length - 1}
                              aria-label={`Turunkan langkah ${n}`}
                            >
                              Turun
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() => removeStep(step.key)}
                              aria-label={`Hapus langkah ${n}`}
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addStep}
                disabled={form.steps.length >= LIMITS.steps}
              >
                Tambah langkah
              </button>
              {form.steps.length >= LIMITS.steps && (
                <span className="note"> Sudah {LIMITS.steps} langkah (batas maksimal).</span>
              )}
            </section>

            <section className="card" aria-labelledby="bagian-faq">
              <h2 id="bagian-faq">Pertanyaan yang sering diajukan</h2>
              <p className="note" style={{ marginBottom: "1rem" }}>
                Pertanyaan calon pelanggan beserta jawabannya, maksimal {LIMITS.faqs} pertanyaan. Tidak
                wajib diisi untuk publish.
              </p>
              {form.faqs.length === 0 ? (
                <p className="muted">Belum ada FAQ.</p>
              ) : (
                <ol className="step-list">
                  {form.faqs.map((faq, index) => {
                    const n = index + 1;
                    return (
                      <li key={faq.key} className="step-row">
                        <span className="step-number" aria-hidden="true">
                          {n}
                        </span>
                        <div>
                          <label htmlFor={`faq-pertanyaan-${faq.key}`}>Pertanyaan {n}</label>
                          <input
                            id={`faq-pertanyaan-${faq.key}`}
                            className="input"
                            maxLength={LIMITS.faqQuestion}
                            value={faq.question}
                            onChange={(e) => updateFaq(faq.key, { question: e.target.value })}
                          />
                          <span className="field-counter" aria-hidden="true">
                            {faq.question.length}/{LIMITS.faqQuestion}
                          </span>
                          <label htmlFor={`faq-jawaban-${faq.key}`}>Jawaban {n}</label>
                          <textarea
                            id={`faq-jawaban-${faq.key}`}
                            className="textarea"
                            rows={3}
                            maxLength={LIMITS.faqAnswer}
                            value={faq.answer}
                            onChange={(e) => updateFaq(faq.key, { answer: e.target.value })}
                          />
                          <span className="field-counter" aria-hidden="true">
                            {faq.answer.length}/{LIMITS.faqAnswer}
                          </span>
                          <div className="step-controls">
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => moveFaq(faq.key, -1)}
                              disabled={index === 0}
                              aria-label={`Naikkan FAQ ${n}`}
                            >
                              Naik
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => moveFaq(faq.key, 1)}
                              disabled={index === form.faqs.length - 1}
                              aria-label={`Turunkan FAQ ${n}`}
                            >
                              Turun
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() => removeFaq(faq.key)}
                              aria-label={`Hapus FAQ ${n}`}
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addFaq}
                disabled={form.faqs.length >= LIMITS.faqs}
              >
                Tambah FAQ
              </button>
              {form.faqs.length >= LIMITS.faqs && (
                <span className="note"> Sudah {LIMITS.faqs} FAQ (batas maksimal).</span>
              )}
            </section>

            <section className="card" aria-labelledby="bagian-marketing">
              <h2 id="bagian-marketing">Materi marketing</h2>
              <TextField
                id="promo"
                label="Teks promosi"
                value={form.promoText}
                onChange={(v) => set("promoText", v)}
                max={LIMITS.longText}
                rows={6}
                hint="Teks yang bisa disalin tim marketing."
              />
            </section>
          </div>

          <aside className="editor-side">
            <section className="card" aria-labelledby="bagian-publikasi">
              <h2 id="bagian-publikasi">Pengaturan publikasi</h2>

              <div className="field">
                <label htmlFor="jenis">Jenis</label>
                <select id="jenis" className="select" value={form.kind} onChange={(e) => set("kind", e.target.value as Kind)}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sifat">Sifat</label>
                <select id="sifat" className="select" value={form.nature} onChange={(e) => set("nature", e.target.value as Nature)}>
                  {NATURES.map((n) => (
                    <option key={n} value={n}>
                      {NATURE_LABEL[n]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" className="select" value={form.status} onChange={(e) => set("status", e.target.value as Status)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="audiens">Audiens</label>
                <select id="audiens" className="select" value={form.audience} onChange={(e) => set("audience", e.target.value as Audience)}>
                  {AUDIENCES.map((a) => (
                    <option key={a} value={a}>
                      {AUDIENCE_LABEL[a]}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset className="check-list">
                <legend>Tag kebutuhan pelanggan</legend>
                {NEEDS_TAGS.map((tag) => (
                  <label key={tag.key} className="check-row">
                    <input
                      type="checkbox"
                      checked={form.needsTags.includes(tag.key)}
                      onChange={() => toggleTag(tag.key)}
                    />
                    {tag.label}
                  </label>
                ))}
              </fieldset>

              <TextField
                id="boleh"
                label="Boleh dijanjikan"
                value={form.canPromise}
                onChange={(v) => set("canPromise", v)}
                max={LIMITS.longText}
                rows={4}
              />
              <TextField
                id="jangan"
                label="Jangan dijanjikan"
                value={form.cannotPromise}
                onChange={(v) => set("cannotPromise", v)}
                max={LIMITS.longText}
                rows={4}
                hint="Bagian ini hanya tampil ke marketing internal, tidak ke partner."
              />

              <p role="status" className={`publish-summary${summaryMuted ? " is-muted" : ""}`}>
                {summary}
              </p>

              {!archived && (
                <div className="editor-actions">
                  <button type="button" className="btn btn-secondary" onClick={save} disabled={pending}>
                    {pending ? "Memproses…" : "Simpan"}
                  </button>
                  {!saved.isPublished && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={publish}
                      disabled={pending || cannotPublish}
                      aria-describedby={cannotPublish ? "alasan-publish" : undefined}
                    >
                      Publish
                    </button>
                  )}
                  {saved.isPublished && (
                    <InlineConfirm
                      label="Tarik kembali"
                      question="Tarik kembali dari pembaca?"
                      confirmLabel="Ya, tarik kembali"
                      disabled={pending}
                      onConfirm={() => lifecycle(unpublishEntryAction)}
                    />
                  )}
                  <InlineConfirm
                    label="Arsipkan"
                    question="Arsipkan entri ini?"
                    confirmLabel="Ya, arsipkan"
                    variant="danger"
                    disabled={pending}
                    onConfirm={() => lifecycle(archiveEntryAction)}
                  />
                </div>
              )}
              {cannotPublish && !archived && !saved.isPublished && (
                <p id="alasan-publish" className="note" role="note">
                  {PUBLISH_INVISIBLE_MESSAGE}
                </p>
              )}
              {dirty && !archived && (
                <p className="note dirty-flag" role="status">
                  Ada perubahan yang belum disimpan.
                </p>
              )}
            </section>
          </aside>
        </div>
      </fieldset>
    </div>
  );
}
