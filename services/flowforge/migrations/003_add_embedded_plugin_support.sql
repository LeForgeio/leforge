-- ============================================================================
-- FlowForge Plugin Manager - Database Schema
-- Migration: 003_add_embedded_plugin_support
-- Description: Add support for embedded (non-Docker) plugins
-- ============================================================================

-- ============================================================================
-- Add runtime_type column to plugins table
-- Values: 'container' (default, Docker-based) or 'embedded' (in-process JS)
-- ============================================================================
ALTER TABLE plugins
ADD COLUMN IF NOT EXISTS runtime_type VARCHAR(20) NOT NULL DEFAULT 'container';

-- Make container_name nullable (not required for embedded plugins)
ALTER TABLE plugins
ALTER COLUMN container_name DROP NOT NULL;

-- Make host_port nullable (not required for embedded plugins)
ALTER TABLE plugins
ALTER COLUMN host_port DROP NOT NULL;

-- Add module_code column for embedded plugins (stores bundled JS)
ALTER TABLE plugins
ADD COLUMN IF NOT EXISTS module_code TEXT;

-- Add module_exports column (list of exported function names)
ALTER TABLE plugins
ADD COLUMN IF NOT EXISTS module_exports TEXT[];

-- Add module_loaded flag
ALTER TABLE plugins
ADD COLUMN IF NOT EXISTS module_loaded BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- Indexes for embedded plugins
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_plugins_runtime_type ON plugins(runtime_type);
CREATE INDEX IF NOT EXISTS idx_plugins_manifest_runtime ON plugins((manifest->>'runtime'));

-- ============================================================================
-- Update helper function to include new columns
-- ============================================================================
CREATE OR REPLACE FUNCTION get_plugin_by_forgehook_id(p_forgehook_id VARCHAR)
RETURNS TABLE (
  id UUID,
  forgehook_id VARCHAR,
  manifest JSONB,
  status VARCHAR,
  runtime_type VARCHAR,
  container_id VARCHAR,
  container_name VARCHAR,
  host_port INTEGER,
  module_code TEXT,
  module_exports TEXT[],
  module_loaded BOOLEAN,
  config JSONB,
  environment JSONB,
  health_status VARCHAR,
  last_health_check TIMESTAMP,
  error TEXT,
  installed_at TIMESTAMP,
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  updated_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.forgehook_id,
    p.manifest,
    p.status,
    p.runtime_type,
    p.container_id,
    p.container_name,
    p.host_port,
    p.module_code,
    p.module_exports,
    p.module_loaded,
    p.config,
    p.environment,
    p.health_status,
    p.last_health_check,
    p.error,
    p.installed_at,
    p.started_at,
    p.stopped_at,
    p.updated_at
  FROM plugins p
  WHERE p.forgehook_id = p_forgehook_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Embedded Plugin Invocation Metrics
-- Track invocation counts and performance for embedded plugins
-- ============================================================================
CREATE TABLE IF NOT EXISTS embedded_plugin_invocations (
  id BIGSERIAL PRIMARY KEY,
  plugin_id UUID NOT NULL,
  function_name VARCHAR(255) NOT NULL,
  
  -- Execution details
  success BOOLEAN NOT NULL,
  execution_time_ms INTEGER NOT NULL,
  error_message TEXT,
  
  -- Timestamps
  invoked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_embedded_invocations_plugin FOREIGN KEY (plugin_id)
    REFERENCES plugins(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_embedded_invocations_plugin_id 
  ON embedded_plugin_invocations(plugin_id);
CREATE INDEX IF NOT EXISTS idx_embedded_invocations_function 
  ON embedded_plugin_invocations(plugin_id, function_name);
CREATE INDEX IF NOT EXISTS idx_embedded_invocations_time 
  ON embedded_plugin_invocations(invoked_at DESC);

-- ============================================================================
-- Add check constraint for runtime consistency
-- ============================================================================
-- Note: This constraint ensures data integrity
-- Container plugins MUST have host_port
-- Embedded plugins MUST have module_code

-- We use a trigger instead of CHECK constraint for complex logic
CREATE OR REPLACE FUNCTION validate_plugin_runtime()
RETURNS TRIGGER AS $$
BEGIN
  -- Container plugins need container info
  IF NEW.runtime_type = 'container' THEN
    IF NEW.host_port IS NULL THEN
      RAISE EXCEPTION 'Container plugins require host_port';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_plugin_runtime ON plugins;

CREATE TRIGGER trigger_validate_plugin_runtime
  BEFORE INSERT OR UPDATE ON plugins
  FOR EACH ROW
  EXECUTE FUNCTION validate_plugin_runtime();

-- ============================================================================
-- Migration Complete
-- ============================================================================
