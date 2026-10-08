import { useLayoutEffect, useRef } from 'react';

/**
 * Réduit la taille de police d'un texte sur une ligne pour qu'il tienne dans
 * son parent : un code comme « PWWD » est bien plus large que « ILIT ».
 */
export function useFitText<T extends HTMLElement>(text: string, maxPx: number) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    el.style.fontSize = `${maxPx}px`;
    const available = parent.clientWidth;
    const width = el.scrollWidth;
    if (width > available && width > 0)
      el.style.fontSize = `${Math.floor(((maxPx * available) / width) * 0.98)}px`;
  }, [text, maxPx]);
  return ref;
}
