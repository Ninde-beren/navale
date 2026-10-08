#!/usr/bin/env bash
# Déploie Navale d'une commande (E8-S3) : copie le dépôt sur le serveur, construit
# l'image là-bas, relance le conteneur, puis vérifie la santé.
#
#   NAVALE_HOST=debian@mon-vps PUBLIC_URL=https://navale.exemple.fr deploy/deploy.sh
#
# Variables :
#   NAVALE_HOST   hôte SSH (obligatoire)
#   NAVALE_DIR    dossier sur le serveur (défaut /srv/navale)
#   NAVALE_SSH_KEY clé privée SSH à utiliser, si ce n'est pas celle par défaut
#   NAVALE_PORT   port local du conteneur sur le serveur, pour le contrôle de santé (défaut 5251)
#   PUBLIC_URL    écrit dans .env sur le serveur si fourni ; sinon le .env existant est gardé
set -euo pipefail

HOST="${NAVALE_HOST:?NAVALE_HOST manquant, ex. debian@mon-vps}"
DIR="${NAVALE_DIR:-/srv/navale}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo dev)"
SSH="ssh${NAVALE_SSH_KEY:+ -i $NAVALE_SSH_KEY}"
ssh() { command $SSH "$@"; }

EXCLUDES=(--exclude node_modules --exclude dist --exclude data --exclude coverage
  --exclude .git --exclude '.env' --exclude '*.sqlite*')

echo "→ copie vers $HOST:$DIR (version $VERSION)"
ssh "$HOST" "mkdir -p '$DIR/data'"
if ssh "$HOST" 'command -v rsync >/dev/null'; then
  rsync -az --delete -e "$SSH" "${EXCLUDES[@]}" "$ROOT/" "$HOST:$DIR/"
else
  # Sans rsync sur le serveur : archive à travers SSH. On vide d'abord le dossier,
  # sauf les données et le .env, pour ne pas garder de fichiers supprimés.
  ssh "$HOST" "find '$DIR' -mindepth 1 -maxdepth 1 ! -name data ! -name .env -exec rm -rf {} +"
  tar -C "$ROOT" -czf - "${EXCLUDES[@]}" . | ssh "$HOST" "tar -xzf - -C '$DIR'"
fi

if [[ -n "${PUBLIC_URL:-}" ]]; then
  ssh "$HOST" "printf 'PUBLIC_URL=%s\n' '$PUBLIC_URL' > '$DIR/.env'"
fi

echo "→ construction et relance"
ssh "$HOST" "cd '$DIR' \
  && { test -f .env || { echo 'Créer $DIR/.env avec PUBLIC_URL=https://…' >&2; exit 1; }; } \
  && NAVALE_VERSION='$VERSION' docker compose up -d --build --remove-orphans \
  && docker compose ps"

echo "→ santé du conteneur"
ssh "$HOST" "for i in 1 2 3 4 5 6 7 8; do \
  wget -qO- http://127.0.0.1:${NAVALE_PORT:-5251}/api/health && echo && exit 0; sleep 2; done; \
  echo 'le conteneur ne répond pas' >&2; cd '$DIR' && docker compose logs --tail 30; exit 1"

echo "→ santé sur l'URL publique"
ssh "$HOST" "cd '$DIR' && . ./.env && wget -qO- --timeout 8 \"\$PUBLIC_URL/api/health\" && echo \
  || echo \"pas encore joignable sur \$PUBLIC_URL : DNS ou bloc Caddy à poser\""
