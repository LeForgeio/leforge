# LeForge .NET SDK

Official .NET SDK for LeForge.

## Installation

```bash
dotnet add package LeForge.SDK
```

## Requirements

- .NET 6.0 or later
- `System.Net.Http.Json`

## Quick Start

```csharp
using LeForge;

var client = new LeForgeClient(
    baseUrl: "http://localhost:4000",
    apiKey: "your-api-key"
);

// Invoke any ForgeHook plugin
var result = await client.InvokeAsync("formula-engine", "evaluate", new {
    formula = "SUM(1,2,3,4,5)"
});
Console.WriteLine(result.Result); // 15
```

## API Reference

### `LeForgeClient`

#### Constructor

```csharp
var client = new LeForgeClient(
    baseUrl: string = "http://localhost:4000",
    apiKey: string? = null,
    timeout: TimeSpan? = null  // default: 30 seconds
);
```

#### Methods

```csharp
// Invoke a ForgeHook endpoint
await client.InvokeAsync<T>(pluginId, endpoint, data);

// List installed plugins
await client.Plugins.ListAsync();

// Get plugin details
await client.Plugins.GetAsync(pluginId);

// Health check
await client.HealthAsync();
```

## Examples

### Formula Engine

```csharp
var result = await client.InvokeAsync<FormulaResult>("formula-engine", "evaluate", new {
    formula = "AVERAGE(10, 20, 30, 40, 50)"
});
// result.Result = 30
```

### Crypto Service

```csharp
// Hash data
var hash = await client.InvokeAsync<HashResult>("crypto-service", "hash", new {
    data = "Hello, World!",
    algorithm = "sha256"
});

// Encrypt data
var encrypted = await client.InvokeAsync<EncryptResult>("crypto-service", "encrypt", new {
    data = "secret message",
    key = "your-encryption-key"
});
```

### Dependency Injection

```csharp
// In Startup.cs or Program.cs
services.AddLeForge(options => {
    options.BaseUrl = "http://localhost:4000";
    options.ApiKey = Configuration["LeForge:ApiKey"];
});

// In your service
public class MyService {
    private readonly ILeForgeClient _leforge;
    
    public MyService(ILeForgeClient leforge) {
        _leforge = leforge;
    }
}
```

## License

MIT
