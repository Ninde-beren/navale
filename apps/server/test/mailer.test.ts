import { describe, expect, it } from 'vitest';
import {
  MAILJET_API,
  mailerFromConfig,
  mailjetMailer,
  parseAddress,
  smtpMailer,
} from '../src/mail/mailer.js';

interface Call {
  url: string;
  init: RequestInit | undefined;
}
/** Un faux `fetch` qui répond ce qu'on lui dit et garde les appels. */
function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
const config = {
  feedbackTo: 'antoine@exemple.fr',
  mailFrom: 'Navale <contact@tutotou.fr>',
  mailjetKey: 'cle',
  mailjetSecret: 'secret',
};
const auth = `Basic ${Buffer.from('cle:secret').toString('base64')}`;

describe('parseAddress', () => {
  it('sépare le nom et l’adresse, ou garde une adresse nue', () => {
    expect(parseAddress('Navale <navale@exemple.fr>')).toEqual({
      name: 'Navale',
      email: 'navale@exemple.fr',
    });
    expect(parseAddress('"Navale" <navale@exemple.fr>')).toEqual({
      name: 'Navale',
      email: 'navale@exemple.fr',
    });
    expect(parseAddress('  navale@exemple.fr ')).toEqual({ name: '', email: 'navale@exemple.fr' });
  });
});

describe('mailjetMailer', () => {
  it('est absent tant que les clés ou le destinataire manquent', () => {
    expect(mailjetMailer({ feedbackTo: 'a@b.fr', mailjetKey: 'k' })).toBeNull();
    expect(mailjetMailer({ mailjetKey: 'k', mailjetSecret: 's' })).toBeNull();
    expect(mailerFromConfig({})).toBeNull();
  });

  it('envoie par l’API v3.1 avec la clé en Basic, l’expéditeur, le sujet et la réponse directe', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { status: 200, body: { Messages: [{ Status: 'success' }] } },
    ]);
    const mailer = mailjetMailer(config, fetchImpl)!;
    expect(mailer.to).toBe('antoine@exemple.fr');
    expect(mailer.describe).toBe('Mailjet, de contact@tutotou.fr');
    await mailer.send({ subject: 'Navale · retour', text: 'Bravo.', replyTo: 'lea@exemple.fr' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${MAILJET_API}/v3.1/send`);
    expect(calls[0]!.init?.method).toBe('POST');
    expect((calls[0]!.init?.headers as Record<string, string>).authorization).toBe(auth);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      Messages: [
        {
          From: { Email: 'contact@tutotou.fr', Name: 'Navale' },
          To: [{ Email: 'antoine@exemple.fr' }],
          Subject: 'Navale · retour',
          TextPart: 'Bravo.',
          ReplyTo: { Email: 'lea@exemple.fr' },
        },
      ],
    });
  });

  it('rejette quand Mailjet refuse, avec sa raison', async () => {
    const { fetchImpl } = fakeFetch([
      {
        status: 200,
        body: { Messages: [{ Status: 'error', Errors: [{ ErrorMessage: 'expéditeur inconnu' }] }] },
      },
      { status: 401, body: { ErrorMessage: 'Unauthorized' } },
      { status: 500, body: { ErrorMessage: 'Internal error' } },
    ]);
    const mailer = mailjetMailer(config, fetchImpl)!;
    await expect(mailer.send({ subject: 's', text: 't' })).rejects.toThrow('expéditeur inconnu');
    await expect(mailer.send({ subject: 's', text: 't' })).rejects.toThrow(
      'HTTP 401 : Unauthorized',
    );
    await expect(mailer.send({ subject: 's', text: 't' })).rejects.toThrow(
      'HTTP 500 : Internal error',
    );
  });

  it('vérifie la clé et que l’expéditeur, adresse ou domaine, est validé', async () => {
    const senders = (list: Array<[string, string]>) => ({
      status: 200,
      body: { Data: list.map(([Email, Status]) => ({ Email, Status })) },
    });
    const { fetchImpl } = fakeFetch([
      senders([['contact@tutotou.fr', 'Active']]),
      senders([['*@tutotou.fr', 'Active']]),
      senders([['contact@tutotou.fr', 'Inactive']]),
      { status: 401, body: {} },
    ]);
    const mailer = mailjetMailer(config, fetchImpl)!;
    await expect(mailer.verify()).resolves.toBeUndefined();
    await expect(mailer.verify()).resolves.toBeUndefined();
    await expect(mailer.verify()).rejects.toThrow('non validé');
    await expect(mailer.verify()).rejects.toThrow('ne reconnaît pas cette paire de clés');
  });
});

describe('smtpMailer et choix du transport', () => {
  it('décrit son hôte et passe après Mailjet', () => {
    const smtp = smtpMailer({ smtpUrl: 'smtps://u:p@smtp.exemple.fr:465', feedbackTo: 'a@b.fr' })!;
    expect(smtp.describe).toBe('SMTP smtp.exemple.fr:465');
    expect(
      mailerFromConfig({ ...config, smtpUrl: 'smtps://u:p@smtp.exemple.fr:465' })?.describe,
    ).toBe('Mailjet, de contact@tutotou.fr');
    expect(smtpMailer({ feedbackTo: 'a@b.fr' })).toBeNull();
  });
});
