# Changelog

All notable changes to FlowForge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **QR Code & Barcode Generation**: Built-in core utilities for generating QR codes and barcodes
  - Pure TypeScript implementation (no external dependencies)
  - Output formats: SVG, Base64 PNG, raw matrix
  - QR Code: ISO 18004 compliant with automatic version/error correction
  - Barcodes: Code128, EAN-13, UPC-A support
  - REST API endpoints at `/api/v1/utils/qr/*` and `/api/v1/utils/barcode/*`

### Changed

- **UI Rebrand**: Stainless.com-inspired design refresh
  - Dark theme now default with proper hydration
  - New gradient hero section on Dashboard
  - Glassmorphism stats cards with indigo/violet accents
  - Gradient sidebar navigation with updated FlowForge logo
  - Updated color system with subtle gradients and noise texture

### Removed

- `qrcode-utils` plugin from forgehooks-registry (now built into core)

### Fixed

- QR code generation array bounds error in finder pattern placement

## [1.2.0] - 2026-01-20

### Added

- Plugin update system with version tracking and rollback support
- Migration 004: version tracking columns and `plugin_update_history` table
- Update dialog with online update and file upload options
- Plugin update history dialog with rollback functionality
- API endpoints: `POST /update`, `POST /update/upload`, `POST /rollback`, `GET /updates`

### Changed

- Dashboard now uses installed plugins instead of hardcoded service list
- Dashboard health polling only runs for plugins that are actually running
- Changelog UI now fetches from `/api/v1/changelog` (single source of truth)
- Archived obsolete `web-ui/` and `services/plugin-manager/` directories
- Updated `docker-compose.yml` to use unified FlowForge app

### Removed

- Duplicate client-side changelog data file
- Legacy `web-ui` Docker service (replaced by unified app)
- `services/plugin-manager/` standalone service (merged into `app/`)

### Fixed

- Dashboard no longer polls health endpoints for stopped plugins (ERR_CONNECTION_REFUSED errors)

## [1.1.0] - 2026-01-19

### Added

- Local development workflow with remote Docker backend support
- `.env.development.local` configuration for proxying to Docker services
- New ESLint flat config (`eslint.config.js`) for ESLint v9

### Changed

- **React** upgraded from 18.2.0 to 19.2.3
- **React DOM** upgraded from 18.2.0 to 19.2.3
- **react-router-dom** upgraded from 6.21.1 to 7.12.0
- **Vite** upgraded from 5.0.11 to 7.3.1
- **Vitest** upgraded from 1.2.0 to 4.0.17
- **Tailwind CSS** upgraded from 3.4.1 to 4.1.18
- **ESLint** upgraded from 8.56.0 to 9.39.2
- **@testing-library/react** upgraded from 14.x to 16.x
- Tailwind CSS configuration migrated to CSS-first format (`@import "tailwindcss"` and `@theme {}`)
- Vite config updated to use `@tailwindcss/vite` plugin

### Removed

- `postcss.config.js` (no longer needed with Tailwind v4 Vite plugin)
- `tailwind.config.js` (migrated to CSS-first config in `index.css`)
- Old ESLint packages (`@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`)

### Fixed

- Component-during-render issue in Layout.tsx (changed `NavContent` component to `navContent` JSX variable)
- Empty interface linting errors in `input.tsx` and `textarea.tsx` (converted to type aliases)
- React error #31 in Marketplace.tsx (sources array was being rendered directly instead of `.length`)

## [1.0.0] - 2026-01-19

### Features

- Initial FlowForge platform release
- ForgeHook plugin system with marketplace
- Docker-based plugin management
- Plugin packaging (.fhk format) with manifest validation
- Registry sources for plugin discovery
- GitHub and HTTP registry support
- API playground for testing endpoints
- Dashboard with service health monitoring
- Dark/light theme support
- API key management

### Services

- **crypto-service**: Encryption, hashing, JWT operations
- **data-transform-service**: JSON/XML/CSV transformations
- **image-service**: Image processing and manipulation
- **llm-service**: LLM inference with vLLM backend
- **math-service**: Mathematical computations
- **ocr-service**: OCR text extraction
- **pdf-service**: PDF generation and manipulation
- **vector-service**: Vector embeddings and search

### Infrastructure

- PostgreSQL database with migrations
- Redis caching layer
- Kong API Gateway integration
- Prometheus/Grafana monitoring
- Docker Compose orchestration
