-- Users table for local authentication
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),  -- NULL for OIDC-only users
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'developer', 'user')),
  auth_provider VARCHAR(20) NOT NULL DEFAULT 'local' CHECK (auth_provider IN ('local', 'oidc')),
  oidc_subject VARCHAR(255),   -- Subject claim from OIDC provider
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_users_oidc ON users(oidc_subject) WHERE oidc_subject IS NOT NULL;

-- System settings table for storing auth configuration
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Seed default settings
INSERT INTO system_settings (key, value, description) VALUES
  ('auth.mode', '"local"', 'Authentication mode: local, oidc, or both'),
  ('auth.session_duration', '"24h"', 'JWT token expiration duration'),
  ('auth.allow_registration', 'false', 'Allow users to self-register'),
  ('auth.require_email_verification', 'false', 'Require email verification for new users'),
  ('oidc.enabled', 'false', 'Enable OIDC/SSO authentication'),
  ('oidc.issuer', '""', 'OIDC provider issuer URL'),
  ('oidc.client_id', '""', 'OIDC client ID'),
  ('oidc.scopes', '["openid", "profile", "email"]', 'OIDC scopes to request'),
  ('oidc.auto_create_users', 'true', 'Auto-create users on first OIDC login'),
  ('oidc.default_role', '"user"', 'Default role for OIDC-created users')
ON CONFLICT (key) DO NOTHING;

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_settings_updated_at ON system_settings;
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
