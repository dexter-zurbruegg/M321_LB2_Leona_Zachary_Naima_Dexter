# Gateway = nginx (Reverse Proxy + Loadbalancer) + das gemeinsame Frontend als statische Dateien.
# Build-Kontext ist das Repo-Root, damit frontend/ mitkopiert werden kann.
FROM nginx:1.28-alpine
COPY gateway/templates /etc/nginx/templates
COPY frontend /usr/share/nginx/html
# Docker/Kubernetes-DNS-Server aus /etc/resolv.conf übernehmen (-> $NGINX_LOCAL_RESOLVERS im Template)
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    LISTEN_PORT=8080 \
    USER_UPSTREAM_1=user-service-1:3000 USER_UPSTREAM_2=user-service-2:3000 \
    TODO_UPSTREAM_1=todo-service-1:3000 TODO_UPSTREAM_2=todo-service-2:3000 \
    CATEGORY_UPSTREAM_1=category-service-1:3000 CATEGORY_UPSTREAM_2=category-service-2:3000 \
    STATS_UPSTREAM_1=stats-service-1:3000 STATS_UPSTREAM_2=stats-service-2:3000
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:$LISTEN_PORT/health || exit 1
