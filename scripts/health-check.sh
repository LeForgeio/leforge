#!/bin/bash
# ===========================================
# LeForge Infrastructure Health Check Script
# ===========================================
# This script verifies all infrastructure services are running
# ===========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-LeForge_password}"
POSTGRES_DB="${POSTGRES_DB:-LeForge_db}"

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-redis_password}"

QDRANT_HOST="${QDRANT_HOST:-localhost}"
QDRANT_HTTP_PORT="${QDRANT_HTTP_PORT:-6333}"

KONG_HOST="${KONG_HOST:-localhost}"
KONG_ADMIN_PORT="${KONG_ADMIN_PORT:-8001}"
KONG_PROXY_PORT="${KONG_PROXY_PORT:-8000}"

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Function to print colored output
print_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓ PASS]${NC} $1"
    ((PASSED_CHECKS++))
}

print_warning() {
    echo -e "${YELLOW}[! WARN]${NC} $1"
    ((WARNING_CHECKS++))
}

print_error() {
    echo -e "${RED}[✗ FAIL]${NC} $1"
    ((FAILED_CHECKS++))
}

# Function to check PostgreSQL
check_postgres() {
    print_header "PostgreSQL Health Check"
    ((TOTAL_CHECKS++))
    
    # Check connection
    if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1" > /dev/null 2>&1; then
        print_success "PostgreSQL connection: OK"
        
        # Get PostgreSQL version
        local version=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT version()" 2>/dev/null | head -1)
        print_status "Version: $version"
        
        # Check database size
        local db_size=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT pg_size_pretty(pg_database_size('$POSTGRES_DB'))" 2>/dev/null)
        print_status "Database size: $db_size"
        
        # Check active connections
        local connections=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM pg_stat_activity WHERE state = 'active'" 2>/dev/null)
        print_status "Active connections: $connections"
        
        # Check Kong database
        ((TOTAL_CHECKS++))
        if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='kong_db'" 2>/dev/null | grep -q 1; then
            print_success "Kong database exists: OK"
        else
            print_warning "Kong database not found"
        fi
        
        # Check LeForge schema
        ((TOTAL_CHECKS++))
        local table_count=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'LeForge'" 2>/dev/null)
        if [ "$table_count" -gt 0 ]; then
            print_success "LeForge schema tables: $table_count"
        else
            print_warning "LeForge schema has no tables"
        fi
    else
        print_error "PostgreSQL connection failed"
    fi
}

# Function to check Redis
check_redis() {
    print_header "Redis Health Check"
    ((TOTAL_CHECKS++))
    
    # Check connection with ping
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q "PONG"; then
        print_success "Redis connection: OK"
        
        # Get Redis info
        local redis_version=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" INFO server 2>/dev/null | grep "redis_version" | cut -d: -f2 | tr -d '\r')
        print_status "Version: $redis_version"
        
        # Get memory usage
        local used_memory=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" INFO memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r')
        print_status "Memory used: $used_memory"
        
        # Get connected clients
        local clients=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" INFO clients 2>/dev/null | grep "connected_clients" | cut -d: -f2 | tr -d '\r')
        print_status "Connected clients: $clients"
        
        # Get total keys
        local keys=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" DBSIZE 2>/dev/null | awk '{print $2}')
        print_status "Total keys: $keys"
    else
        print_error "Redis connection failed"
    fi
}

