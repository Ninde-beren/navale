import { Link } from 'react-router';
import { Wordmark } from './Wordmark.js';

export function Notice({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="notice app-phone">
      <div className="box">
        <Wordmark />
        <h1 className="h1">{title}</h1>
        {text && <p className="muted">{text}</p>}
        {action && (
          <Link className="btn ghost" to={action.to}>
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}
