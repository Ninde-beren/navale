import { useEffect, useState } from 'react';

/** Vrai quand la requête média correspond, suivi en direct (rotation, redimensionnement). */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Un smartphone, au sens de Navale : un écran étroit. Il sert à rejoindre, pas à créer. */
export const PHONE_QUERY = '(max-width: 767px)';
