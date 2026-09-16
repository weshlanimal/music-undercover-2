/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // On utilise un serveur Node custom (server.ts) pour héberger Socket.io
  // à côté du handler Next.js — nécessaire pour le temps réel authoritative
  // décrit dans le cahier des charges (section 41 / 46).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" }
    ]
  }
};

module.exports = nextConfig;
