import { Link } from 'react-router';
import clsx from 'clsx';
import { FeedbackButton } from './Feedback.js';
import { Wordmark } from './Wordmark.js';

export interface NoticeAction {
  to: string;
  label: string;
  primary?: boolean;
}

/**
 * Message pleine page : un titre, un texte, une ou deux actions. Colonne de
 * téléphone sur un petit écran, format large sur un ordinateur ou une tablette.
 */
export function Notice({
  title,
  text,
  action,
  actions = action ? [action] : [],
}: {
  title: string;
  text?: string;
  action?: NoticeAction;
  actions?: NoticeAction[];
}) {
  return (
    <div className="notice app-phone">
      <div className="box">
        <Wordmark />
        <h1 className="h1">{title}</h1>
        {text && <p className="muted">{text}</p>}
        {actions.length > 0 && (
          <div className="actions">
            {actions.map((a) => (
              <Link
                key={a.to + a.label}
                className={clsx('btn', a.primary ? 'primary' : 'ghost')}
                to={a.to}
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
        <FeedbackButton variant="link" />
      </div>
    </div>
  );
}
