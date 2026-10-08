import { existsSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';

/** Première adresse IPv4 non locale : c'est elle que le QR code encode en développement. */
export function lanIp(): string {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}

export interface ServerConfig {
  port: number;
  dataDir: string;
  /** Base des URL que voient les téléphones (QR, lien de la partie). */
  publicUrl: string;
  logLevel: string;
  /** Dossier du build web à servir (production) ; `null` en développement, Vite s'en charge. */
  webDist?: string | null;
  /** Destinataire des retours du bouton « Un avis ? » ; sans lui, ils restent en base. */
  feedbackTo?: string | null;
  /** Transport des mails, `smtps://utilisateur:motdepasse@hote:465` ; sans lui, pas d'envoi. */
  smtpUrl?: string | null;
  /** Expéditeur des mails ; par défaut le destinataire lui-même. Validé chez Mailjet, le cas échéant. */
  mailFrom?: string | null;
  /** Clés de l'API Mailjet (compte du service de mail de Tutotou) ; prioritaires sur SMTP. */
  mailjetKey?: string | null;
  mailjetSecret?: string | null;
}

/** `WEB_DIST`, sinon le build web s'il existe à côté du serveur ; sinon rien. */
function findWebDist(env: NodeJS.ProcessEnv): string | null {
  const candidates = env.WEB_DIST
    ? [env.WEB_DIST]
    : [resolve(process.cwd(), 'apps/web/dist'), resolve(process.cwd(), '../web/dist')];
  return candidates.find((dir) => existsSync(resolve(dir, 'index.html'))) ?? null;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const webPort = Number(env.WEB_PORT ?? 5250);
  return {
    port: Number(env.PORT ?? 5251),
    dataDir: env.DATA_DIR ?? './data',
    publicUrl: (env.PUBLIC_URL ?? `https://${lanIp()}:${webPort}`).replace(/\/+$/, ''),
    logLevel: env.LOG_LEVEL ?? 'info',
    webDist: findWebDist(env),
    feedbackTo: env.FEEDBACK_TO || null,
    smtpUrl: env.SMTP_URL || null,
    mailFrom: env.MAIL_FROM || null,
    mailjetKey: env.MAILJET_API_KEY || null,
    mailjetSecret: env.MAILJET_API_SECRET || null,
  };
}
