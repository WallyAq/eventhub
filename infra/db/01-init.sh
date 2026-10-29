#!/bin/sh
set -eu
# Executado somente na primeira inicialização de um volume PostgreSQL vazio.
create_service_db() {
  psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
    --set=db="$1" --set=role="$2" --set=password="$3" <<'SQL'
CREATE ROLE :"role" LOGIN PASSWORD :'password';
CREATE DATABASE :"db" OWNER :"role";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"role";
SQL
}
create_service_db identity_db identity_user "$IDENTITY_DB_PASSWORD"
create_service_db event_db event_user "$EVENT_DB_PASSWORD"
create_service_db registration_db registration_user "$REGISTRATION_DB_PASSWORD"
create_service_db payment_db payment_user "$PAYMENT_DB_PASSWORD"
create_service_db notification_db notification_user "$NOTIFICATION_DB_PASSWORD"

