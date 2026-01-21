import { useState } from 'react';
import { Book, Code2, Rocket, History, ExternalLink, Loader2 } from 'lucide-react';
import { useChangelog, changeTypeColors } from '@/hooks/useChangelog';

// Use current hostname for API calls (unified app)
const API_HOST = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CodeBlock } from '@/components/CodeBlock';
import { services } from '@/lib/api';
import { cn } from '@/lib/utils';

const gettingStartedSteps = [
  {
    title: 'Install dependencies',
    description: 'Use npm, yarn, or pnpm to install the FlowForge SDK',
    code: `npm install @flowforge/sdk
# or
yarn add @flowforge/sdk
# or
pnpm add @flowforge/sdk`,
    language: 'bash' as const,
  },
  {
    title: 'Configure your API key',
    description: 'Set your API key in environment variables or directly in code',
    code: `// Option 1: Environment variable
// .env
FLOWFORGE_API_KEY=your-api-key-here

// Option 2: Direct configuration
import { FlowForge } from '@flowforge/sdk';

const client = new FlowForge({
  apiKey: 'your-api-key-here',
  baseUrl: 'http://${API_HOST}:8000', // your FlowForge server
});`,
    language: 'javascript' as const,
  },
  {
    title: 'Make your first API call',
    description: 'Start using FlowForge services',
    code: `import { FlowForge } from '@flowforge/sdk';

const client = new FlowForge();

// Hash some data
const hash = await client.crypto.hash({
  data: 'Hello, World!',
  algorithm: 'sha256',
});
console.log(hash.data.hash);

// Perform calculations
const result = await client.math.calculate({
  expression: '2 + 2 * 3',
});
console.log(result.data.result); // 8`,
    language: 'javascript' as const,
  },
];

const integrationExamples = [
  {
    title: 'React / Next.js',
    description: 'Use FlowForge in React applications with hooks',
    code: `import { useState } from 'react';
import { FlowForge } from '@flowforge/sdk';

const client = new FlowForge();

export function HashGenerator() {
  const [result, setResult] = useState('');

  const handleHash = async (data: string) => {
    const response = await client.crypto.hash({
      data,
      algorithm: 'sha256',
    });
    setResult(response.data.hash);
  };

  return (
    <div>
      <input onChange={(e) => handleHash(e.target.value)} />
      <p>Hash: {result}</p>
    </div>
  );
}`,
    language: 'javascript' as const,
  },
  {
    title: 'Node.js / Express',
    description: 'Server-side integration with Express',
    code: `import express from 'express';
import { FlowForge } from '@flowforge/sdk';

const app = express();
const client = new FlowForge();

app.post('/api/hash', async (req, res) => {
  try {
    const result = await client.crypto.hash({
      data: req.body.data,
      algorithm: req.body.algorithm || 'sha256',
    });
    res.json(result.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);`,
    language: 'javascript' as const,
  },
  {
    title: 'Python',
    description: 'Use FlowForge with Python requests',
    code: `import requests

FLOWFORGE_URL = 'http://localhost:8000'
API_KEY = 'your-api-key'

def hash_data(data: str, algorithm: str = 'sha256'):
    response = requests.post(
        f'{FLOWFORGE_URL}/api/v1/crypto/hash',
        headers={
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
        },
        json={
            'data': data,
            'algorithm': algorithm,
        }
    )
    return response.json()

result = hash_data('Hello, World!')
print(result['data']['hash'])`,
    language: 'python' as const,
  },
  {
    title: 'cURL',
    description: 'Direct API calls with cURL',
    code: `# Hash data
curl -X POST http://localhost:8000/api/v1/crypto/hash \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: your-api-key" \\
  -d '{"data": "Hello, World!", "algorithm": "sha256"}'

# Calculate expression
curl -X POST http://localhost:8000/api/v1/math/calculate \\
  -H "Content-Type: application/json" \\
  -d '{"expression": "2 + 2 * 3"}'

# Generate PDF
curl -X POST http://localhost:8000/api/v1/pdf/generate \\
  -H "Content-Type: application/json" \\
  -d '{"html": "<h1>Hello PDF</h1>"}' \\
  --output output.pdf`,
    language: 'bash' as const,
  },
];

