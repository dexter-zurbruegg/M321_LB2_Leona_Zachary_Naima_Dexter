#!/bin/sh
# Läuft nur beim allerersten Start (leeres Datenvolume).
# Eine PostgreSQL-Instanz, aber pro Service eine eigene Datenbank mit eigenem Benutzer:
# jeder Service sieht nur seine Daten ("database per service").
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE user_svc     LOGIN PASSWORD '${USER_DB_PASSWORD}';
CREATE ROLE todo_svc     LOGIN PASSWORD '${TODO_DB_PASSWORD}';
CREATE ROLE category_svc LOGIN PASSWORD '${CATEGORY_DB_PASSWORD}';
CREATE DATABASE users      OWNER user_svc;
CREATE DATABASE todos      OWNER todo_svc;
CREATE DATABASE categories OWNER category_svc;
REVOKE ALL ON DATABASE users, todos, categories FROM PUBLIC;
SQL
