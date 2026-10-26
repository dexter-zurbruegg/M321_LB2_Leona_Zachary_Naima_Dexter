#!/usr/bin/env bash
# Erzeugt .env mit zufälligen Secrets (nur wenn noch keine .env existiert).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then echo ".env existiert schon, nichts geändert."; exit 0; fi
rand() { head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32; }
sed -e "s/^JWT_SECRET=.*/JWT_SECRET=$(rand)$(rand)/" \
    -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(rand)/" \
    -e "s/^USER_DB_PASSWORD=.*/USER_DB_PASSWORD=$(rand)/" \
    -e "s/^TODO_DB_PASSWORD=.*/TODO_DB_PASSWORD=$(rand)/" \
    -e "s/^CATEGORY_DB_PASSWORD=.*/CATEGORY_DB_PASSWORD=$(rand)/" \
    .env.example > .env
chmod 600 .env
echo ".env erstellt."
