"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveGuideAction,
  publishGuideAction,
  restoreGuideAction,
  saveGuideAction,
  unpublishGuideAction,
  type GuideActionResult,
} from "@/app/admin/panduan/actions";
import { InlineConfirm } from "@/components/inline-confirm";
import { StatusBadge } from "@/components/status-badge";
import { TextField } from "@/components/text-field";
import { readersWhoCanView } from "@/lib/access";
import { AUDIENCES, LIMITS, STATUSES, type Audience, type Status } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { guideLinkWarnings, type LinkableEntry } from "@/lib/guide-rules";
import type { EditableGuide } from "@/lib/guides";
import { AUDIENCE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { PUBLISH_INVISIBLE_MESSAGE, publicationSummary } from "@/lib/publish";
import { slugify } from "@/lib/slug";

type StepState = { key: number; text: string; entryId: number | null };
type FormState = {
  title: string;
  slug: string;
  summary: string;
  intro: string;
  status: Status;
  audience: Audience;
  steps: StepState[];
};

function toForm(guide: EditableGuide): FormState {
  return {
    title: guide.title,
    slug: guide.slug,
    summary: guide.summary,
    intro: guide.intro,
    status: guide.status,
    audience: guide.audience,
    // Kunci deterministik (urutan muat) supaya hidrasi server dan klien cocok.
    steps: guide.steps.map((step, index) => ({ key: index + 1, ...step })),
  };
}

function toPayload(form: FormState) {
  const { steps, ...rest } = form;
  return { ...rest, steps: steps.map((step) => ({ text: step.text, entryId: step.entryId })) };
}

type Notice = { ok: boolean; text: string } | null;

export function GuideEditor({ guide, linkable }: { guide: EditableGuide; linkable: LinkableEntry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(guide);
  const [form, setForm] = useState<FormState>(() => toForm(guide));
  const [notice, setNotice] = useState<Notice>(null);

  const archived = saved.archivedAt !== null;
  const dirty = JSON.stringify(toPayload(form)) !== JSON.stringify(toPayload(toForm(saved)));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function apply(next: EditableGuide) {
    setSaved(next);
    setForm(toForm(next));
  }

  function report(res: GuideActionResult, prefix = "") {
    setNotice(res.ok ? { ok: true, text: res.message } : { ok: false, text: `${prefix}${res.error}` });
  }

  const idForm = () => {
    const data = new FormData();
    data.set("id", String(guide.id));
    return data;
  };

  function save() {
    startTransition(async () => {
      const res = await saveGuideAction(guide.id, toPayload(form));
      if (res.ok && res.guide) apply(res.guide);
      report(res);
      router.refresh();
    });
  }

  function publish() {
    if (cannotPublish) return;
    startTransition(async () => {
      const savedRes = await saveGuideAction(guide.id, toPayload(form));
      if (!savedRes.ok) {
        report(savedRes);
        return;
      }
      if (savedRes.guide) apply(savedRes.guide);
      const res = await publishGuideAction(undefined, idForm());
      if (res.ok && res.guide) apply(res.guide);
      report(res, "Perubahan Anda sudah disimpan. ");
      router.refresh();
    });
  }

  function lifecycle(
    action: (prev: GuideActionResult | undefined, formData: FormData) => Promise<GuideActionResult>,
  ) {
    startTransition(async () => {
      const res = await action(undefined, idForm());
      if (res.ok && res.guide) apply(res.guide);
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
      current.steps.length >= LIMITS.guideSteps
        ? current
        : {
            ...current,
            steps: [
              ...current.steps,
              { key: Math.max(0, ...current.steps.map((step) => step.key)) + 1, text: "", entryId: null },
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

  const summary = publicationSummary({
    isPublished: saved.isPublished,
    archived,
    status: form.status,
    audience: form.audience,
  });
  const cannotPublish = readersWhoCanView({ status: form.status, audience: form.audience }).length === 0;
  const summaryMuted = /^(Masih Internal|Tersimpan sebagai draf|Diarsipkan)/.test(summary);
  const warnings = guideLinkWarnings(toPayload(form), linkable);

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
        <Link href="/admin/panduan" className="btn btn-secondary">
          Semua panduan
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
            <strong>Panduan ini diarsipkan.</strong> Isinya tidak bisa disunting dan tidak tampil ke pembaca.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => lifecycle(restoreGuideAction)}
          >
            Pulihkan
          </button>
        </div>
      )}

      <fieldset className="fieldset-plain" disabled={archived}>
        <legend className="visually-hidden">Isi panduan</legend>
        <div className="card editor-title" style={{ marginBottom: "1.5rem" }}>
          <TextField id="judul" label="Judul" value={form.title} onChange={(v) => set("title", v)} max={LIMITS.title} />
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
            <button type="button" className="btn btn-secondary" onClick={() => set("slug", slugify(form.title))}>
              Buat dari judul
            </button>
          </div>
        </div>

        <div className="editor-grid">
          <div className="editor-main">
            <section className="card" aria-labelledby="bagian-tujuan">
              <h2 id="bagian-tujuan">Tujuan</h2>
              <TextField
                id="ringkasan"
                label="Ringkasan satu kalimat"
                value={form.summary}
                onChange={(v) => set("summary", v)}
                max={LIMITS.summary}
              />
              <TextField
                id="kapan"
                label="Kapan dipakai dan apa yang perlu disiapkan"
                value={form.intro}
                onChange={(v) => set("intro", v)}
                max={LIMITS.longText}
                rows={4}
              />
            </section>

            <section className="card" aria-labelledby="bagian-langkah-panduan">
              <h2 id="bagian-langkah-panduan">Langkah</h2>
              <p className="note" style={{ marginBottom: "1rem" }}>
                Satu kalimat per langkah, maksimal {LIMITS.guideSteps} langkah. Setiap langkah boleh menautkan satu
                halaman fitur; tautan hanya tampil ke pembaca yang boleh melihat fitur itu.
              </p>
              {form.steps.length === 0 ? (
                <p className="muted">Belum ada langkah.</p>
              ) : (
                <ol className="step-list">
                  {form.steps.map((step, index) => {
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
                          <div className="step-controls">
                            <div className="field">
                              <label htmlFor={`fitur-${step.key}`}>Fitur langkah {n}</label>
                              <select
                                id={`fitur-${step.key}`}
                                className="select"
                                value={step.entryId ?? ""}
                                onChange={(e) =>
                                  updateStep(step.key, { entryId: e.target.value ? Number(e.target.value) : null })
                                }
                              >
                                <option value="">Tanpa tautan fitur</option>
                                {linkable.map((entry) => (
                                  <option key={entry.id} value={entry.id}>
                                    {entry.title}
                                    {entry.readers.length === 0 ? " (belum terlihat pembaca)" : ""}
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
                disabled={form.steps.length >= LIMITS.guideSteps}
              >
                Tambah langkah
              </button>
              {warnings.length > 0 && (
                <ul className="note" role="note" style={{ marginTop: "1rem" }}>
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="editor-side">
            <section className="card" aria-labelledby="bagian-publikasi-panduan">
              <h2 id="bagian-publikasi-panduan">Pengaturan publikasi</h2>
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
                <select
                  id="audiens"
                  className="select"
                  value={form.audience}
                  onChange={(e) => set("audience", e.target.value as Audience)}
                >
                  {AUDIENCES.map((a) => (
                    <option key={a} value={a}>
                      {AUDIENCE_LABEL[a]}
                    </option>
                  ))}
                </select>
              </div>

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
                      aria-describedby={cannotPublish ? "alasan-publish-panduan" : undefined}
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
                      onConfirm={() => lifecycle(unpublishGuideAction)}
                    />
                  )}
                  <InlineConfirm
                    label="Arsipkan"
                    question="Arsipkan panduan ini?"
                    confirmLabel="Ya, arsipkan"
                    variant="danger"
                    disabled={pending}
                    onConfirm={() => lifecycle(archiveGuideAction)}
                  />
                </div>
              )}
              {cannotPublish && !archived && !saved.isPublished && (
                <p id="alasan-publish-panduan" className="note" role="note">
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
