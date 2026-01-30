import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useAuthConfig } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Loader2, LogIn, Shield, ExternalLink } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { login, isLoggingIn, loginError, isAuthenticated, authEnabled } = useAuth();
  const { data: authConfig } = useAuthConfig();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // If already authenticated, redirect
  if (isAuthenticated) {
    navigate('/', { replace: true });
    return null;
  }
  
  // If auth is disabled, redirect
  if (authEnabled === false) {
    navigate('/', { replace: true });
    return null;
  }
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }
    
    try {
      const result = await login({ username, password });
      if (result.success) {
        navigate('/', { replace: true });
      } else {
        setError(result.error || 'Login failed');
      }
    } catch {
      setError('An error occurred during login');
    }
  };
  
  const handleOIDCLogin = () => {
    // Redirect to OIDC login endpoint
    window.location.href = '/api/v1/auth/oidc/login';
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Welcome to LeForge</CardTitle>
          <CardDescription>
            Sign in to access the dashboard
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {(error || loginError) && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error || loginError}</AlertDescription>
            </Alert>
          )}
          
          {/* Local Login Form */}
          {(!authConfig?.oidcEnabled || authConfig.mode === 'local' || authConfig.mode === 'both') && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                  disabled={isLoggingIn}
                  autoFocus
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  disabled={isLoggingIn}
                />
              </div>
              
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoggingIn}
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign In
                  </>
                )}
              </Button>
            </form>
          )}
          
          {/* Divider for both modes */}
          {authConfig?.mode === 'both' && (
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>
          )}
          
          {/* OIDC Login Button */}
          {authConfig?.oidcEnabled && (authConfig.mode === 'oidc' || authConfig.mode === 'both') && (
            <Button 
              type="button" 
              variant="outline" 
              className="w-full"
              onClick={handleOIDCLogin}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Sign in with SSO
            </Button>
          )}
          
          {/* Help text */}
          <p className="text-xs text-muted-foreground text-center mt-6">
            Contact your administrator if you need access credentials.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
