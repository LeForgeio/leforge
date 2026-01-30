import { useState, useEffect } from 'react';
import { 
  Settings, 
  Shield, 
  Key, 
  Clock, 
  UserPlus, 
  Mail, 
  Globe,
  Save,
  Loader2,
  Info,
  AlertTriangle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { useToast } from '../hooks/use-toast';
import { 
  useAuthSettings, 
  useUpdateAuthSettings, 
  useOidcSettings,
  useUpdateOidcSettings,
  AuthSettings,
  OidcSettings
} from '../hooks/useAdmin';

export default function AdminSettings() {
  const { toast } = useToast();
  
  // Auth Settings
  const { data: authSettings, isLoading: authLoading } = useAuthSettings();
  const updateAuthSettings = useUpdateAuthSettings();
  const [localAuthSettings, setLocalAuthSettings] = useState<Partial<AuthSettings>>({});
  
  // OIDC Settings
  const { data: oidcSettings, isLoading: oidcLoading } = useOidcSettings();
  const updateOidcSettings = useUpdateOidcSettings();
  const [localOidcSettings, setLocalOidcSettings] = useState<Partial<OidcSettings & { clientSecret?: string }>>({});

  // Sync local state with fetched data
  useEffect(() => {
    if (authSettings) {
      setLocalAuthSettings(authSettings);
    }
  }, [authSettings]);

  useEffect(() => {
    if (oidcSettings) {
      setLocalOidcSettings(oidcSettings);
    }
  }, [oidcSettings]);

  const handleSaveAuthSettings = async () => {
    try {
      await updateAuthSettings.mutateAsync(localAuthSettings);
      toast({ title: 'Settings saved', description: 'Authentication settings have been updated.' });
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleSaveOidcSettings = async () => {
    try {
      await updateOidcSettings.mutateAsync(localOidcSettings);
      toast({ title: 'Settings saved', description: 'OIDC settings have been updated.' });
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const isLoading = authLoading || oidcLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6" />
          System Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure authentication and system-wide settings
        </p>
      </div>

      {/* Auth Mode Section */}
      <Card className="glass-effect">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Authentication Mode
          </CardTitle>
          <CardDescription>
            Configure how users authenticate with the system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Authentication Method</Label>
            <Select 
              value={localAuthSettings.mode || 'local'} 
              onValueChange={(value) => setLocalAuthSettings({ ...localAuthSettings, mode: value })}
            >
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Local Authentication Only
                  </div>
                </SelectItem>
                <SelectItem value="oidc">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    OIDC/SSO Only
                  </div>
                </SelectItem>
                <SelectItem value="both">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Both Local and OIDC
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose how users can authenticate to the system
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sessionDuration" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Session Duration
            </Label>
            <Input
              id="sessionDuration"
              value={localAuthSettings.sessionDuration || '24h'}
              onChange={(e) => setLocalAuthSettings({ ...localAuthSettings, sessionDuration: e.target.value })}
              placeholder="24h"
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              How long user sessions remain valid (e.g., 1h, 24h, 7d)
            </p>
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Allow Self-Registration
              </Label>
              <p className="text-xs text-muted-foreground">
                Allow new users to create their own accounts
              </p>
            </div>
            <Switch
              checked={localAuthSettings.allowRegistration || false}
              onCheckedChange={(checked) => setLocalAuthSettings({ ...localAuthSettings, allowRegistration: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Require Email Verification
              </Label>
              <p className="text-xs text-muted-foreground">
                New users must verify their email before accessing the system
              </p>
            </div>
            <Switch
              checked={localAuthSettings.requireEmailVerification || false}
              onCheckedChange={(checked) => setLocalAuthSettings({ ...localAuthSettings, requireEmailVerification: checked })}
            />
          </div>

          <Button onClick={handleSaveAuthSettings} disabled={updateAuthSettings.isPending}>
            {updateAuthSettings.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Save className="w-4 h-4 mr-2" />
            Save Authentication Settings
          </Button>
        </CardContent>
      </Card>

      {/* OIDC Settings Section */}
      <Card className="glass-effect">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-500" />
            OIDC / SSO Configuration
          </CardTitle>
          <CardDescription>
            Configure single sign-on with your identity provider
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="w-4 h-4" />
            <AlertTitle>SSO Integration</AlertTitle>
            <AlertDescription>
              Connect LeForge to your organization's identity provider (Azure AD, Okta, Auth0, etc.) for single sign-on.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
              <Label>Enable OIDC Authentication</Label>
              <p className="text-xs text-muted-foreground">
                Allow users to sign in with your identity provider
              </p>
            </div>
            <Switch
              checked={localOidcSettings.enabled || false}
              onCheckedChange={(checked) => setLocalOidcSettings({ ...localOidcSettings, enabled: checked })}
            />
          </div>

          {localOidcSettings.enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="issuer">Issuer URL</Label>
                <Input
                  id="issuer"
                  value={localOidcSettings.issuer || ''}
                  onChange={(e) => setLocalOidcSettings({ ...localOidcSettings, issuer: e.target.value })}
                  placeholder="https://login.microsoftonline.com/tenant-id/v2.0"
                />
                <p className="text-xs text-muted-foreground">
                  The OIDC issuer URL from your identity provider
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientId">Client ID</Label>
                <Input
                  id="clientId"
                  value={localOidcSettings.clientId || ''}
                  onChange={(e) => setLocalOidcSettings({ ...localOidcSettings, clientId: e.target.value })}
                  placeholder="your-client-id"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientSecret">Client Secret</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  value={localOidcSettings.clientSecret || ''}
                  onChange={(e) => setLocalOidcSettings({ ...localOidcSettings, clientSecret: e.target.value })}
                  placeholder="••••••••"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to keep the existing secret
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scopes">Scopes</Label>
                <Input
                  id="scopes"
                  value={(localOidcSettings.scopes || []).join(' ')}
                  onChange={(e) => setLocalOidcSettings({ 
                    ...localOidcSettings, 
                    scopes: e.target.value.split(' ').filter(Boolean)
                  })}
                  placeholder="openid profile email"
                />
                <p className="text-xs text-muted-foreground">
                  Space-separated list of OIDC scopes to request
                </p>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label>Auto-create Users</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically create user accounts on first OIDC login
                  </p>
                </div>
                <Switch
                  checked={localOidcSettings.autoCreateUsers ?? true}
                  onCheckedChange={(checked) => setLocalOidcSettings({ ...localOidcSettings, autoCreateUsers: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label>Default Role for New OIDC Users</Label>
                <Select 
                  value={localOidcSettings.defaultRole || 'user'} 
                  onValueChange={(value) => setLocalOidcSettings({ ...localOidcSettings, defaultRole: value })}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="developer">Developer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {!localOidcSettings.enabled && localAuthSettings.mode === 'oidc' && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertTitle>Configuration Warning</AlertTitle>
              <AlertDescription>
                Auth mode is set to "OIDC Only" but OIDC is not enabled. Users will not be able to log in.
              </AlertDescription>
            </Alert>
          )}

          <Button onClick={handleSaveOidcSettings} disabled={updateOidcSettings.isPending}>
            {updateOidcSettings.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Save className="w-4 h-4 mr-2" />
            Save OIDC Settings
          </Button>
        </CardContent>
      </Card>

      {/* Environment Variables Info */}
      <Card className="glass-effect border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Info className="w-5 h-5" />
            Environment Variables
          </CardTitle>
          <CardDescription>
            These settings can also be configured via environment variables
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted/50 p-4 font-mono text-sm space-y-1">
            <p><span className="text-primary">LEFORGE_ADMIN_USER</span>=admin</p>
            <p><span className="text-primary">LEFORGE_ADMIN_PASSWORD</span>=*****</p>
            <p><span className="text-primary">LEFORGE_JWT_SECRET</span>=*****</p>
            <p><span className="text-primary">LEFORGE_AUTH_MODE</span>=local|oidc|both</p>
            <p><span className="text-primary">LEFORGE_OIDC_ISSUER</span>=https://...</p>
            <p><span className="text-primary">LEFORGE_OIDC_CLIENT_ID</span>=...</p>
            <p><span className="text-primary">LEFORGE_OIDC_CLIENT_SECRET</span>=...</p>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Environment variables take precedence over database settings for initial admin user.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
