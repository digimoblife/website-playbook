import type { Metadata } from "next";
import { connection } from "next/server";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { getProductName } from "@/lib/settings";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  // Nama produk dibaca dari database saat permintaan masuk, bukan saat build.
  await connection();
  const name = `${getProductName()} Playbook`;
  return {
    title: { default: name, template: `%s · ${name}` },
    description: `Panduan produk ${getProductName()} untuk tim marketing dan partner.`,
    // Situs ini tertutup (wajib login); jangan diindeks mesin pencari.
    robots: { index: false, follow: false },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${display.variable} ${body.variable}`}>
      <body>
        <a className="skip-link" href="#konten">
          Lewati ke konten
        </a>
        {children}
      </body>
    </html>
  );
}
