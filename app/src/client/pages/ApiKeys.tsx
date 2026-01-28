import { useState } from 'react';
import { Key, Copy, Check, Trash2, Eye, EyeOff, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAuthStore } from '../store';
import { cn } from '../lib/utils';

export default function ApiKeys() {
  const { apiKey, setApiKey, clearApiKey, isAuthenticated } = useAuthStore();
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSetKey = () => {
    if (newKey.trim()) {
      setApiKey(newKey.trim());
      setNewKey('');
    }
  };

  const copyKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const maskedKey = apiKey ? `${apiKey.slice(0, 8)}${'•'.repeat(Math.max(0, apiKey.length - 12))}${apiKey.slice(-4)}` : '';

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">API Keys</h1>
        <p className="text-muted-foreground mt-1">Manage your LeForge API authentication</p>
      </div>

      {/* Status Card */}
      <Card className={cn('mb-6', isAuthenticated ? 'border-green-500/50' : 'border-yellow-500/50')}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <div className="p-3 rounded-full bg-green-500/10">
                  <ShieldCheck className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-green-600 dark:text-green-400">Authenticated</h3>
                  <p className="text-sm text-muted-foreground">Your API key is configured and ready to use</p>
                </div>
              </>
            ) : (
              <>
                <div className="p-3 rounded-full bg-yellow-500/10">
                  <AlertTriangle className="w-6 h-6 text-yellow-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-yellow-600 dark:text-yellow-400">Not Authenticated</h3>
                  <p className="text-sm text-muted-foreground">Add an API key to make authenticated requests</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Current Key Card */}
      {isAuthenticated && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="w-5 h-5" />
              Current API Key
            </CardTitle>
            <CardDescription>Your stored API key for authenticated requests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm">
                {showKey ? apiKey : maskedKey}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={copyKey}>
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={clearApiKey} className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Update Key Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{isAuthenticated ? 'Update API Key' : 'Add API Key'}</CardTitle>
          <CardDescription>
            {isAuthenticated 
              ? 'Replace your current API key with a new one'
              : 'Enter your LeForge API key to authenticate requests'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Enter your API key"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleSetKey()}
            />
            <Button onClick={handleSetKey} disabled={!newKey.trim()}>
              {isAuthenticated ? 'Update' : 'Save'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Your API key is stored locally in your browser and never sent to third parties.
          </p>
        </CardContent>
      </Card>

      {/* Usage Info */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">1</div>
            <p>Your API key is automatically added to the <code className="px-1 py-0.5 bg-muted rounded">X-API-Key</code> header for all requests.</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">2</div>
            <p>The key is stored securely in your browser's local storage and persists across sessions.</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">3</div>
            <p>Use the API Playground to test endpoints with your authenticated key.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