# Function to check Qdrant
check_qdrant() {
    print_header "Qdrant Health Check"
    ((TOTAL_CHECKS++))
    
    # Check health endpoint
    local health_response=$(curl -s -o /dev/null -w "%{http_code}" "http://$QDRANT_HOST:$QDRANT_HTTP_PORT/health" 2>/dev/null)
    
    if [ "$health_response" = "200" ]; then
        print_success "Qdrant health endpoint: OK"
        
        # Get cluster info
        local cluster_info=$(curl -s "http://$QDRANT_HOST:$QDRANT_HTTP_PORT/cluster" 2>/dev/null)
        if [ -n "$cluster_info" ]; then
            local peer_id=$(echo "$cluster_info" | grep -o '"peer_id":[0-9]*' | head -1 | cut -d: -f2)
            print_status "Peer ID: ${peer_id:-N/A}"
        fi
        
        # Get collections
        ((TOTAL_CHECKS++))
        local collections_response=$(curl -s "http://$QDRANT_HOST:$QDRANT_HTTP_PORT/collections" 2>/dev/null)
        if [ -n "$collections_response" ]; then
            local collections_count=$(echo "$collections_response" | grep -o '"collections":\[' | wc -l)
            print_success "Qdrant collections endpoint: OK"
        else
            print_warning "Could not fetch collections"
        fi
        
        # Check telemetry
        local telemetry=$(curl -s "http://$QDRANT_HOST:$QDRANT_HTTP_PORT/telemetry" 2>/dev/null)
        if [ -n "$telemetry" ]; then
            local version=$(echo "$telemetry" | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4)
            print_status "Version: ${version:-N/A}"
        fi
    else
        print_error "Qdrant health check failed (HTTP $health_response)"
    fi
}

# Function to check Kong
check_kong() {
    print_header "Kong Gateway Health Check"
    ((TOTAL_CHECKS++))
    
    # Check admin API
    local admin_response=$(curl -s -o /dev/null -w "%{http_code}" "http://$KONG_HOST:$KONG_ADMIN_PORT/" 2>/dev/null)
    
    if [ "$admin_response" = "200" ]; then
        print_success "Kong Admin API: OK"
        
        # Get Kong info
        local kong_info=$(curl -s "http://$KONG_HOST:$KONG_ADMIN_PORT/" 2>/dev/null)
        if [ -n "$kong_info" ]; then
            local version=$(echo "$kong_info" | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4)
            print_status "Version: ${version:-N/A}"
            
            local hostname=$(echo "$kong_info" | grep -o '"hostname":"[^"]*"' | head -1 | cut -d'"' -f4)
            print_status "Hostname: ${hostname:-N/A}"
        fi
        
        # Check services
        ((TOTAL_CHECKS++))
        local services_response=$(curl -s "http://$KONG_HOST:$KONG_ADMIN_PORT/services" 2>/dev/null)
        if [ -n "$services_response" ]; then
            local services_count=$(echo "$services_response" | grep -o '"total":[0-9]*' | head -1 | cut -d: -f2)
            print_success "Kong services configured: ${services_count:-0}"
        else
            print_warning "Could not fetch services"
        fi
        
        # Check routes
        ((TOTAL_CHECKS++))
        local routes_response=$(curl -s "http://$KONG_HOST:$KONG_ADMIN_PORT/routes" 2>/dev/null)
        if [ -n "$routes_response" ]; then
            local routes_count=$(echo "$routes_response" | grep -o '"total":[0-9]*' | head -1 | cut -d: -f2)
            print_success "Kong routes configured: ${routes_count:-0}"
        else
            print_warning "Could not fetch routes"
        fi
        
        # Check plugins
        ((TOTAL_CHECKS++))
        local plugins_response=$(curl -s "http://$KONG_HOST:$KONG_ADMIN_PORT/plugins" 2>/dev/null)
        if [ -n "$plugins_response" ]; then
            local plugins_count=$(echo "$plugins_response" | grep -o '"total":[0-9]*' | head -1 | cut -d: -f2)
            print_success "Kong plugins enabled: ${plugins_count:-0}"
        else
            print_warning "Could not fetch plugins"
        fi
        
        # Check proxy
        ((TOTAL_CHECKS++))
        local proxy_response=$(curl -s -o /dev/null -w "%{http_code}" "http://$KONG_HOST:$KONG_PROXY_PORT/" 2>/dev/null)
        if [ "$proxy_response" != "000" ]; then
            print_success "Kong Proxy responding: HTTP $proxy_response"
        else
            print_error "Kong Proxy not responding"
        fi
        
        # Check database connection
        ((TOTAL_CHECKS++))
        local status_response=$(curl -s "http://$KONG_HOST:$KONG_ADMIN_PORT/status" 2>/dev/null)
        if echo "$status_response" | grep -q '"database"'; then
            local db_reachable=$(echo "$status_response" | grep -o '"reachable":true' | head -1)
            if [ -n "$db_reachable" ]; then
                print_success "Kong database connection: OK"
            else
                print_error "Kong database connection: FAILED"
            fi
        fi
    else
        print_error "Kong Admin API failed (HTTP $admin_response)"
    fi
}

