import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
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

export const metadata: Metadata = {
  title: { default: "Lapaq Playbook", template: "%s · Lapaq Playbook" },
  description: "Panduan produk Lapaq untuk tim marketing dan partner JV.",
  // Situs ini tertutup (wajib login); jangan diindeks mesin pencari.
  robots: { index: false, follow: false },
};

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
