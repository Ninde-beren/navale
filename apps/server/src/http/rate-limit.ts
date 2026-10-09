import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply } from 'fastify';

/**
 * Limites de débit par adresse IP. Aucune route n'est limitée par défaut : chacune
 * déclare la sienne avec `config: { rateLimit: { max, timeWindow } }`. À enregistrer
 * avant les routes, que le plugin équipe au moment où elles sont déclarées.
 *
 * Les compteurs vivent en mémoire : un redémarrage les remet à zéro, ce qui suffit
 * pour une seule instance de serveur.
 */
export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => tooManyRequests(context.ttl),
  });
}

/** Réponse 429 au format des autres erreurs de l'API, avec un message qu'on peut montrer tel quel. */
function tooManyRequests(retryInMs: number) {
  return {
    statusCode: 429,
    code: 'RATE_LIMITED',
    message: `Trop de demandes pour le moment. Réessaie dans ${Math.ceil(retryInMs / 60_000)} min.`,
  };
}

/** Pour une limite vérifiée à la main (`app.createRateLimit`) : même réponse que le plugin. */
export function sendTooManyRequests(reply: FastifyReply, retryInMs: number): FastifyReply {
  return reply
    .code(429)
    .header('retry-after', Math.ceil(retryInMs / 1000))
    .send(tooManyRequests(retryInMs));
}
