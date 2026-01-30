import jwt, { JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { userService, UserRole, ROLE_PERMISSIONS } from './user.service.js';

// =============================================================================
// Types
// =============================================================================

export type { UserRole };
export { ROLE_PERMISSIONS };

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  role: UserRole;
  authProvider: 'local' | 'oidc';
}

export interface TokenPayload {
  sub: string; // User ID
  username: string;
  role: string;
  authProvider: string;
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

export interface OIDCConfig {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  clientId: string;
  scopes: string[];
}

// =============================================================================
// Auth Service
// =============================================================================

class AuthService {
  private jwtSecret: string;

  constructor() {
    this.jwtSecret = config.auth.jwtSecret;
  }

  /**
   * Check if authentication is enabled
   */
  isAuthEnabled(): boolean {
    return config.auth.adminPassword !== '';
  }

  /**
   * Get auth configuration for frontend
   */
  getAuthConfig(): {
    enabled: boolean;
    mode: string;
    oidcEnabled: boolean;
    oidcConfig?: OIDCConfig;
  } {
    return {
      enabled: this.isAuthEnabled(),
      mode: config.auth.authMode,
      oidcEnabled: !!config.auth.oidc && (config.auth.authMode === 'oidc' || config.auth.authMode === 'both'),
      oidcConfig: config.auth.oidc ? {
        issuer: config.auth.oidc.issuer,
        authorizationEndpoint: `${config.auth.oidc.issuer}/authorize`,
        tokenEndpoint: `${config.auth.oidc.issuer}/token`,
        userinfoEndpoint: `${config.auth.oidc.issuer}/userinfo`,
        clientId: config.auth.oidc.clientId,
        scopes: config.auth.oidc.scopes,
      } : undefined,
    };
  }

  /**
   * Authenticate with username and password (local auth)
   */
  async authenticateLocal(username: string, password: string): Promise<AuthResult> {
    if (!this.isAuthEnabled()) {
      return { success: false, error: 'Authentication is not enabled' };
    }

    // First try database users
    const dbUser = await userService.getInternalUserByUsername(username);
    if (dbUser && dbUser.password_hash && dbUser.is_active) {
      const passwordMatch = await bcrypt.compare(password, dbUser.password_hash);
      if (passwordMatch) {
        // Update last login
        await userService.updateLastLogin(dbUser.id);
        
        const user: User = {
          id: dbUser.id,
          username: dbUser.username,
          displayName: dbUser.display_name,
          email: dbUser.email || undefined,
          role: dbUser.role,
          authProvider: 'local',
        };
        
        const token = this.generateToken(user);
        logger.info({ username }, 'User logged in successfully (database)');
        return { success: true, user, token };
      }
    }

    // Fall back to config-based admin user
    if (username === config.auth.adminUser) {
      const passwordMatch = config.auth.adminPassword.startsWith('$2')
        ? await bcrypt.compare(password, config.auth.adminPassword)
        : password === config.auth.adminPassword;

      if (passwordMatch) {
        const user: User = {
          id: 'admin',
          username: config.auth.adminUser,
          displayName: 'Administrator',
          role: 'admin',
          authProvider: 'local',
        };
        const token = this.generateToken(user);
        logger.info({ username }, 'User logged in successfully (config)');
        return { success: true, user, token };
      }
    }

    logger.warn({ username }, 'Login failed: invalid credentials');
    return { success: false, error: 'Invalid credentials' };
  }

  /**
   * Generate JWT token for user
   */
  generateToken(user: User): string {
    const payload: TokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      authProvider: user.authProvider,
    };

    const options: jwt.SignOptions = {
      expiresIn: config.auth.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    };

    return jwt.sign(payload, this.jwtSecret, options);
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload & TokenPayload;
      return {
        sub: decoded.sub,
        username: decoded.username,
        role: decoded.role,
        authProvider: decoded.authProvider,
        iat: decoded.iat,
        exp: decoded.exp,
      };
    } catch (error) {
      logger.debug({ error }, 'Token verification failed');
      return null;
    }
  }

  /**
   * Refresh token (generate new token from existing valid token)
   */
  refreshToken(token: string): string | null {
    const payload = this.verifyToken(token);
    if (!payload) {
      return null;
    }

    // Create user from token payload
    const user: User = {
      id: payload.sub,
      username: payload.username,
      displayName: payload.username,
      role: payload.role as UserRole,
      authProvider: payload.authProvider as 'local' | 'oidc',
    };

    return this.generateToken(user);
  }

  /**
   * Get user from token
   */
  getUserFromToken(token: string): User | null {
    const payload = this.verifyToken(token);
    if (!payload) {
      return null;
    }

    return {
      id: payload.sub,
      username: payload.username,
      displayName: payload.username,
      role: payload.role as UserRole,
      authProvider: payload.authProvider as 'local' | 'oidc',
    };
  }

  /**
   * Check if a path is public (no auth required)
   */
  isPublicPath(path: string): boolean {
    // Static assets are always public
    if (path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      return true;
    }

    // Check against configured public paths
    return config.auth.publicPaths.some(publicPath => {
      if (publicPath.endsWith('*')) {
        return path.startsWith(publicPath.slice(0, -1));
      }
      return path === publicPath || path.startsWith(publicPath + '/');
    });
  }

  /**
   * Hash a password (useful for generating hashed passwords)
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  // ===========================================================================
  // OIDC Methods (for future SSO support)
  // ===========================================================================

  /**
   * Get OIDC authorization URL
   */
  getOIDCAuthorizationUrl(state: string, nonce: string): string | null {
    if (!config.auth.oidc) {
      return null;
    }

    const params = new URLSearchParams({
      client_id: config.auth.oidc.clientId,
      redirect_uri: config.auth.oidc.redirectUri,
      response_type: 'code',
      scope: config.auth.oidc.scopes.join(' '),
      state,
      nonce,
    });

    return `${config.auth.oidc.issuer}/authorize?${params.toString()}`;
  }

  /**
   * Exchange OIDC code for tokens (placeholder - implement with actual OIDC library)
   */
  async exchangeOIDCCode(_code: string): Promise<AuthResult> {
    // This is a placeholder for OIDC token exchange
    // In a real implementation, you would:
    // 1. Exchange the code for tokens at the token endpoint
    // 2. Validate the ID token
    // 3. Extract user info
    // 4. Create or update local user record
    // 5. Generate a local JWT

    return {
      success: false,
      error: 'OIDC not fully implemented yet',
    };
  }
}

// Export singleton instance
export const authService = new AuthService();
