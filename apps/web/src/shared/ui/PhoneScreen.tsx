import type { ReactNode } from 'react';
import type { ColorId } from '@navale/protocol';
import { FeedbackButton } from './Feedback.js';
import { Wordmark } from './Wordmark.js';

/** Bandeau du téléphone : la marque, le bouton « Un avis ? » et le code de la partie. */
export function PhoneHeader({ code }: { code: string }) {
  return (
    <div className="flex items-center justify-between">
      <Wordmark />
      <span className="flex items-center gap-2">
        <FeedbackButton />
        <span className="chip plain">{code}</span>
      </span>
    </div>
  );
}

/** Un écran du téléphone, aux couleurs du joueur, sous son bandeau. */
export function PhoneScreen({
  code,
  color,
  gap = 14,
  children,
}: {
  code: string;
  color: ColorId;
  gap?: number;
  children: ReactNode;
}) {
  return (
    <div className={`app-phone me-${color}`} style={{ padding: '16px 16px 24px', gap }}>
      <PhoneHeader code={code} />
      {children}
    </div>
  );
}
