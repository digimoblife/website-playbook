"use client";

import { useState, useTransition } from "react";
import { submitFeedbackAction } from "@/app/actions/feedback";

/** Hanya dirender untuk Marketing/Partner sungguhan (lihat halaman fitur); Admin tidak melihat ini. */
export function FeedbackWidget({ entryId }: { entryId: number }) {
  const [answered, setAnswered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function vote(helpful: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await submitFeedbackAction(entryId, helpful);
      if (res.ok) setAnswered(true);
      else setError(res.error);
    });
  }

  if (answered) {
    return (
      <p role="status" className="alert alert-success" style={{ margin: 0 }}>
        Terima kasih, masukanmu tercatat.
      </p>
    );
  }

  return (
    <div>
      {error && (
        <p role="alert" className="alert alert-danger" style={{ marginBottom: "0.75rem" }}>
          {error}
        </p>
      )}
      <div className="item-actions">
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => vote(true)}>
          Ya
        </button>
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => vote(false)}>
          Tidak
        </button>
      </div>
    </div>
  );
}
