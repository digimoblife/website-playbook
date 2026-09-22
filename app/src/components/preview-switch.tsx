"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { setPreviewRoleAction } from "@/app/actions/preview";
import { PREVIEW_ROLES, type PreviewRole } from "@/lib/preview-constants";

const LABEL: Record<PreviewRole, string> = { marketing: "Marketing", partner: "Partner" };

/** Hanya dirender untuk Admin (lihat Navbar). Marketing dan Partner sungguhan tidak pernah melihat ini. */
export function PreviewSwitch({ role }: { role: PreviewRole }) {
  const pathname = usePathname();
  return (
    <div className="preview-banner" role="note">
      <div className="preview-banner-inner">
        <span>
          Melihat sebagai: <strong>{LABEL[role]}</strong>
        </span>
        <div className="preview-banner-actions">
          {PREVIEW_ROLES.map((option) => (
            <form key={option} action={setPreviewRoleAction}>
              <input type="hidden" name="peran" value={option} />
              <input type="hidden" name="kembali" value={pathname} />
              <button
                type="submit"
                className="chip"
                aria-pressed={option === role}
                disabled={option === role}
              >
                {LABEL[option]}
              </button>
            </form>
          ))}
          <Link href="/admin" className="nav-link">
            Kembali ke dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
