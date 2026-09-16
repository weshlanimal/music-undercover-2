import { customAlphabet, nanoid } from "nanoid";

// Alphabet sans caractères ambigus (0/O, 1/I) pour un code lisible à l'oral.
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generateRoomCode = customAlphabet(roomCodeAlphabet, 5);

export function createRoomCode(): string {
  return generateRoomCode();
}

export function createSessionId(): string {
  return nanoid(21);
}

export function createId(prefix: string): string {
  return `${prefix}_${nanoid(12)}`;
}

/** Comparaison normalisée pour la devinette finale de Mr White : insensible
 *  à la casse, aux accents et aux espaces superflus. */
export function normalizeGuess(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les diacritiques
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function guessMatchesTheme(guess: string, theme: string): boolean {
  return normalizeGuess(guess) === normalizeGuess(theme);
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function randomAvatar(): string {
  const emojis = ["🦊", "🐙", "🐼", "🦁", "🐸", "🦉", "🐳", "🐺", "🦄", "🐨", "🦋", "🐢", "🦅", "🐬", "🦩", "🐯"];
  return emojis[Math.floor(Math.random() * emojis.length)]!;
}
