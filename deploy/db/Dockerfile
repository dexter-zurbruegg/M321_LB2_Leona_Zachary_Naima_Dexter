# PostgreSQL mit Init-Skript (legt die drei Service-Datenbanken an).
# Als eigenes Image, damit es auch mit einem entfernten Docker-Host (DOCKER_HOST) und in Kubernetes funktioniert.
FROM postgres:17-alpine
COPY init.sh /docker-entrypoint-initdb.d/10-init.sh
