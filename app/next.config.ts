import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Next.js 16.3 otomatis menulis AGENTS.md dan CLAUDE.md saat `next dev`. Dimatikan supaya
  // aturan kerja proyek hanya ada di CLAUDE.md di root (lihat ../CLAUDE.md).
  agentRules: false,
  // Playwright (screenshot otomatis, Langkah 6e) dimuat dari node_modules saat berjalan, tidak dibundel.
  serverExternalPackages: ["playwright-core"],
};

export default nextConfig;
