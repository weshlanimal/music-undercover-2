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
      <head>
        {/* Applique la préférence de thème mémorisée AVANT l'hydratation React,
            pour éviter un flash au thème clair par défaut sur un visiteur qui a
            choisi le sombre (ou l'inverse). Sombre par défaut si rien n'est mémorisé. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("music-undercover:theme");document.documentElement.dataset.theme=(t==="light"?"light":"dark");}catch(e){document.documentElement.dataset.theme="dark";}`
          }}
        />
      </head>
      <body className="min-h-screen bg-ink font-body text-paper antialiased">{children}</body>
    </html>
  );
}
