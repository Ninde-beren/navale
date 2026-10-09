import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BoardPrefs {
  /** Écran central posé à plat au milieu de la table : chaque grille tournée vers son joueur. */
  flat: boolean;
  toggleFlat: () => void;
}

/** Préférences de l'appareil qui sert d'écran central, gardées dans `localStorage`. */
export const useBoardPrefs = create<BoardPrefs>()(
  persist(
    (set, get) => ({
      flat: false,
      toggleFlat: () => set({ flat: !get().flat }),
    }),
    { name: 'navale.board' },
  ),
);