export default function Documentation() {
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const { data: changelogData, isLoading: changelogLoading } = useChangelog();

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Documentation</h1>
        <p className="text-muted-foreground mt-1">Learn how to use FlowForge services</p>
      </div>

      <Tabs defaultValue="getting-started" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="getting-started" className="gap-2">
            <Rocket className="w-4 h-4" />
            Getting Started
          </TabsTrigger>
          <TabsTrigger value="api-reference" className="gap-2">
            <Book className="w-4 h-4" />
            API Reference
          </TabsTrigger>
          <TabsTrigger value="examples" className="gap-2">
            <Code2 className="w-4 h-4" />
            Examples
          </TabsTrigger>
          <TabsTrigger value="changelog" className="gap-2">
            <History className="w-4 h-4" />
            Changelog
          </TabsTrigger>
        </TabsList>

        {/* Getting Started */}
        <TabsContent value="getting-started" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Start Guide</CardTitle>
              <CardDescription>
                Get up and running with FlowForge in minutes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {gettingStartedSteps.map((step, index) => (
                <div key={index} className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="font-semibold">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                    <CodeBlock code={step.code} language={step.language} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Authentication</CardTitle>
              <CardDescription>How to authenticate with FlowForge API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                FlowForge uses API keys for authentication. Include your API key in the{' '}
                <code className="px-1 py-0.5 bg-muted rounded">X-API-Key</code> header with every request.
              </p>
              <CodeBlock
                code={`curl -X POST http://localhost:8000/api/v1/crypto/hash \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{"data": "hello", "algorithm": "sha256"}'`}
                language="bash"
                title="Example authenticated request"
              />
              <div className="flex items-center gap-2 p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                <span className="text-yellow-600 dark:text-yellow-400 text-sm">
                  ⚠️ Never expose your API key in client-side code. Use environment variables or a backend proxy.
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Reference */}
        <TabsContent value="api-reference" className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <Card className="col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Services</CardTitle>
              </CardHeader>
              <ScrollArea className="h-150">
                <CardContent className="p-2">
                  {services.map((service) => (
                    <button
                      key={service.id}
                      onClick={() => setSelectedService(service.id)}
                      className={cn(
                        'w-full text-left p-3 rounded-lg transition-colors',
                        selectedService === service.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      )}
                    >
                      <div className="font-medium text-sm">{service.name}</div>
                      <div className={cn(
                        'text-xs mt-1',
                        selectedService === service.id
                          ? 'text-primary-foreground/80'
                          : 'text-muted-foreground'
                      )}>
                        {service.endpoints.length} endpoints
                      </div>
                    </button>
                  ))}
                </CardContent>
              </ScrollArea>
            </Card>

            <Card className="col-span-3">
              <ScrollArea className="h-150">
                {selectedService ? (
                  (() => {
                    const service = services.find((s) => s.id === selectedService);
                    if (!service) return null;
                    return (
                      <>
                        <CardHeader>
                          <CardTitle>{service.name}</CardTitle>
                          <CardDescription>{service.description}</CardDescription>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline">{service.language}</Badge>
                            <Badge variant="secondary">Port {service.port}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {service.endpoints.map((endpoint, idx) => (
                            <div key={idx} className="p-4 border rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className={cn(
                                  endpoint.method === 'GET' && 'bg-green-500',
                                  endpoint.method === 'POST' && 'bg-blue-500',
                                  endpoint.method === 'PUT' && 'bg-yellow-500',
                                  endpoint.method === 'DELETE' && 'bg-red-500'
                                )}>
                                  {endpoint.method}
                                </Badge>
                                <code className="text-sm font-mono">{service.path}{endpoint.path}</code>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{endpoint.description}</p>
                              {endpoint.body && (
                                <CodeBlock
                                  code={JSON.stringify(endpoint.body, null, 2)}
                                  language="json"
                                  title="Example Request Body"
                                  maxHeight="150px"
                                />
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </>
                    );
                  })()
                ) : (
                  <CardContent className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">Select a service to view its API reference</p>
                  </CardContent>
                )}
              </ScrollArea>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                OpenAPI Specification
                <Button variant="outline" size="sm" asChild>
                  <a href="/api/docs" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    View Swagger UI
                  </a>
                </Button>
              </CardTitle>
              <CardDescription>
                Each service exposes an OpenAPI specification for detailed documentation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2">
                {services.map((service) => (
                  <Button key={service.id} variant="outline" size="sm" className="justify-start" asChild>
                    <a href={`http://${API_HOST}:${service.port}/docs`} target="_blank" rel="noopener noreferrer">
                      {service.name}
                    </a>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Examples */}
        <TabsContent value="examples" className="space-y-6">
          <div className="grid gap-6">
            {integrationExamples.map((example, idx) => (
              <Card key={idx}>
                <CardHeader>
                  <CardTitle className="text-lg">{example.title}</CardTitle>
                  <CardDescription>{example.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <CodeBlock
                    code={example.code}
                    language={example.language}
                    maxHeight="400px"
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Changelog */}
        <TabsContent value="changelog" className="space-y-6">
          {changelogLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading changelog...</span>
              </CardContent>
            </Card>
          ) : changelogData?.changelog.map((release) => (
            <Card key={release.version}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">v{release.version}</CardTitle>
                  <Badge variant="outline">{release.date}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {release.changes.map((change, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Badge className={cn('text-xs', changeTypeColors[change.type])}>
                        {change.type}
                      </Badge>
                      <span className="text-sm">{change.description}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
