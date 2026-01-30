# LeForge Python SDK

Official Python SDK for LeForge.

## Installation

```bash
pip install leforge-sdk
```

## Requirements

- Python 3.9+
- `httpx` for HTTP requests

## Quick Start

```python
from leforge import LeForgeClient

client = LeForgeClient(
    base_url="http://localhost:4000",
    api_key="your-api-key"
)

# Invoke any ForgeHook plugin
result = client.invoke('formula-engine', 'evaluate', formula='SUM(1,2,3,4,5)')
print(result)  # {'result': 15}
```

## API Reference

### `LeForgeClient`

#### Constructor

```python
client = LeForgeClient(
    base_url: str = "http://localhost:4000",
    api_key: str = None,
    timeout: float = 30.0
)
```

#### Methods

```python
# Invoke a ForgeHook endpoint
client.invoke(plugin_id: str, endpoint: str, **kwargs)

# List installed plugins
client.plugins.list()

# Get plugin details
client.plugins.get(plugin_id: str)

# Health check
client.health()
```

## Examples

### Formula Engine

```python
result = client.invoke('formula-engine', 'evaluate',
    formula='AVERAGE(10, 20, 30, 40, 50)'
)
# {'result': 30}
```

### Crypto Service

```python
# Hash data
hash_result = client.invoke('crypto-service', 'hash',
    data='Hello, World!',
    algorithm='sha256'
)

# Encrypt data
encrypted = client.invoke('crypto-service', 'encrypt',
    data='secret message',
    key='your-encryption-key'
)
```

### Async Support

```python
import asyncio
from leforge import AsyncLeForgeClient

async def main():
    async with AsyncLeForgeClient(base_url="http://localhost:4000") as client:
        result = await client.invoke('formula-engine', 'evaluate',
            formula='PI() * 2'
        )
        print(result)

asyncio.run(main())
```

## License

MIT
