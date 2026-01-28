#!/bin/bash
# ===========================================
# LeForge Database Initialization Script
# ===========================================
# This script initializes both LeForge and Kong databases
# Run this script after PostgreSQL is healthy
# ===========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$PROJECT_ROOT/infrastructure/.env" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/infrastructure/.env" | xargs)
elif [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
fi

# Default values
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-LeForge}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
POSTGRES_DB="${POSTGRES_DB:-LeForge_db}"

KONG_PG_USER="${KONG_PG_USER:-kong}"
KONG_PG_PASSWORD="${KONG_PG_PASSWORD:-}"
KONG_PG_DATABASE="${KONG_PG_DATABASE:-kong_db}"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if PostgreSQL is ready
wait_for_postgres() {
    print_status "Waiting for PostgreSQL to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "postgres" -c "SELECT 1" > /dev/null 2>&1; then
            print_success "PostgreSQL is ready!"
            return 0
        fi
        
        print_status "Attempt $attempt/$max_attempts - PostgreSQL not ready yet..."
        sleep 2
        ((attempt++))
    done
    
    print_error "PostgreSQL failed to become ready after $max_attempts attempts"
    return 1
}

# Function to check if a database exists
database_exists() {
    local db_name=$1
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='$db_name'" | grep -q 1
}

# Function to check if a user exists
user_exists() {
    local username=$1
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "postgres" -tAc "SELECT 1 FROM pg_roles WHERE rolname='$username'" | grep -q 1
}

# Function to create Kong database and user
create_kong_database() {
    print_status "Setting up Kong database..."
    
    # Create Kong user if not exists
    if ! user_exists "$KONG_PG_USER"; then
        print_status "Creating Kong user: $KONG_PG_USER"
        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "postgres" << EOF
CREATE USER $KONG_PG_USER WITH PASSWORD '$KONG_PG_PASSWORD';
EOF
        print_success "Kong user created"
    else
        print_warning "Kong user already exists, updating password..."
        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "postgres" << EOF
ALTER USER $KONG_PG_USER WITH PASSWORD '$KONG_PG_PASSWORD';
EOF
    fi
    
    # Create Kong database if not exists
    if ! database_exists "$KONG_PG_DATABASE"; then
        print_status "Creating Kong database: $KONG_PG_DATABASE"
        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "postgres" << EOF
CREATE DATABASE $KONG_PG_DATABASE OWNER $KONG_PG_USER;
GRANT ALL PRIVILEGES ON DATABASE $KONG_PG_DATABASE TO $KONG_PG_USER;
EOF
        print_success "Kong database created"
    else
        print_warning "Kong database already exists"
    fi
}

# Function to create LeForge database schema
create_LeForge_schema() {
    print_status "Setting up LeForge database schema..."
    
    # Create LeForge database if not exists
    if ! database_exists "$POSTGRES_DB"; then
        print_status "Creating LeForge database: $POSTGRES_DB"
        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "postgres" << EOF
CREATE DATABASE $POSTGRES_DB;
EOF
        print_success "LeForge database created"
    else
        print_warning "LeForge database already exists"
    fi
    
    # Run initialization SQL
    if [ -f "$PROJECT_ROOT/infrastructure/postgres/init/01-init.sql" ]; then
        print_status "Running LeForge initialization SQL..."
        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$PROJECT_ROOT/infrastructure/postgres/init/01-init.sql"
        print_success "LeForge schema initialized"
    else
        print_warning "Initialization SQL not found at: $PROJECT_ROOT/infrastructure/postgres/init/01-init.sql"
    fi
}

# Function to create additional tables
create_additional_tables() {
    print_status "Creating additional LeForge tables..."
    
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" << 'EOF'
-- Additional LeForge tables

-- Service registry table
CREATE TABLE IF NOT EXISTS LeForge.services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    endpoint_url VARCHAR(500),
    health_check_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rate limit configurations
CREATE TABLE IF NOT EXISTS LeForge.rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID REFERENCES LeForge.api_keys(id) ON DELETE CASCADE,
    service_id UUID REFERENCES LeForge.services(id) ON DELETE CASCADE,
    requests_per_minute INTEGER DEFAULT 60,
    requests_per_hour INTEGER DEFAULT 1000,
    requests_per_day INTEGER DEFAULT 10000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(api_key_id, service_id)
);

