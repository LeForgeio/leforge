-- LeForge PostgreSQL Initialization
-- This script runs when the database container starts

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schema for LeForge data
CREATE SCHEMA IF NOT EXISTS LeForge;

-- API Keys table
CREATE TABLE IF NOT EXISTS LeForge.api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    permissions JSONB DEFAULT '[]'::jsonb,
    rate_limit INTEGER DEFAULT 1000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Usage logs table
CREATE TABLE IF NOT EXISTS LeForge.usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID REFERENCES LeForge.api_keys(id),
    service VARCHAR(50) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_id VARCHAR(255),
    status_code INTEGER,
    response_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for usage queries
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON LeForge.usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_api_key ON LeForge.usage_logs(api_key_id);

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA LeForge TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA LeForge TO postgres;
