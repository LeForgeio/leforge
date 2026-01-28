# LeForge Python SDK

## Installation

```bash
pip install LeForge-sdk
```

## Usage

```python
from LeForge import LeForgeClient

client = LeForgeClient(
    base_url="http://localhost:8000",
    api_key="your-api-key"
)

# Crypto operations
hash_result = client.crypto.hash(data="hello", algorithm="sha256")

# Math operations
result = client.math.calculate(expression="2 + 2")
```
