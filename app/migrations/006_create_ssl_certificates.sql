-- SSL Certificate management table
CREATE TABLE IF NOT EXISTS ssl_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT false,
  is_self_signed BOOLEAN DEFAULT false,
  
  -- Certificate data (stored encrypted in production)
  certificate TEXT NOT NULL,          -- PEM-encoded certificate
  private_key TEXT NOT NULL,          -- PEM-encoded private key (encrypted)
  ca_bundle TEXT,                     -- Optional CA bundle for chain
  
  -- Certificate metadata (extracted from cert)
  common_name VARCHAR(255),           -- CN from certificate
  issuer VARCHAR(255),                -- Certificate issuer
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  fingerprint VARCHAR(64),            -- SHA-256 fingerprint
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  
  -- Only one certificate can be active at a time
  CONSTRAINT unique_active_cert EXCLUDE (is_active WITH =) WHERE (is_active = true)
);

-- SSL settings table
CREATE TABLE IF NOT EXISTS ssl_settings (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  https_enabled BOOLEAN DEFAULT false,
  https_port INTEGER DEFAULT 3443,
  force_https BOOLEAN DEFAULT false,       -- Redirect HTTP to HTTPS
  hsts_enabled BOOLEAN DEFAULT false,      -- HTTP Strict Transport Security
  hsts_max_age INTEGER DEFAULT 31536000,   -- 1 year in seconds
  min_tls_version VARCHAR(10) DEFAULT '1.2',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default SSL settings
INSERT INTO ssl_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- Index for active certificate lookup
CREATE INDEX IF NOT EXISTS idx_ssl_certs_active ON ssl_certificates(is_active) WHERE is_active = true;

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_ssl_certificates_updated_at ON ssl_certificates;
CREATE TRIGGER update_ssl_certificates_updated_at
  BEFORE UPDATE ON ssl_certificates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ssl_settings_updated_at ON ssl_settings;  
CREATE TRIGGER update_ssl_settings_updated_at
  BEFORE UPDATE ON ssl_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
