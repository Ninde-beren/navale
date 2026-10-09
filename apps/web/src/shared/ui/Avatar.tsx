import clsx from 'clsx';
import type { ColorId, PublicPlayer } from '@navale/protocol';

type AvatarSize = '' | 'sm' | 'xs' | 'lg' | 'xl';

export function Avatar({
  color,
  initial,
  size = '',
  bot = false,
}: {
  color: ColorId;
  initial: string;
  size?: AvatarSize;
  bot?: boolean;
}) {
  return <span className={clsx('avatar', size, `c-${color}`, bot && 'bot')}>{initial}</span>;
}

/** L'avatar d'un joueur de la partie : sa couleur, son initiale, et la marque des bots. */
export function PlayerAvatar({ player, size = '' }: { player: PublicPlayer; size?: AvatarSize }) {
  return (
    <Avatar
      color={player.color}
      initial={initialOf(player.name)}
      size={size}
      bot={player.kind === 'bot'}
    />
  );
}

export const initialOf = (name: string): string => (name.trim()[0] ?? '?').toUpperCase();