# Function to check Docker containers
check_containers() {
    print_header "Docker Containers Status"
    
    if command -v docker &> /dev/null; then
        local containers=("LeForge-postgres" "LeForge-redis" "LeForge-qdrant" "LeForge-kong")
        
        for container in "${containers[@]}"; do
            ((TOTAL_CHECKS++))
            local status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null)
            local health=$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null)
            
            if [ "$status" = "running" ]; then
                if [ "$health" = "healthy" ]; then
                    print_success "$container: running (healthy)"
                elif [ -n "$health" ]; then
                    print_warning "$container: running ($health)"
                else
                    print_success "$container: running"
                fi
            elif [ -n "$status" ]; then
                print_error "$container: $status"
            else
                print_error "$container: not found"
            fi
        done
    else
        print_warning "Docker not available - skipping container checks"
    fi
}

# Function to print summary
print_summary() {
    print_header "Health Check Summary"
    
    echo ""
    echo -e "  Total checks:   ${BLUE}$TOTAL_CHECKS${NC}"
    echo -e "  Passed:         ${GREEN}$PASSED_CHECKS${NC}"
    echo -e "  Warnings:       ${YELLOW}$WARNING_CHECKS${NC}"
    echo -e "  Failed:         ${RED}$FAILED_CHECKS${NC}"
    echo ""
    
    local pass_rate=0
    if [ $TOTAL_CHECKS -gt 0 ]; then
        pass_rate=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
    fi
    
    if [ $FAILED_CHECKS -eq 0 ]; then
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}  ✓ All infrastructure services are healthy! ($pass_rate% pass rate)${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        return 0
    else
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${RED}  ✗ Some services are unhealthy. Please check the errors above.${NC}"
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        return 1
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -a, --all         Run all health checks (default)"
    echo "  -p, --postgres    Check PostgreSQL only"
    echo "  -r, --redis       Check Redis only"
    echo "  -q, --qdrant      Check Qdrant only"
    echo "  -k, --kong        Check Kong only"
    echo "  -c, --containers  Check Docker containers only"
    echo "  -j, --json        Output results as JSON"
    echo "  -h, --help        Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB"
    echo "  REDIS_HOST, REDIS_PORT, REDIS_PASSWORD"
    echo "  QDRANT_HOST, QDRANT_HTTP_PORT"
    echo "  KONG_HOST, KONG_ADMIN_PORT, KONG_PROXY_PORT"
}

# Main execution
main() {
    local check_all=true
    local check_postgres=false
    local check_redis_flag=false
    local check_qdrant_flag=false
    local check_kong_flag=false
    local check_containers_flag=false
    local output_json=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -a|--all)
                check_all=true
                shift
                ;;
            -p|--postgres)
                check_all=false
                check_postgres=true
                shift
                ;;
            -r|--redis)
                check_all=false
                check_redis_flag=true
                shift
                ;;
            -q|--qdrant)
                check_all=false
                check_qdrant_flag=true
                shift
                ;;
            -k|--kong)
                check_all=false
                check_kong_flag=true
                shift
                ;;
            -c|--containers)
                check_all=false
                check_containers_flag=true
                shift
                ;;
            -j|--json)
                output_json=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║      LeForge Infrastructure Health Check              ║${NC}"
    echo -e "${CYAN}║      $(date '+%Y-%m-%d %H:%M:%S')                             ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    
    # Run checks
    if $check_all; then
        check_containers
        check_postgres
        check_redis
        check_qdrant
        check_kong
    else
        $check_containers_flag && check_containers
        $check_postgres && check_postgres
        $check_redis_flag && check_redis
        $check_qdrant_flag && check_qdrant
        $check_kong_flag && check_kong
    fi
    
    # Print summary
    print_summary
    exit_code=$?
    
    echo ""
    exit $exit_code
}

# Run main function
main "$@"
