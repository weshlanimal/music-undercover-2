// Génère de courtes pistes audio synthétiques (sinusoïdes/arpèges) pour le
// MockMusicProvider. Aucun contenu protégé : ce sont des tonalités générées
// mathématiquement, uniquement pour développer/tester le jeu sans clé API.
// Usage : node scripts/generate-mock-audio.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "mock-audio");
mkdirSync(outDir, { recursive: true });

const SAMPLE_RATE = 16000;

function noteFreq(semitoneFromA4) {
  return 440 * Math.pow(2, semitoneFromA4 / 12);
}

/** Enveloppe ADSR simplifiée pour éviter les clics. */
function envelope(t, dur) {
  const attack = 0.02;
  const release = 0.08;
  if (t < attack) return t / attack;
  if (t > dur - release) return Math.max(0, (dur - t) / release);
  return 1;
}

function synthTrack(pattern, secondsPerNote = 0.5) {
  const totalSeconds = pattern.length * secondsPerNote;
  const numSamples = Math.floor(totalSeconds * SAMPLE_RATE);
  const samples = new Float32Array(numSamples);

  pattern.forEach((semitone, noteIndex) => {
    const freq = noteFreq(semitone);
    const startSample = Math.floor(noteIndex * secondsPerNote * SAMPLE_RATE);
    const noteSamples = Math.floor(secondsPerNote * SAMPLE_RATE);
    for (let i = 0; i < noteSamples; i++) {
      const t = i / SAMPLE_RATE;
      const env = envelope(t, secondsPerNote);
      // Léger mélange fondamentale + harmonique pour un timbre moins "bip".
      const value =
        0.6 * Math.sin(2 * Math.PI * freq * t) +
        0.25 * Math.sin(2 * Math.PI * freq * 2 * t) +
        0.15 * Math.sin(2 * Math.PI * freq * 3 * t);
      const idx = startSample + i;
      if (idx < numSamples) {
        samples[idx] = value * env * 0.5;
      }
    }
  });

  return samples;
}

function floatTo16BitPCM(samples) {
  const buffer = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, i * 2);
  }
  return buffer;
}

function writeWavFile(filePath, samples, sampleRate = SAMPLE_RATE) {
  const pcm = floatTo16BitPCM(samples);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(filePath, Buffer.concat([header, pcm]));
}

// Quelques motifs distincts (en demi-tons relatifs à A4) pour que les pistes
// de démo soient reconnaissables les unes des autres pendant les tests.
const DEMO_TRACKS = [
  { id: "demo-01", title: "Nocturne Synthé A", pattern: [0, 3, 7, 10, 7, 3, 0, -2], tempo: 0.45 },
  { id: "demo-02", title: "Arpège Lo-fi B", pattern: [-5, -1, 2, 6, 2, -1, -5, -8], tempo: 0.55 },
  { id: "demo-03", title: "Groove Nu-Disco C", pattern: [0, 0, 5, 5, 7, 7, 5, 3, 2, 0], tempo: 0.3 },
  { id: "demo-04", title: "Ballade Douce D", pattern: [2, 4, 7, 9, 7, 4, 2, -1], tempo: 0.6 },
  { id: "demo-05", title: "Beat Sombre E", pattern: [-7, -7, -4, -7, -9, -7, -4, -2], tempo: 0.4 },
  { id: "demo-06", title: "Pop Solaire F", pattern: [4, 7, 11, 7, 9, 7, 4, 2], tempo: 0.35 },
  { id: "demo-07", title: "Chill House G", pattern: [0, 4, 7, 12, 7, 4, 0, -5], tempo: 0.5 },
  { id: "demo-08", title: "Drill Nocturne H", pattern: [-3, -3, 0, -3, -5, -3, 0, 2], tempo: 0.28 }
];

for (const track of DEMO_TRACKS) {
  const samples = synthTrack(track.pattern, track.tempo);
  writeWavFile(join(outDir, `${track.id}.wav`), samples);
  console.log(`✓ ${track.id}.wav généré (${track.title})`);
}

console.log(`\n${DEMO_TRACKS.length} pistes de démo écrites dans public/mock-audio/`);
