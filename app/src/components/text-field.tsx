"use client";

/** Isian teks satu baris (atau textarea bila `rows` diisi) dengan penghitung karakter. */
export function TextField({
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
