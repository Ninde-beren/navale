import nodemailer from 'nodemailer';

export interface Mail {
  subject: string;
  text: string;
  /** Adresse de la personne qui écrit, pour lui répondre d'un clic. */
  replyTo?: string;
}

/** Envoi de mails à l'exploitant ; une seule destination, celle de `FEEDBACK_TO`. */
export interface Mailer {
  readonly to: string;
  /** Vérifie la connexion SMTP ; rejette avec la raison si la configuration est fausse. */
  verify(): Promise<void>;
  send(mail: Mail): Promise<void>;
}

export interface MailConfig {
  /** `smtps://utilisateur:motdepasse@hote:465` ou `smtp://…:587` (STARTTLS). */
  smtpUrl?: string | null;
  feedbackTo?: string | null;
  /** Expéditeur ; sans lui, la boîte destinataire s'écrit à elle-même. */
  mailFrom?: string | null;
}

/** Transport SMTP (nodemailer) ; `null` tant que `SMTP_URL` et `FEEDBACK_TO` ne sont pas définis. */
export function smtpMailer(config: MailConfig): Mailer | null {
  if (!config.smtpUrl || !config.feedbackTo) return null;
  const to = config.feedbackTo;
  const from = config.mailFrom || to;
  const transport = nodemailer.createTransport(config.smtpUrl);
  return {
    to,
    async verify() {
      await transport.verify();
    },
    async send(mail) {
      await transport.sendMail({
        from,
        to,
        subject: mail.subject,
        text: mail.text,
        ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
      });
    },
  };
}
