import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Music Undercover",
  description: "Le jeu social où l'indice, c'est une musique."
};

export const viewport = {
  themeColor: "#0F0D17",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-ink font-body text-paper antialiased">{children}</body>
    </html>
  );
}
