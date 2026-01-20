-- ============================================================================
-- FlowForge Plugin Manager - Database Schema
-- Migration: 001_create_plugins_table
-- Description: Create tables for plugin persistence
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Plugins Table
-- Stores installed ForgeHook plugin instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  forgehook_id VARCHAR(255) NOT NULL,

  -- Manifest (stored as JSON)
  manifest JSONB NOT NULL,

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'stopped',

  -- Container information
  container_id VARCHAR(255),
  container_name VARCHAR(255) NOT NULL UNIQUE,
  host_port INTEGER NOT NULL,

  -- Configuration
  config JSONB DEFAULT '{}',
  environment JSONB DEFAULT '{}',

  -- Health
  health_status VARCHAR(50),
  last_health_check TIMESTAMP,
  error TEXT,

  -- Timestamps
  installed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_forgehook_per_instance UNIQUE (forgehook_id)
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_plugins_forgehook_id ON plugins(forgehook_id);
CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
CREATE INDEX IF NOT EXISTS idx_plugins_container_id ON plugins(container_id);
CREATE INDEX IF NOT EXISTS idx_plugins_host_port ON plugins(host_port);
CREATE INDEX IF NOT EXISTS idx_plugins_installed_at ON plugins(installed_at DESC);

-- Index for searching by manifest fields
CREATE INDEX IF NOT EXISTS idx_plugins_manifest_name ON plugins((manifest->>'name'));
CREATE INDEX IF NOT EXISTS idx_plugins_manifest_version ON plugins((manifest->>'version'));
CREATE INDEX IF NOT EXISTS idx_plugins_manifest_category ON plugins((manifest->>'category'));

-- ============================================================================
-- Plugin Events Table
-- Stores audit log of plugin lifecycle events
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugin_events (
  id BIGSERIAL PRIMARY KEY,
  plugin_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  data JSONB,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_plugin_events_plugin FOREIGN KEY (plugin_id)
    REFERENCES plugins(id) ON DELETE CASCADE
);

-- Indexes for events
CREATE INDEX IF NOT EXISTS idx_plugin_events_plugin_id ON plugin_events(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_events_type ON plugin_events(event_type);
CREATE INDEX IF NOT EXISTS idx_plugin_events_timestamp ON plugin_events(timestamp DESC);

-- ============================================================================
-- Plugin Metrics Table
-- Stores plugin usage metrics (optional, for analytics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plugin_metrics (
  id BIGSERIAL PRIMARY KEY,
  plugin_id UUID NOT NULL,

  -- Metrics
  request_count BIGINT DEFAULT 0,
  error_count BIGINT DEFAULT 0,
  total_response_time_ms BIGINT DEFAULT 0,
  avg_response_time_ms DECIMAL(10, 2),

  -- Resource usage
  cpu_usage_percent DECIMAL(5, 2),
  memory_usage_mb DECIMAL(10, 2),

  -- Timestamps
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_plugin_metrics_plugin FOREIGN KEY (plugin_id)
    REFERENCES plugins(id) ON DELETE CASCADE
);

-- Indexes for metrics
CREATE INDEX IF NOT EXISTS idx_plugin_metrics_plugin_id ON plugin_metrics(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_metrics_recorded_at ON plugin_metrics(recorded_at DESC);

-- ============================================================================
-- Trigger: Update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (for idempotent migrations)
DROP TRIGGER IF EXISTS trigger_plugins_updated_at ON plugins;

CREATE TRIGGER trigger_plugins_updated_at
  BEFORE UPDATE ON plugins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get plugin by forgehook_id
DROP FUNCTION IF EXISTS get_plugin_by_forgehook_id(VARCHAR);

CREATE OR REPLACE FUNCTION get_plugin_by_forgehook_id(p_forgehook_id VARCHAR)
RETURNS TABLE (
  id UUID,
  forgehook_id VARCHAR,
  manifest JSONB,
  status VARCHAR,
  container_id VARCHAR,
  container_name VARCHAR,
  host_port INTEGER,
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
    p.container_id,
    p.container_name,
    p.host_port,
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
-- Initial Data / Seeding (Optional)
-- ============================================================================
-- Add any default plugins here if needed

-- ============================================================================
-- Permissions (Optional - adjust based on your security model)
-- ============================================================================
-- GRANT SELECT, INSERT, UPDATE, DELETE ON plugins TO flowforge_app;
-- GRANT SELECT, INSERT ON plugin_events TO flowforge_app;
-- GRANT SELECT, INSERT ON plugin_metrics TO flowforge_app;

-- ============================================================================
-- Migration Complete
-- ============================================================================