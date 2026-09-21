import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Modul DAL dan sesi mengimpor "server-only"; di tes cukup modul kosong.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    // Pengaman: bila ada kode yang (tanpa sengaja) memakai getDb() atau mediaDir() bawaan, ia
    // mengarah ke folder sementara, tidak pernah ke app/data/ (database dev dan media milik PM).
    env: {
      DATABASE_PATH: join(tmpdir(), "playbook-vitest", "tidak-dipakai.db"),
      MEDIA_DIR: join(tmpdir(), "playbook-vitest", "media"),
    },
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
