-- Enhanced API Keys - adds scopes, expiration, IP allowlist, rate limits
-- Migration 009

-- Add new columns to api_keys table
ALTER TABLE api_keys 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scopes JSONB DEFAULT '["*"]',
ADD COLUMN IF NOT EXISTS allowed_ips TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS rate_limit_per_day INTEGER DEFAULT 10000,
ADD COLUMN IF NOT EXISTS created_by UUID,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add comments for documentation
COMMENT ON COLUMN api_keys.expires_at IS 'Optional expiration timestamp. NULL means never expires.';
COMMENT ON COLUMN api_keys.scopes IS 'JSON array of scopes: ["*"] for all, ["plugins:read", "plugins:execute:llm-service"]';
COMMENT ON COLUMN api_keys.allowed_ips IS 'Array of allowed IP addresses/CIDR ranges. Empty means all IPs allowed.';
COMMENT ON COLUMN api_keys.rate_limit_per_minute IS 'Max requests per minute. Default 60.';
COMMENT ON COLUMN api_keys.rate_limit_per_day IS 'Max requests per day. Default 10000.';
COMMENT ON COLUMN api_keys.created_by IS 'User ID who created this key.';
COMMENT ON COLUMN api_keys.metadata IS 'Additional metadata (labels, environment, etc.)';

-- Create index for expiration queries
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

-- Add response_time_ms to usage tracking
ALTER TABLE api_key_usage
ADD COLUMN IF NOT EXISTS response_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS request_body_size INTEGER,
ADD COLUMN IF NOT EXISTS response_body_size INTEGER,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Rate limiting tracking table
CREATE TABLE IF NOT EXISTS api_key_rate_limits (
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_type VARCHAR(10) NOT NULL, -- 'minute' or 'day'
  request_count INTEGER DEFAULT 1,
  PRIMARY KEY (api_key_id, window_start, window_type)
);

-- Index for rate limit lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup 
ON api_key_rate_limits(api_key_id, window_type, window_start);

-- Cleanup old rate limit records (run periodically)
-- Records older than 2 days can be deleted
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup 
ON api_key_rate_limits(window_start);

-- Available scopes reference table
CREATE TABLE IF NOT EXISTS api_key_scopes (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL, -- 'plugins', 'admin', 'integrations'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default scopes
INSERT INTO api_key_scopes (id, name, description, category) VALUES
  ('*', 'Full Access', 'Complete access to all API endpoints', 'admin'),
  ('plugins:read', 'Read Plugins', 'View plugin information and documentation', 'plugins'),
  ('plugins:execute', 'Execute Plugins', 'Call any plugin endpoint', 'plugins'),
  ('plugins:manage', 'Manage Plugins', 'Install, update, and remove plugins', 'plugins'),
  ('integrations:read', 'Read Integrations', 'View integration configurations', 'integrations'),
  ('integrations:manage', 'Manage Integrations', 'Enable/disable and configure integrations', 'integrations'),
  ('api-keys:read', 'Read API Keys', 'View API key metadata (not the keys themselves)', 'admin'),
  ('api-keys:manage', 'Manage API Keys', 'Create, update, and revoke API keys', 'admin'),
  ('users:read', 'Read Users', 'View user information', 'admin'),
  ('users:manage', 'Manage Users', 'Create, update, and delete users', 'admin'),
  ('settings:read', 'Read Settings', 'View system settings', 'admin'),
  ('settings:manage', 'Manage Settings', 'Modify system settings', 'admin'),
  ('analytics:read', 'Read Analytics', 'View usage analytics and metrics', 'admin')
ON CONFLICT (id) DO NOTHING;

-- Function to check if a key has a specific scope
CREATE OR REPLACE FUNCTION api_key_has_scope(key_scopes JSONB, required_scope VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  scope TEXT;
BEGIN
  -- Check for wildcard
  IF key_scopes ? '*' THEN
    RETURN TRUE;
  END IF;
  
  -- Check for exact match
  IF key_scopes ? required_scope THEN
    RETURN TRUE;
  END IF;
  
  -- Check for category wildcard (e.g., 'plugins:*' matches 'plugins:execute')
  FOR scope IN SELECT jsonb_array_elements_text(key_scopes)
  LOOP
    IF scope LIKE '%:*' THEN
      IF required_scope LIKE (REPLACE(scope, ':*', '') || ':%') THEN
        RETURN TRUE;
      END IF;
    END IF;
  END LOOP;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to increment rate limit counter (atomic)
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_api_key_id UUID,
  p_window_type VARCHAR(10)
) RETURNS INTEGER AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  -- Calculate window start based on type
  IF p_window_type = 'minute' THEN
    v_window_start := date_trunc('minute', NOW());
  ELSE
    v_window_start := date_trunc('day', NOW());
  END IF;
  
  -- Upsert and return new count
  INSERT INTO api_key_rate_limits (api_key_id, window_start, window_type, request_count)
  VALUES (p_api_key_id, v_window_start, p_window_type, 1)
  ON CONFLICT (api_key_id, window_start, window_type)
  DO UPDATE SET request_count = api_key_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- View for API key analytics summary
CREATE OR REPLACE VIEW api_key_analytics AS
SELECT 
  k.id AS api_key_id,
  k.name AS api_key_name,
  k.key_prefix,
  k.is_active,
  k.created_at,
  k.last_used_at,
  k.expires_at,
  CASE 
    WHEN k.expires_at IS NOT NULL AND k.expires_at < NOW() THEN 'expired'
    WHEN k.revoked_at IS NOT NULL THEN 'revoked'
    WHEN k.is_active = false THEN 'inactive'
    ELSE 'active'
  END AS status,
  COUNT(u.id) AS total_requests,
  COUNT(u.id) FILTER (WHERE u.created_at > NOW() - INTERVAL '24 hours') AS requests_24h,
  COUNT(u.id) FILTER (WHERE u.created_at > NOW() - INTERVAL '7 days') AS requests_7d,
  COUNT(u.id) FILTER (WHERE u.status_code >= 400) AS error_count,
  ROUND(AVG(u.response_time_ms)::numeric, 2) AS avg_response_time_ms,
  MAX(u.created_at) AS last_request_at
FROM api_keys k
LEFT JOIN api_key_usage u ON k.id = u.api_key_id
GROUP BY k.id, k.name, k.key_prefix, k.is_active, k.created_at, k.last_used_at, k.expires_at, k.revoked_at;

-- Cleanup function for old rate limit records
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits() RETURNS void AS $$
BEGIN
  DELETE FROM api_key_rate_limits 
  WHERE window_start < NOW() - INTERVAL '2 days';
END;
$$ LANGUAGE plpgsql;
