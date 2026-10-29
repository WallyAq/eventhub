import psycopg


def check_database():
    """Consulta somente o banco configurado para este serviço via PG*."""
    with psycopg.connect(connect_timeout=2, options="-c statement_timeout=2000") as conn:
        conn.execute("SELECT 1")

