import { defineConfig } from "drizzle-kit";

// Dipakai hanya untuk `npm run db:generate` (membuat berkas migrasi dari skema).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
