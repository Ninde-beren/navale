#!/usr/bin/env bash
# Déploie Navale d'une commande (E8-S3) : copie le dépôt sur le serveur, construit
# l'image là-bas, relance le conteneur, puis vérifie la santé.
#
#   NAVALE_HOST=debian@mon-vps PUBLIC_URL=https://navale.exemple.fr deploy/deploy.sh
#
# Variables :
#   NAVALE_HOST   hôte SSH (obligatoire)
#   NAVALE_DIR    dossier sur le serveur (défaut /srv/navale)
#   PUBLIC_URL    écrit dans .env sur le serveur si fourni ; sinon le .env existant est gardé
set -euo pipefail

HOST="${NAVALE_HOST:?NAVALE_HOST manquant, ex. debian@mon-vps}"
DIR="${NAVALE_DIR:-/srv/navale}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo dev)"

echo "→ copie vers $HOST:$DIR (version $VERSION)"
ssh "$HOST" "mkdir -p '$DIR/data'"
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude data --exclude coverage \
  --exclude .git --exclude '.env' --exclude '*.sqlite*' \
  "$ROOT/" "$HOST:$DIR/"

if [[ -n "${PUBLIC_URL:-}" ]]; then
  ssh "$HOST" "printf 'PUBLIC_URL=%s\n' '$PUBLIC_URL' > '$DIR/.env'"
fi

echo "→ construction et relance"
ssh "$HOST" "cd '$DIR' \
  && { test -f .env || { echo 'Créer $DIR/.env avec PUBLIC_URL=https://…' >&2; exit 1; }; } \
  && NAVALE_VERSION='$VERSION' docker compose up -d --build --remove-orphans \
  && docker compose ps"

echo "→ santé"
ssh "$HOST" "cd '$DIR' && . ./.env && for i in 1 2 3 4 5 6; do \
  wget -qO- \"\$PUBLIC_URL/api/health\" && echo && exit 0; sleep 2; done; \
  echo 'le serveur ne répond pas sur PUBLIC_URL' >&2; exit 1"
