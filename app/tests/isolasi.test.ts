// Pengaman aturan kerja: tes tidak boleh membuka atau mengubah app/data/ (database dev dan media).
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { databasePath } from "@/db/client";
import { mediaDir } from "@/lib/media";

const APP_DATA = resolve(process.cwd(), "data");

describe("isolasi tes dari app/data/", () => {
  it("lokasi database bawaan selama tes ada di luar app/data/", () => {
    expect(databasePath().startsWith(APP_DATA)).toBe(false);
    expect(databasePath()).toContain("playbook-vitest");
  });

  it("lokasi media bawaan selama tes ada di luar app/data/", () => {
    expect(mediaDir().startsWith(APP_DATA)).toBe(false);
    expect(mediaDir()).toContain("playbook-vitest");
  });
});
