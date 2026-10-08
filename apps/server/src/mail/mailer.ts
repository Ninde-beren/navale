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
  /** Le transport en un mot, pour les logs : « Mailjet, de … » ou « SMTP … ». */
  readonly describe: string;
  /** Vérifie la configuration (clé, expéditeur, connexion) ; rejette avec la raison. */
  verify(): Promise<void>;
  send(mail: Mail): Promise<void>;
}

export interface MailConfig {
  feedbackTo?: string | null;
  /** Expéditeur, `Navale <navale@exemple.fr>` ou une adresse nue ; par défaut le destinataire. */
  mailFrom?: string | null;
  /** Clés de l'API Mailjet, le compte déjà utilisé par le service de mail de Tutotou. */
  mailjetKey?: string | null;
  mailjetSecret?: string | null;
  /** `smtps://utilisateur:motdepasse@hote:465` ou `smtp://…:587` (STARTTLS). */
  smtpUrl?: string | null;
}

/** « Navale <navale@exemple.fr> » → nom et adresse ; une adresse nue garde un nom vide. */
export function parseAddress(value: string): { email: string; name: string } {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(value);
  return m
    ? { name: (m[1] ?? '').trim(), email: (m[2] ?? '').trim() }
    : { name: '', email: value.trim() };
}

export const MAILJET_API = 'https://api.mailjet.com';

/**
 * Mailjet par son API HTTP (v3.1). L'expéditeur doit être validé dans le compte
 * (adresse ou domaine), ce que `verify()` contrôle au démarrage. `null` tant que
 * les clés et `FEEDBACK_TO` ne sont pas définis.
 */
export function mailjetMailer(config: MailConfig, fetchImpl: typeof fetch = fetch): Mailer | null {
  if (!config.mailjetKey || !config.mailjetSecret || !config.feedbackTo) return null;
  const to = config.feedbackTo;
  const from = parseAddress(config.mailFrom || to);
  const authorization = `Basic ${Buffer.from(`${config.mailjetKey}:${config.mailjetSecret}`).toString('base64')}`;
  return {
    to,
    describe: `Mailjet, de ${from.email}`,
    async verify() {
      const res = await fetchImpl(`${MAILJET_API}/v3/REST/sender?Limit=100`, {
        headers: { authorization },
      });
      if (!res.ok) throw new Error(`Mailjet refuse la clé (HTTP ${res.status})`);
      const body = (await res.json()) as { Data?: Array<{ Email?: string; Status?: string }> };
      const email = from.email.toLowerCase();
      const domain = `*${email.slice(email.indexOf('@'))}`;
      const validated = (body.Data ?? []).some(
        (s) => s.Status === 'Active' && [email, domain].includes((s.Email ?? '').toLowerCase()),
      );
      if (!validated) throw new Error(`expéditeur ${from.email} non validé chez Mailjet`);
    },
    async send(mail) {
      const res = await fetchImpl(`${MAILJET_API}/v3.1/send`, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify({
          Messages: [
            {
              From: { Email: from.email, Name: from.name || 'Navale' },
              To: [{ Email: to }],
              Subject: mail.subject,
              TextPart: mail.text,
              ...(mail.replyTo ? { ReplyTo: { Email: mail.replyTo } } : {}),
            },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`Mailjet répond HTTP ${res.status} : ${(await res.text()).slice(0, 300)}`);
      }
      const body = (await res.json()) as {
        Messages?: Array<{ Status?: string; Errors?: Array<{ ErrorMessage?: string }> }>;
      };
      const first = body.Messages?.[0];
      if (first?.Status !== 'success') {
        const why = first?.Errors?.map((e) => e.ErrorMessage).join(' ; ') || 'réponse inattendue';
        throw new Error(`Mailjet n'a pas accepté le message : ${why}`);
      }
    },
  };
}

/** Transport SMTP (nodemailer) ; `null` tant que `SMTP_URL` et `FEEDBACK_TO` ne sont pas définis. */
export function smtpMailer(config: MailConfig): Mailer | null {
  if (!config.smtpUrl || !config.feedbackTo) return null;
  const to = config.feedbackTo;
  const from = config.mailFrom || to;
  const transport = nodemailer.createTransport(config.smtpUrl);
  let host = 'SMTP';
  try {
    host = `SMTP ${new URL(config.smtpUrl).host}`;
  } catch {
    // Une URL illisible sera refusée par verify() avec la raison de nodemailer.
  }
  return {
    to,
    describe: host,
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

/** Le transport configuré : Mailjet d'abord, sinon SMTP, sinon rien (les retours restent en base). */
export function mailerFromConfig(config: MailConfig): Mailer | null {
  return mailjetMailer(config) ?? smtpMailer(config);
}
