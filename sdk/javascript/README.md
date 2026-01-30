# LeForge JavaScript SDK

Official JavaScript/TypeScript SDK for LeForge.

## Installation

```bash
npm install @leforge/sdk
```

## Quick Start

```typescript
import { LeForgeClient } from '@leforge/sdk';

const client = new LeForgeClient({
  baseUrl: 'http://localhost:4000',
  apiKey: 'your-api-key',
});

// Invoke any ForgeHook plugin
const result = await client.invoke('formula-engine', 'evaluate', {
  formula: 'SUM(1,2,3,4,5)'
});
console.log(result); // { result: 15 }
```

## API Reference

### `LeForgeClient`

#### Constructor

```typescript
const client = new LeForgeClient({
  baseUrl: string;    // LeForge server URL (default: http://localhost:4000)
  apiKey?: string;    // Optional API key for authentication
  timeout?: number;   // Request timeout in ms (default: 30000)
});
```

#### Methods

```typescript
// Invoke a ForgeHook endpoint
await client.invoke(pluginId: string, endpoint: string, data?: object);

// List installed plugins
await client.plugins.list();

// Get plugin details
await client.plugins.get(pluginId: string);

// Health check
await client.health();
```

## Examples

### Formula Engine

```typescript
const result = await client.invoke('formula-engine', 'evaluate', {
  formula: 'VLOOKUP("apple", A1:B3, 2, FALSE)',
  context: {
    A1: 'apple', B1: 1,
    A2: 'banana', B2: 2,
    A3: 'cherry', B3: 3
  }
});
```

### Crypto Service

```typescript
// Hash data
const hash = await client.invoke('crypto-service', 'hash', {
  data: 'Hello, World!',
  algorithm: 'sha256'
});

// Encrypt data
const encrypted = await client.invoke('crypto-service', 'encrypt', {
  data: 'secret message',
  key: 'your-encryption-key'
});
```

## License

MIT
