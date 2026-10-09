import { describe, expect, it } from 'vitest';
import {
  mailerFromConfig,
  mailjetMailer,
  smtpMailer,
  type MailjetClient,
} from '../src/mail/mailer.js';

interface Call {
  method: 'get' | 'post';
  resource: string;
  version?: string;
  data?: unknown;
}
/** Un faux client Mailjet qui répond dans l'ordre ce qu'on lui a préparé, réponse ou erreur. */
function fakeClient(script: Array<{ body?: unknown; error?: object }>) {
  const calls: Call[] = [];
  const next = () => {
    const step = script.shift() ?? {};
    return step.error ? Promise.reject(step.error) : Promise.resolve({ body: step.body });
  };
  const client: MailjetClient = {
    get: (resource, config) => ({
      request: () => {
        calls.push({
          method: 'get',
          resource,
          ...(config?.version ? { version: config.version } : {}),
        });
        return next();
      },
    }),
    post: (resource, config) => ({
      request: (data) => {
        calls.push({
          method: 'post',
          resource,
          ...(config?.version ? { version: config.version } : {}),
          data,
        });
        return next();
      },
    }),
  };
  return { client, calls };
}
const config = {
  feedbackTo: 'antoine@exemple.fr',
  mailFromEmail: 'contact@exemple.fr',
  mailFromName: 'Navale',
  mailjetKey: 'cle',
  mailjetSecret: 'secret',
};

describe('mailjetMailer', () => {
  it('est absent tant que les clés ou le destinataire manquent', () => {
    expect(mailjetMailer({ feedbackTo: 'a@b.fr', mailjetKey: 'k' })).toBeNull();
    expect(mailjetMailer({ mailjetKey: 'k', mailjetSecret: 's' })).toBeNull();
    expect(mailerFromConfig({})).toBeNull();
  });

  it('envoie par send v3.1 avec l’expéditeur, le destinataire, le sujet et la réponse directe', async () => {
    const { client, calls } = fakeClient([{ body: { Messages: [{ Status: 'success' }] } }]);
    const mailer = mailjetMailer(config, client)!;
    expect(mailer.to).toBe('antoine@exemple.fr');
    expect(mailer.describe).toBe('Mailjet, de contact@exemple.fr');
    await mailer.send({ subject: 'Navale · retour', text: 'Bravo.', replyTo: 'lea@exemple.fr' });
    expect(calls).toEqual([
      {
        method: 'post',
        resource: 'send',
        version: 'v3.1',
        data: {
          Messages: [
            {
              From: { Email: 'contact@exemple.fr', Name: 'Navale' },
              To: [{ Email: 'antoine@exemple.fr' }],
              Subject: 'Navale · retour',
              TextPart: 'Bravo.',
              ReplyTo: { Email: 'lea@exemple.fr' },
            },
          ],
        },
      },
    ]);
  });

  it('rejette quand Mailjet refuse, avec sa raison, et dit quand la clé est inconnue', async () => {
    const { client } = fakeClient([
      { error: { statusCode: 400, ErrorMessage: 'expéditeur inconnu', message: 'Unsuccessful' } },
      { error: { statusCode: 401, message: 'Unsuccessful: Status Code: "401"' } },
      { error: { message: 'getaddrinfo ENOTFOUND api.mailjet.com' } },
      { body: { Messages: [{ Status: 'error' }] } },
    ]);
    const mailer = mailjetMailer(config, client)!;
    const mail = { subject: 's', text: 't' };
    await expect(mailer.send(mail)).rejects.toThrow("l'envoi (HTTP 400) : expéditeur inconnu");
    await expect(mailer.send(mail)).rejects.toThrow('ne reconnaît pas cette paire de clés');
    await expect(mailer.send(mail)).rejects.toThrow('ENOTFOUND');
    await expect(mailer.send(mail)).rejects.toThrow('statut error');
  });

  it('vérifie la clé et que l’expéditeur, adresse ou domaine, est validé', async () => {
    const senders = (list: Array<[string, string]>) => ({
      body: { Data: list.map(([Email, Status]) => ({ Email, Status })) },
    });
    const { client, calls } = fakeClient([
      senders([['contact@exemple.fr', 'Active']]),
      senders([['*@exemple.fr', 'Active']]),
      senders([['contact@exemple.fr', 'Inactive']]),
      { error: { statusCode: 401 } },
    ]);
    const mailer = mailjetMailer(config, client)!;
    await expect(mailer.verify()).resolves.toBeUndefined();
    await expect(mailer.verify()).resolves.toBeUndefined();
    await expect(mailer.verify()).rejects.toThrow('non validé');
    await expect(mailer.verify()).rejects.toThrow('ne reconnaît pas cette paire de clés');
    expect(calls[0]).toEqual({ method: 'get', resource: 'sender', version: 'v3' });
  });
});

describe('smtpMailer et choix du transport', () => {
  it('décrit son hôte et passe après Mailjet', () => {
    const smtp = smtpMailer({ smtpUrl: 'smtps://u:p@smtp.exemple.fr:465', feedbackTo: 'a@b.fr' })!;
    expect(smtp.describe).toBe('SMTP smtp.exemple.fr:465');
    expect(
      mailerFromConfig({ ...config, smtpUrl: 'smtps://u:p@smtp.exemple.fr:465' })?.describe,
    ).toBe('Mailjet, de contact@exemple.fr');
    expect(smtpMailer({ feedbackTo: 'a@b.fr' })).toBeNull();
  });
});
