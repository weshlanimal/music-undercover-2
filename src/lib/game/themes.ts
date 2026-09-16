import type { ThemePair } from "@/types";

// Paires proches et ambiguës par construction (section 36) : on évite les
// oppositions trop tranchées ("metal / classique") qui trahiraient
// immédiatement l'infiltré.
export const OFFICIAL_THEMES: ThemePair[] = [
  { id: "t01", category: "Ambiance", civilTheme: "Musique pour une soirée en boîte", undercoverTheme: "Musique pour une soirée entre amis", custom: false },
  { id: "t02", category: "Ambiance", civilTheme: "Musique pour faire la fête", undercoverTheme: "Musique pour un apéro", custom: false },
  { id: "t03", category: "Ambiance", civilTheme: "Musique pour conduire la nuit", undercoverTheme: "Musique pour voyager", custom: false },
  { id: "t04", category: "Émotion", civilTheme: "Musique triste", undercoverTheme: "Musique nostalgique", custom: false },
  { id: "t05", category: "Émotion", civilTheme: "Musique motivante", undercoverTheme: "Musique épique", custom: false },
  { id: "t06", category: "Émotion", civilTheme: "Musique romantique", undercoverTheme: "Musique sensuelle", custom: false },
  { id: "t07", category: "Écran", civilTheme: "Musique de film", undercoverTheme: "Musique de série", custom: false },
  { id: "t08", category: "Écran", civilTheme: "Musique de jeu vidéo", undercoverTheme: "Musique de générique animé", custom: false },
  { id: "t09", category: "Moment", civilTheme: "Musique pour se réveiller", undercoverTheme: "Musique pour se motiver le matin", custom: false },
  { id: "t10", category: "Moment", civilTheme: "Musique pour s'endormir", undercoverTheme: "Musique pour se détendre", custom: false },
  { id: "t11", category: "Moment", civilTheme: "Musique pour réviser", undercoverTheme: "Musique pour se concentrer", custom: false },
  { id: "t12", category: "Moment", civilTheme: "Musique pour cuisiner", undercoverTheme: "Musique pour un dimanche tranquille", custom: false },
  { id: "t13", category: "Sport", civilTheme: "Musique pour une séance de sport", undercoverTheme: "Musique pour courir", custom: false },
  { id: "t14", category: "Sport", civilTheme: "Musique de victoire", undercoverTheme: "Musique de dépassement de soi", custom: false },
  { id: "t15", category: "Époque", civilTheme: "Musique des années 2000", undercoverTheme: "Musique de son enfance", custom: false },
  { id: "t16", category: "Époque", civilTheme: "Musique rétro", undercoverTheme: "Musique intemporelle", custom: false },
  { id: "t17", category: "Lieu", civilTheme: "Musique de plage", undercoverTheme: "Musique de vacances", custom: false },
  { id: "t18", category: "Lieu", civilTheme: "Musique de road trip", undercoverTheme: "Musique de liberté", custom: false },
  { id: "t19", category: "Lieu", civilTheme: "Musique de café parisien", undercoverTheme: "Musique de ville la nuit", custom: false },
  { id: "t20", category: "Fête", civilTheme: "Musique de mariage", undercoverTheme: "Musique de fête de famille", custom: false },
  { id: "t21", category: "Fête", civilTheme: "Musique d'anniversaire", undercoverTheme: "Musique pour souffler des bougies", custom: false },
  { id: "t22", category: "Danse", civilTheme: "Musique pour danser seul", undercoverTheme: "Musique pour danser collé-serré", custom: false },
  { id: "t23", category: "Danse", civilTheme: "Musique électro", undercoverTheme: "Musique house", custom: false },
  { id: "t24", category: "Texture", civilTheme: "Musique planante", undercoverTheme: "Musique hypnotique", custom: false },
  { id: "t25", category: "Texture", civilTheme: "Musique agressive", undercoverTheme: "Musique défouloir", custom: false },
  { id: "t26", category: "Texture", civilTheme: "Musique douce", undercoverTheme: "Musique apaisante", custom: false },
  { id: "t27", category: "Relation", civilTheme: "Musique de rupture", undercoverTheme: "Musique de retrouvailles", custom: false },
  { id: "t28", category: "Relation", civilTheme: "Musique de premier amour", undercoverTheme: "Musique d'amitié", custom: false },
  { id: "t29", category: "Génération", civilTheme: "Musique que tes parents écoutent", undercoverTheme: "Musique que tu écoutais ado", custom: false },
  { id: "t30", category: "Génération", civilTheme: "Musique virale sur les réseaux", undercoverTheme: "Musique que tout le monde connaît", custom: false },
  { id: "t31", category: "Saison", civilTheme: "Musique d'été", undercoverTheme: "Musique de festival", custom: false },
  { id: "t32", category: "Saison", civilTheme: "Musique d'hiver", undercoverTheme: "Musique de soirée au coin du feu", custom: false }
];

export function pickRandomTheme(pool: ThemePair[]): ThemePair {
  const index = Math.floor(Math.random() * pool.length);
  const theme = pool[index];
  if (!theme) throw new Error("Aucun thème disponible dans le pool fourni.");
  return theme;
}