-- Audit log table
CREATE TABLE IF NOT EXISTS LeForge.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    api_key_id UUID REFERENCES LeForge.api_keys(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_services_name ON LeForge.services(name);
CREATE INDEX IF NOT EXISTS idx_services_status ON LeForge.services(status);
CREATE INDEX IF NOT EXISTS idx_rate_limits_api_key ON LeForge.rate_limits(api_key_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON LeForge.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_api_key ON LeForge.audit_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON LeForge.audit_logs(action);

-- Insert default services
INSERT INTO LeForge.services (name, display_name, description, version, endpoint_url, health_check_url)
VALUES 
    ('crypto-service', 'Cryptography Service', 'Encryption, hashing, and cryptographic operations', '1.0.0', 'http://crypto-service:3001', 'http://crypto-service:3001/health'),
    ('math-service', 'Mathematics Service', 'Mathematical calculations and formulas', '1.0.0', 'http://math-service:3002', 'http://math-service:3002/health'),
    ('pdf-service', 'PDF Service', 'PDF generation, manipulation, and conversion', '1.0.0', 'http://pdf-service:3003', 'http://pdf-service:3003/health'),
    ('ocr-service', 'OCR Service', 'Optical character recognition', '1.0.0', 'http://ocr-service:3004', 'http://ocr-service:3004/health'),
    ('image-service', 'Image Service', 'Image processing and manipulation', '1.0.0', 'http://image-service:3005', 'http://image-service:3005/health'),
    ('llm-service', 'LLM Service', 'Large language model operations', '1.0.0', 'http://llm-service:3006', 'http://llm-service:3006/health'),
    ('vector-service', 'Vector Service', 'Vector database operations', '1.0.0', 'http://vector-service:3007', 'http://vector-service:3007/health'),
    ('data-transform-service', 'Data Transform Service', 'Data transformation and conversion', '1.0.0', 'http://data-transform-service:3008', 'http://data-transform-service:3008/health')
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    endpoint_url = EXCLUDED.endpoint_url,
    health_check_url = EXCLUDED.health_check_url,
    updated_at = NOW();

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION LeForge.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
DROP TRIGGER IF EXISTS update_services_updated_at ON LeForge.services;
CREATE TRIGGER update_services_updated_at
    BEFORE UPDATE ON LeForge.services
    FOR EACH ROW
    EXECUTE FUNCTION LeForge.update_updated_at_column();

DROP TRIGGER IF EXISTS update_rate_limits_updated_at ON LeForge.rate_limits;
CREATE TRIGGER update_rate_limits_updated_at
    BEFORE UPDATE ON LeForge.rate_limits
    FOR EACH ROW
    EXECUTE FUNCTION LeForge.update_updated_at_column();

COMMIT;
EOF

    print_success "Additional tables created"
}

# Function to verify database setup
verify_setup() {
    print_status "Verifying database setup..."
    
    local errors=0
    
    # Check LeForge database
    if database_exists "$POSTGRES_DB"; then
        print_success "LeForge database exists: $POSTGRES_DB"
    else
        print_error "LeForge database not found: $POSTGRES_DB"
        ((errors++))
    fi
    
    # Check Kong database
    if database_exists "$KONG_PG_DATABASE"; then
        print_success "Kong database exists: $KONG_PG_DATABASE"
    else
        print_error "Kong database not found: $KONG_PG_DATABASE"
        ((errors++))
    fi
    
    # Check Kong user
    if user_exists "$KONG_PG_USER"; then
        print_success "Kong user exists: $KONG_PG_USER"
    else
        print_error "Kong user not found: $KONG_PG_USER"
        ((errors++))
    fi
    
    # Check LeForge tables
    local table_count=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'LeForge'")
    print_status "LeForge tables count: $table_count"
    
    if [ $errors -eq 0 ]; then
        print_success "Database verification completed successfully!"
        return 0
    else
        print_error "Database verification failed with $errors errors"
        return 1
    fi
}

# Main execution
main() {
    echo ""
    echo "=========================================="
    echo "  LeForge Database Initialization"
    echo "=========================================="
    echo ""
    
    # Validate required environment variables
    if [ -z "$POSTGRES_PASSWORD" ]; then
        print_error "POSTGRES_PASSWORD is required"
        exit 1
    fi
    
    if [ -z "$KONG_PG_PASSWORD" ]; then
        print_error "KONG_PG_PASSWORD is required"
        exit 1
    fi
    
    print_status "Configuration:"
    print_status "  PostgreSQL Host: $POSTGRES_HOST:$POSTGRES_PORT"
    print_status "  LeForge DB: $POSTGRES_DB"
    print_status "  Kong DB: $KONG_PG_DATABASE"
    print_status "  Kong User: $KONG_PG_USER"
    echo ""
    
    # Execute initialization steps
    wait_for_postgres
    create_kong_database
    create_LeForge_schema
    create_additional_tables
    verify_setup
    
    echo ""
    print_success "Database initialization completed!"
    echo ""
}

# Run main function
main "$@"
