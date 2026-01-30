# LeForge SDKs

Client libraries for interacting with LeForge services.

## Available SDKs

| SDK | Language | Package |
|-----|----------|--------|
| [JavaScript/TypeScript](./javascript) | Node.js, Browser | `@leforge/sdk` |
| [Python](./python) | Python 3.9+ | `leforge-sdk` |
| [.NET](./dotnet) | C#, .NET 6+ | `LeForge.SDK` |

## Quick Start

### JavaScript

```bash
npm install @leforge/sdk
```

```typescript
import { LeForgeClient } from '@leforge/sdk';

const client = new LeForgeClient({
  baseUrl: 'http://localhost:4000',
  apiKey: 'your-api-key',
});

// Invoke any ForgeHook
const result = await client.invoke('formula-engine', 'evaluate', {
  formula: 'SUM(1,2,3)'
});
```

### Python

```bash
pip install leforge-sdk
```

```python
from leforge import LeForgeClient

client = LeForgeClient(
    base_url="http://localhost:4000",
    api_key="your-api-key"
)

# Invoke any ForgeHook
result = client.invoke('formula-engine', 'evaluate', formula='SUM(1,2,3)')
```

### .NET

```bash
dotnet add package LeForge.SDK
```

```csharp
using LeForge;

var client = new LeForgeClient(
    baseUrl: "http://localhost:4000",
    apiKey: "your-api-key"
);

// Invoke any ForgeHook
var result = await client.InvokeAsync("formula-engine", "evaluate", new {
    formula = "SUM(1,2,3)"
});
```

## Documentation

- [API Reference](../docs/api-reference.md)
- [Getting Started](../docs/getting-started.md)
