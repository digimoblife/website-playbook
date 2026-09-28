// Draf entri lewat AI (percobaan Langkah 4-experimental). AI hanya menerima judul, deskripsi,
// dan nama file PR (bukan kode) — lihat CLAUDE.md aturan 3 dan blueprint "Prinsip yang dijaga".
// AI TIDAK PERNAH menentukan status/audiens: pemanggil (lib/admin-entries.ts) selalu memaksa
// Internal/Internal, apa pun yang dikembalikan di sini.
import { KINDS, LIMITS, NATURES, type Kind, type Nature } from "@/lib/domain";

export type AiDraftInput = {
  prTitle: string;
  prBody: string;
  files: string[];
};

export type AiDraftFields = {
  title: string;
  summary: string;
  problem: string;
  forWhom: string;
  explanation: string;
  kind: Kind;
  nature: Nature;
};

export type AiDraftResult =
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string }
  | { status: "ok"; draft: AiDraftFields };

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";

function apiKey(): string | undefined {
  return process.env.AI_API_KEY?.trim() || undefined;
}

function modelName(): string | undefined {
  return process.env.AI_MODEL?.trim() || undefined;
}

/** Dipakai UI untuk menampilkan banner "belum aktif" tanpa membocorkan nilai kuncinya. */
export function isAiConfigured(): boolean {
  return Boolean(apiKey() && modelName());
}

function buildPrompt(input: AiDraftInput): string {
  return [
    "Kamu membantu menulis draf entri panduan produk dalam BAHASA INDONESIA untuk tim marketing internal dan partner.",
    "Tulis HANYA berdasarkan judul, deskripsi, dan nama file yang diberikan di bawah. JANGAN mengarang detail, angka, atau klaim apa pun yang tidak ada di sumbernya.",
    "Bila deskripsi kosong atau tidak jelas, tulis draf singkat dan umum berdasarkan judul dan nama file saja — jangan menebak fitur secara spesifik.",
    "",
    `Judul PR: ${input.prTitle}`,
    `Deskripsi PR: ${input.prBody || "(kosong)"}`,
    `File yang berubah: ${input.files.length > 0 ? input.files.join(", ") : "(tidak diketahui)"}`,
    "",
    'Balas HANYA dengan JSON valid (tanpa markdown, tanpa teks lain) persis berbentuk:',
    '{"title": string, "summary": string, "problem": string, "forWhom": string, "explanation": string, "kind": "core" | "addon", "nature": "new" | "update"}',
    `title maksimal ${LIMITS.title} karakter, summary maksimal ${LIMITS.summary} karakter, problem/forWhom/explanation maksimal ${LIMITS.longText} karakter.`,
  ].join("\n");
}

/** Panggilan Gemini generateContent sungguhan. Dipisah supaya tes bisa menyuntik pengganti palsu. */
export async function callAiApi(prompt: string, key: string, model: string): Promise<string> {
  const res = await fetch(`${GEMINI_API}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) {
    throw new Error(`Gemini API mengembalikan status ${res.status}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Balasan Gemini tidak memuat teks.");
  return text;
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Mem-parse dan membersihkan JSON dari AI. null bila bentuknya tidak bisa dipakai. */
function parseDraft(raw: string): AiDraftFields | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const title = clip(o.title, LIMITS.title);
  if (!title) return null;
  return {
    title,
    summary: clip(o.summary, LIMITS.summary),
    problem: clip(o.problem, LIMITS.longText),
    forWhom: clip(o.forWhom, LIMITS.longText),
    explanation: clip(o.explanation, LIMITS.longText),
    // kind/nature dari AI hanya usulan; Admin mengonfirmasi di editor (lihat blueprint).
    kind: KINDS.includes(o.kind as Kind) ? (o.kind as Kind) : "core",
    nature: NATURES.includes(o.nature as Nature) ? (o.nature as Nature) : "new",
  };
}

/**
 * Menghasilkan draf entri dari info PR. `deps.callApi` bisa disuntik tes untuk memalsukan
 * panggilan AI — jangan pernah memanggil AI sungguhan di test suite.
 */
export async function generateAiDraft(
  input: AiDraftInput,
  deps: { callApi?: typeof callAiApi } = {},
): Promise<AiDraftResult> {
  const key = apiKey();
  if (!key) {
    return {
      status: "unavailable",
      message: "Draf AI belum aktif — atur AI_API_KEY di lingkungan server untuk mengaktifkan fitur ini.",
    };
  }
  const model = modelName();
  if (!model) {
    return {
      status: "unavailable",
      message: "AI_API_KEY sudah diisi tetapi AI_MODEL belum. Isi nama model Gemini saat ini (cek ai.google.dev).",
    };
  }

  const call = deps.callApi ?? callAiApi;
  const prompt = buildPrompt(input);

  let raw: string;
  try {
    raw = await call(prompt, key, model);
  } catch {
    return { status: "error", message: "Panggilan AI gagal (jaringan atau kuota). Draf tidak dibuat." };
  }

  let draft = parseDraft(raw);
  if (!draft) {
    // Maksimal satu percobaan ulang, khusus untuk format JSON yang gagal di-parse.
    try {
      raw = await call(
        `${prompt}\n\nKELUARAN SEBELUMNYA TIDAK VALID. Ulangi HANYA dengan JSON yang sah sesuai bentuk di atas, tanpa teks atau markdown lain.`,
        key,
        model,
      );
    } catch {
      return { status: "error", message: "Panggilan AI gagal saat mencoba ulang. Draf tidak dibuat." };
    }
    draft = parseDraft(raw);
    if (!draft) {
      return { status: "error", message: "AI mengembalikan format yang tidak bisa dibaca. Draf tidak dibuat." };
    }
  }

  return { status: "ok", draft };
}

// ---------- Langkah 6d: pecah satu PR menjadi beberapa usulan entri ----------

/** Batas usulan per PR. Audit menemukan PR berisi sampai lima butir fitur (PR #7). */
export const MAX_PROPOSALS = 5;

export type AiProposalsResult =
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string }
  | { status: "ok"; proposals: AiDraftFields[] };

