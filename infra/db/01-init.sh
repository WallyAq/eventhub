#!/bin/sh
set -eu
# Também pode ser executado novamente para provisionar novos domínios, sem apagar dados.
create_service_db() {
  psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
    --set=db="$1" --set=role="$2" --set=password="$3" <<'SQL'
SELECT pg_advisory_lock(42000);
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=:'role') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'role')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname=:'db') \gexec
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"role";
SELECT pg_advisory_unlock(42000);
SQL
}
create_service_db identity_db identity_user "$IDENTITY_DB_PASSWORD"
create_service_db event_db event_user "$EVENT_DB_PASSWORD"
create_service_db registration_db registration_user "$REGISTRATION_DB_PASSWORD"
create_service_db payment_db payment_user "$PAYMENT_DB_PASSWORD"
create_service_db notification_db notification_user "$NOTIFICATION_DB_PASSWORD"
create_service_db attendance_db attendance_user "$ATTENDANCE_DB_PASSWORD"
create_service_db certificate_db certificate_user "$CERTIFICATE_DB_PASSWORD"
create_service_db reporting_db reporting_user "$REPORTING_DB_PASSWORD"
create_service_db provider_db provider_user "$PROVIDER_DB_PASSWORD"

