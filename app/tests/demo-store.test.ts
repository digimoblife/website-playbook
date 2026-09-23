import { describe, expect, it } from "vitest";
import { parseDemoStoreUrl } from "@/lib/demo-store";

describe("parseDemoStoreUrl", () => {
  it("URL http/https yang sah diterima", () => {
    expect(parseDemoStoreUrl("https://demo.lapaq.id")).toBe("https://demo.lapaq.id/");
    expect(parseDemoStoreUrl("http://demo.lapaq.id/toko")).toBe("http://demo.lapaq.id/toko");
  });

  it("kosong, undefined, atau hanya spasi dianggap tidak diset", () => {
    expect(parseDemoStoreUrl(undefined)).toBeNull();
    expect(parseDemoStoreUrl("")).toBeNull();
    expect(parseDemoStoreUrl("   ")).toBeNull();
  });

  it("bukan URL sah dianggap tidak diset", () => {
    expect(parseDemoStoreUrl("bukan-url")).toBeNull();
    expect(parseDemoStoreUrl("demo.lapaq.id")).toBeNull();
  });

  it("skema selain http/https ditolak (dianggap tidak diset)", () => {
    expect(parseDemoStoreUrl("ftp://demo.lapaq.id")).toBeNull();
    expect(parseDemoStoreUrl("javascript:alert(1)")).toBeNull();
    expect(parseDemoStoreUrl("mailto:a@b.id")).toBeNull();
  });
});
