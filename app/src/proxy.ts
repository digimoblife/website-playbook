// Pemeriksaan optimistis saja: hanya memeriksa keberadaan cookie sesi, tanpa membaca database.
// Keamanan sebenarnya ada di lib/dal.ts (requireUser/requireAdmin) yang dipanggil tiap halaman
// dan server action. Jangan mengandalkan berkas ini sebagai satu-satunya pengaman.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-constants";

export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/masuk", request.url));
  }
  return NextResponse.next();
}

// Semua halaman kecuali /masuk dan berkas statis.
export const config = {
  matcher: ["/((?!masuk|_next/static|_next/image|icon\\.svg).*)"],
};
