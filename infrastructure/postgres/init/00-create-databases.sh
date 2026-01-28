#!/bin/bash
# ===========================================
# PostgreSQL Multi-Database Initialization
# ===========================================
# This script runs automatically when PostgreSQL starts
# for the first time and creates both databases
# ===========================================

set -e

# Function to create a database and user
create_database_and_user() {
    local database=$1
    local user=$2
    local password=$3
    
    echo "Creating database: $database with user: $user"
    
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        -- Create user if not exists
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$user') THEN
                CREATE USER $user WITH PASSWORD '$password';
            END IF;
        END
        \$\$;
        
        -- Create database if not exists
        SELECT 'CREATE DATABASE $database OWNER $user'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$database')\gexec
        
        -- Grant privileges
        GRANT ALL PRIVILEGES ON DATABASE $database TO $user;
EOSQL
    
    echo "Database $database created successfully"
}

# Main initialization
echo "=========================================="
echo "  LeForge PostgreSQL Initialization"
echo "=========================================="

# Create Kong database and user
if [ -n "${KONG_PG_USER:-}" ] && [ -n "${KONG_PG_PASSWORD:-}" ]; then
    create_database_and_user "${KONG_PG_DATABASE:-kong_db}" "${KONG_PG_USER}" "${KONG_PG_PASSWORD}"
else
    echo "Kong database credentials not provided, creating with defaults..."
    create_database_and_user "kong_db" "kong" "kong_password"
fi

echo ""
echo "Database initialization complete!"
echo "=========================================="
