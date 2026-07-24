import type { Metadata } from "next";

import Providers from "@/app/providers";
import Footer from "@/components/Footer";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000"),
  title: {
    default: "Scout — DC accessibility previews",
    template: "%s · Scout DC",
  },
  description: "Routes in Washington, DC, paired with public accessibility data.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[color:var(--color-surface)] text-[color:var(--color-text)] antialiased">
        <Providers>
          <main id="main" tabIndex={-1} className="focus:outline-none">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
