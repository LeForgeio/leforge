# LeForge .NET SDK

## Installation

```bash
dotnet add package LeForge.SDK
```

## Usage

```csharp
using LeForge;

var client = new LeForgeClient(
    baseUrl: "http://localhost:8000",
    apiKey: "your-api-key"
);

// Crypto operations
var hash = await client.Crypto.HashAsync("hello", "sha256");

// Math operations
var result = await client.Math.CalculateAsync("2 + 2");
```
