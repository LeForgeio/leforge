-- Migration: Add service account support
-- This migration adds support for service accounts that can own agents and integrations

-- Add is_service_account column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_service_account BOOLEAN DEFAULT false;

-- Create index for service accounts
CREATE INDEX IF NOT EXISTS idx_users_service_account ON users (is_service_account) WHERE is_service_account = true;

-- Create the system user (for anonymous/unauthenticated operations)
INSERT INTO users (id, username, display_name, role, auth_provider, is_active, is_service_account)
VALUES ('00000000-0000-0000-0000-000000000001', 'system', 'System', 'admin', 'local', true, true)
ON CONFLICT (id) DO UPDATE SET is_service_account = true;
