import { useEffect } from 'react';

/** How many open pages need every key for themselves, like the word game, where each letter is a guess. */
let anzahl = 0;

/** True while such a page is open: global shortcuts (?, /, C, G + letter, Z for undo) stay quiet then. */
export const seiteBrauchtTasten = () => anzahl > 0;

/** Claims the keyboard for the page while it is mounted. */
export function useEigeneTasten() {
  useEffect(() => {
    anzahl += 1;
    return () => {
      anzahl -= 1;
    };
  }, []);
}
