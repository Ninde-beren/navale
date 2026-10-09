import Mailjet from 'node-mailjet';
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
  /** Adresse d'expédition ; par défaut le destinataire. Validée chez Mailjet, le cas échéant. */
  mailFromEmail?: string | null;
  /** Nom affiché de l'expéditeur ; « Navale » par défaut. */
  mailFromName?: string | null;
  /** Clés de l'API Mailjet, le compte déjà utilisé par le service de mail de Tutotou. */
  mailjetKey?: string | null;
  mailjetSecret?: string | null;
  /** `smtps://utilisateur:motdepasse@hote:465` ou `smtp://…:587` (STARTTLS). */
  smtpUrl?: string | null;
}

/** Le strict nécessaire du client `node-mailjet`, pour lui substituer un faux dans les tests. */
export interface MailjetClient {
  get(
    resource: string,
    config?: { version?: `v${number}` | `v${number}.${number}` },
  ): { request(): Promise<{ body: unknown }> };
  post(
    resource: string,
    config?: { version?: `v${number}` | `v${number}.${number}` },
  ): { request(data: object): Promise<{ body: unknown }> };
}

/** Une erreur du client Mailjet, en français ; un 401 est une paire de clés inconnue du compte. */
function mailjetError(err: unknown, what: string): Error {
  const e = err as {
    statusCode?: number;
    ErrorMessage?: string;
    originalMessage?: string;
    message?: string;
  };
  if (e.statusCode === 401) {
    return new Error(
      'Mailjet ne reconnaît pas cette paire de clés (inactive, régénérée ou supprimée ?)',
    );
  }
  const why = e.ErrorMessage ?? e.originalMessage ?? e.message ?? 'sans détail';
  return new Error(
    `Mailjet refuse ${what}${e.statusCode ? ` (HTTP ${e.statusCode})` : ''} : ${why}`,
  );
}

/**
 * Mailjet par le paquet officiel `node-mailjet`, comme le service de mail de
 * Tutotou : `Mailjet.apiConnect(clé, secret)`, puis `post('send', { version: 'v3.1' })`.
 * L'expéditeur doit être validé dans le compte (adresse ou domaine), ce que
 * `verify()` contrôle au démarrage. `null` tant que les clés et `FEEDBACK_TO`
 * ne sont pas définis.
 */
export function mailjetMailer(config: MailConfig, client?: MailjetClient): Mailer | null {
  if (!config.mailjetKey || !config.mailjetSecret || !config.feedbackTo) return null;
  const to = config.feedbackTo;
  const from = { Email: config.mailFromEmail || to, Name: config.mailFromName || 'Navale' };
  const mailjet: MailjetClient =
    client ?? Mailjet.apiConnect(config.mailjetKey, config.mailjetSecret);
  return {
    to,
    describe: `Mailjet, de ${from.Email}`,
    async verify() {
      let senders: Array<{ Email?: string; Status?: string }>;
      try {
        const { body } = await mailjet.get('sender', { version: 'v3' }).request();
        senders = (body as { Data?: typeof senders }).Data ?? [];
      } catch (err) {
        throw mailjetError(err, 'la liste des expéditeurs');
      }
      const email = from.Email.toLowerCase();
      const domain = `*${email.slice(email.indexOf('@'))}`;
      const validated = senders.some(
        (s) => s.Status === 'Active' && [email, domain].includes((s.Email ?? '').toLowerCase()),
      );
      if (!validated) throw new Error(`expéditeur ${from.Email} non validé chez Mailjet`);
    },
    async send(mail) {
      let body: unknown;
      try {
        ({ body } = await mailjet.post('send', { version: 'v3.1' }).request({
          Messages: [
            {
              From: from,
              To: [{ Email: to }],
              Subject: mail.subject,
              TextPart: mail.text,
              ...(mail.replyTo ? { ReplyTo: { Email: mail.replyTo } } : {}),
            },
          ],
        }));
      } catch (err) {
        throw mailjetError(err, "l'envoi");
      }
      const first = (body as { Messages?: Array<{ Status?: string }> }).Messages?.[0];
      if (first && first.Status !== 'success') {
        throw new Error(`Mailjet n'a pas accepté le message (statut ${first.Status ?? 'inconnu'})`);
      }
    },
  };
}

/** Transport SMTP (nodemailer) ; `null` tant que `SMTP_URL` et `FEEDBACK_TO` ne sont pas définis. */
export function smtpMailer(config: MailConfig): Mailer | null {
  if (!config.smtpUrl || !config.feedbackTo) return null;
  const to = config.feedbackTo;
  const email = config.mailFromEmail || to;
  const from = config.mailFromName ? { name: config.mailFromName, address: email } : email;
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
