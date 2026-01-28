# LeForge JavaScript SDK

## Installation

```bash
npm install @LeForge/sdk
```

## Usage

```typescript
import { LeForgeClient } from '@LeForge/sdk';

const client = new LeForgeClient({
  baseUrl: 'http://localhost:8000',
  apiKey: 'your-api-key',
});

// Crypto operations
const hash = await client.crypto.hash({ data: 'hello', algorithm: 'sha256' });

// Math operations
const result = await client.math.calculate({ expression: '2 + 2' });
```
