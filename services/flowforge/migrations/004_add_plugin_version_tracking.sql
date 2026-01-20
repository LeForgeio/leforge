-- ============================================================================
-- FlowForge Plugin Manager - Database Schema
-- Migration: 004_add_plugin_version_tracking
-- Description: Add version tracking for plugin updates
-- ============================================================================

-- ============================================================================
-- Add version tracking columns
-- ============================================================================

-- Installed version (extracted from manifest at install time)
ALTER TABLE plugins
ADD COLUMN IF NOT EXISTS installed_version VARCHAR(50);

-- Previous version (for rollback support)
ALTER TABLE plugins
ADD COLUMN IF NOT EXISTS previous_version VARCHAR(50);

-- Previous module code (for embedded rollback)
ALTER TABLE plugins
ADD COLUMN IF NOT EXISTS previous_module_code TEXT;

-- Previous image tag (for container rollback)
ALTER TABLE plugins
ADD COLUMN IF NOT EXISTS previous_image_tag VARCHAR(255);

-- Bundle URL (where to fetch embedded plugin updates)
ALTER TABLE plugins
ADD COLUMN IF NOT EXISTS bundle_url TEXT;

-- Update timestamps
ALTER TABLE plugins
ADD COLUMN IF NOT EXISTS last_update_check TIMESTAMP;

ALTER TABLE plugins
ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP;

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_plugins_installed_version ON plugins(installed_version);
CREATE INDEX IF NOT EXISTS idx_plugins_last_update_check ON plugins(last_update_check);

-- ============================================================================
-- Plugin Update History Table
-- Track all updates for audit purposes
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugin_update_history (
  id BIGSERIAL PRIMARY KEY,
  plugin_id UUID NOT NULL,
  
  -- Version info
  from_version VARCHAR(50),
  to_version VARCHAR(50) NOT NULL,
  
  -- Update details
  update_type VARCHAR(20) NOT NULL, -- 'online', 'upload', 'rollback'
  success BOOLEAN NOT NULL,
  error_message TEXT,
  
  -- Timestamps
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  
  CONSTRAINT fk_plugin_update_history_plugin FOREIGN KEY (plugin_id)
    REFERENCES plugins(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plugin_update_history_plugin_id 
  ON plugin_update_history(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_update_history_started_at 
  ON plugin_update_history(started_at DESC);

-- ============================================================================
-- Update helper function to include new columns
-- ============================================================================
DROP FUNCTION IF EXISTS get_plugin_by_forgehook_id(VARCHAR);

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
  installed_version VARCHAR,
  previous_version VARCHAR,
  bundle_url TEXT,
  config JSONB,
  environment JSONB,
  health_status VARCHAR,
  last_health_check TIMESTAMP,
  error TEXT,
  installed_at TIMESTAMP,
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  updated_at TIMESTAMP,
  last_updated_at TIMESTAMP
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
    p.installed_version,
    p.previous_version,
    p.bundle_url,
    p.config,
    p.environment,
    p.health_status,
    p.last_health_check,
    p.error,
    p.installed_at,
    p.started_at,
    p.stopped_at,
    p.updated_at,
    p.last_updated_at
  FROM plugins p
  WHERE p.forgehook_id = p_forgehook_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Backfill installed_version from manifest for existing plugins
-- ============================================================================
UPDATE plugins 
SET installed_version = manifest->>'version'
WHERE installed_version IS NULL AND manifest->>'version' IS NOT NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
