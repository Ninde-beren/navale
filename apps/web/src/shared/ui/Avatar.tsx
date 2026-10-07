import type { ColorId } from '@navale/protocol';

export function Avatar({
  color,
  initial,
  size = '',
  bot = false,
}: {
  color: ColorId;
  initial: string;
  size?: '' | 'sm' | 'xs' | 'lg' | 'xl';
  bot?: boolean;
}) {
  return <span className={`avatar ${size} c-${color} ${bot ? 'bot' : ''}`}>{initial}</span>;
}

export const initialOf = (name: string): string => (name.trim()[0] ?? '?').toUpperCase();
