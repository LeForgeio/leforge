-- ============================================================================
-- FlowForge Plugin Manager - Registry Sources
-- Migration: 002_create_registry_sources
-- Description: Store marketplace registry sources (like Portainer app templates)
-- ============================================================================

-- ============================================================================
-- Registry Sources Table
-- Stores configured marketplace sources
-- ============================================================================
CREATE TABLE IF NOT EXISTS registry_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Source identification
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Source URL (GitHub raw URL to index.json or API endpoint)
  url VARCHAR(2048) NOT NULL,
  
  -- Source type: 'github' | 'url' | 'local'
  source_type VARCHAR(50) NOT NULL DEFAULT 'github',
  
  -- GitHub-specific fields
  github_owner VARCHAR(255),
  github_repo VARCHAR(255),
  github_branch VARCHAR(255) DEFAULT 'main',
  github_path VARCHAR(255) DEFAULT 'registry.json',
  
  -- Status
  enabled BOOLEAN DEFAULT true,
  is_official BOOLEAN DEFAULT false,
  
  -- Cached data
  cached_index JSONB,
  last_fetched TIMESTAMP,
  fetch_error TEXT,
  
  -- Priority (lower = higher priority for duplicates)
  priority INTEGER DEFAULT 100,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_source_url UNIQUE (url)
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_registry_sources_enabled ON registry_sources(enabled);
CREATE INDEX IF NOT EXISTS idx_registry_sources_priority ON registry_sources(priority);
CREATE INDEX IF NOT EXISTS idx_registry_sources_source_type ON registry_sources(source_type);

-- ============================================================================
-- Trigger: Update updated_at timestamp
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_registry_sources_updated_at ON registry_sources;

CREATE TRIGGER trigger_registry_sources_updated_at
  BEFORE UPDATE ON registry_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Package Imports Table
-- Track imported .fhk packages for offline installs
-- ============================================================================
CREATE TABLE IF NOT EXISTS package_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Package info
  filename VARCHAR(255) NOT NULL,
  forgehook_id VARCHAR(255) NOT NULL,
  version VARCHAR(50),
  
  -- Package metadata
  file_size BIGINT,
  checksum_sha256 VARCHAR(64),
  
  -- Import status
  status VARCHAR(50) DEFAULT 'imported',
  plugin_id UUID REFERENCES plugins(id) ON DELETE SET NULL,
  
  -- Timestamps
  imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
  installed_at TIMESTAMP
);

-- Indexes for package imports
CREATE INDEX IF NOT EXISTS idx_package_imports_forgehook_id ON package_imports(forgehook_id);
CREATE INDEX IF NOT EXISTS idx_package_imports_status ON package_imports(status);

-- ============================================================================
-- Insert Default Official Source
-- ============================================================================
INSERT INTO registry_sources (
  name,
  description,
  url,
  source_type,
  github_owner,
  github_repo,
  github_branch,
  github_path,
  is_official,
  priority
) VALUES (
  'FlowForge Official',
  'Official FlowForge plugin registry maintained by the FlowForge team',
  'https://raw.githubusercontent.com/danstoll/forgehooks-registry/master/forgehooks-registry.json',
  'github',
  'danstoll',
  'forgehooks-registry',
  'master',
  'forgehooks-registry.json',
  true,
  0
) ON CONFLICT (url) DO NOTHING;

-- ============================================================================
-- Migration Complete
-- ============================================================================