function buildProposalsPrompt(input: AiDraftInput): string {
  return [
    "Kamu membantu menulis draf entri panduan produk dalam BAHASA INDONESIA untuk tim marketing internal dan partner.",
    "Satu PR bisa berisi beberapa fitur atau pembaruan yang berbeda. Pecah menjadi usulan entri: SATU usulan untuk SETIAP fitur atau pembaruan yang berbeda bagi pengguna toko.",
    `Bila PR hanya berisi satu fitur, kembalikan satu usulan. Paling banyak ${MAX_PROPOSALS} usulan. Abaikan perubahan teknis yang tidak terlihat pengguna (tes, refactor, dependensi).`,
    "Tulis HANYA berdasarkan judul, deskripsi, dan nama file yang diberikan. JANGAN mengarang detail, angka, atau klaim yang tidak ada di sumbernya.",
    "",
    `Judul PR: ${input.prTitle}`,
    `Deskripsi PR: ${input.prBody || "(kosong)"}`,
    `File yang berubah: ${input.files.length > 0 ? input.files.join(", ") : "(tidak diketahui)"}`,
    "",
    "Balas HANYA dengan JSON valid (tanpa markdown, tanpa teks lain) persis berbentuk:",
    '{"proposals": [{"title": string, "summary": string, "problem": string, "forWhom": string, "explanation": string, "kind": "core" | "addon", "nature": "new" | "update"}]}',
    `title maksimal ${LIMITS.title} karakter, summary maksimal ${LIMITS.summary} karakter, problem/forWhom/explanation maksimal ${LIMITS.longText} karakter.`,
  ].join("\n");
}

/**
 * Mem-parse daftar usulan. Menerima {"proposals": [...]}, larik langsung, atau satu objek (bila AI
 * tetap membalas bentuk lama). Usulan yang tidak bisa dipakai dibuang; judul ganda digabung.
 * null bila tidak ada satu pun usulan yang sah.
 */
export function parseProposals(raw: string): AiDraftFields[] | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const list: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null && Array.isArray((value as { proposals?: unknown }).proposals)
      ? (value as { proposals: unknown[] }).proposals
      : [value];
  const seen = new Set<string>();
  const proposals: AiDraftFields[] = [];
  for (const item of list) {
    const draft = parseDraft(JSON.stringify(item));
    if (!draft || seen.has(draft.title.toLowerCase())) continue;
    seen.add(draft.title.toLowerCase());
    proposals.push(draft);
    if (proposals.length >= MAX_PROPOSALS) break;
  }
  return proposals.length > 0 ? proposals : null;
}

/** Seperti generateAiDraft, tetapi AI boleh memecah PR menjadi beberapa usulan (1 sampai 5). */
export async function generateAiProposals(
  input: AiDraftInput,
  deps: { callApi?: typeof callAiApi } = {},
): Promise<AiProposalsResult> {
  const key = apiKey();
  if (!key) {
    return {
      status: "unavailable",
      message: "Draf AI belum aktif — atur AI_API_KEY di lingkungan server untuk mengaktifkan fitur ini.",
    };
  }
  const model = modelName();
  if (!model) {
    return {
      status: "unavailable",
      message: "AI_API_KEY sudah diisi tetapi AI_MODEL belum. Isi nama model Gemini saat ini (cek ai.google.dev).",
    };
  }

  const call = deps.callApi ?? callAiApi;
  const prompt = buildProposalsPrompt(input);
  let proposals: AiDraftFields[] | null = null;
  for (const attempt of [prompt, `${prompt}\n\nKELUARAN SEBELUMNYA TIDAK VALID. Ulangi HANYA dengan JSON yang sah sesuai bentuk di atas.`]) {
    let raw: string;
    try {
      raw = await call(attempt, key, model);
    } catch {
      return { status: "error", message: "Panggilan AI gagal (jaringan atau kuota). Usulan tidak dibuat." };
    }
    proposals = parseProposals(raw);
    if (proposals) break;
  }
  if (!proposals) return { status: "error", message: "AI mengembalikan format yang tidak bisa dibaca. Usulan tidak dibuat." };
  return { status: "ok", proposals };
}
