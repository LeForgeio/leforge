import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { userService, UserRole, CreateUserInput, UpdateUserInput, ROLE_PERMISSIONS } from '../services/user.service.js';
import { settingsService } from '../services/settings.service.js';
import { logger } from '../utils/logger.js';
import { authService } from '../services/auth.service.js';

// =============================================================================
// Types
// =============================================================================

interface CreateUserBody {
  username: string;
  displayName: string;
  email?: string;
  password: string;
  role?: UserRole;
}

interface UpdateUserBody {
  displayName?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
  password?: string;
}

interface UserParams {
  userId: string;
}

interface AuthSettingsBody {
  mode?: string;
  sessionDuration?: string;
  allowRegistration?: boolean;
  requireEmailVerification?: boolean;
}

interface OidcSettingsBody {
  enabled?: boolean;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  autoCreateUsers?: boolean;
  defaultRole?: string;
}

// =============================================================================
// Admin Routes
// =============================================================================

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const prefix = '/api/v1/admin';

  // All admin routes require admin role
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }
    if (request.user.role !== 'admin') {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
    }
  });

  // ==========================================================================
  // User Management
  // ==========================================================================

  /**
   * GET /api/v1/admin/users
   * Get all users
   */
  app.get(`${prefix}/users`, async (_request: FastifyRequest, reply: FastifyReply) => {
    const users = await userService.getUsers();
    const stats = await userService.getUserCountByRole();
    return reply.send({ users, stats });
  });

  /**
   * GET /api/v1/admin/users/:userId
   * Get a specific user
   */
  app.get<{ Params: UserParams }>(
    `${prefix}/users/:userId`,
    async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
      const { userId } = request.params;
      const user = await userService.getUserById(userId);
      
      if (!user) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }
      
      return reply.send(user);
    }
  );

  /**
   * POST /api/v1/admin/users
   * Create a new user
   */
  app.post<{ Body: CreateUserBody }>(
    `${prefix}/users`,
    async (request: FastifyRequest<{ Body: CreateUserBody }>, reply: FastifyReply) => {
      const { username, displayName, email, password, role } = request.body;

      // Validate required fields
      if (!username || !displayName || !password) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Username, display name, and password are required' },
        });
      }

      // Check if username already exists
      const existing = await userService.getUserByUsername(username);
      if (existing) {
        return reply.status(409).send({
          error: { code: 'CONFLICT', message: 'Username already exists' },
        });
      }

      // Check if email already exists
      if (email) {
        const existingEmail = await userService.getUserByEmail(email);
        if (existingEmail) {
          return reply.status(409).send({
            error: { code: 'CONFLICT', message: 'Email already exists' },
          });
        }
      }

      const input: CreateUserInput = {
        username,
        displayName,
        email,
        password,
        role: role || 'user',
        authProvider: 'local',
      };

      const user = await userService.createUser(input);
      logger.info({ adminUser: request.user?.username, newUser: username }, 'Admin created user');
      
      return reply.status(201).send(user);
    }
  );

  /**
   * PATCH /api/v1/admin/users/:userId
   * Update a user
   */
  app.patch<{ Params: UserParams; Body: UpdateUserBody }>(
    `${prefix}/users/:userId`,
    async (request: FastifyRequest<{ Params: UserParams; Body: UpdateUserBody }>, reply: FastifyReply) => {
      const { userId } = request.params;
      const updates = request.body;

      // Check if user exists
      const existing = await userService.getUserById(userId);
      if (!existing) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      // Prevent demoting the last admin
      if (updates.role && updates.role !== 'admin' && existing.role === 'admin') {
        const stats = await userService.getUserCountByRole();
        if (stats.admin <= 1) {
          return reply.status(400).send({
            error: { code: 'BAD_REQUEST', message: 'Cannot demote the last admin user' },
          });
        }
      }

      // Check email uniqueness if changing
      if (updates.email && updates.email !== existing.email) {
        const existingEmail = await userService.getUserByEmail(updates.email);
        if (existingEmail) {
          return reply.status(409).send({
            error: { code: 'CONFLICT', message: 'Email already exists' },
          });
        }
      }

      const user = await userService.updateUser(userId, updates as UpdateUserInput);
      logger.info({ adminUser: request.user?.username, targetUser: userId }, 'Admin updated user');
      
      return reply.send(user);
    }
  );

  /**
   * DELETE /api/v1/admin/users/:userId
   * Delete a user
   */
  app.delete<{ Params: UserParams }>(
    `${prefix}/users/:userId`,
    async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
      const { userId } = request.params;

      // Check if user exists
      const existing = await userService.getUserById(userId);
      if (!existing) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      // Prevent deleting the last admin
      if (existing.role === 'admin') {
        const stats = await userService.getUserCountByRole();
        if (stats.admin <= 1) {
          return reply.status(400).send({
            error: { code: 'BAD_REQUEST', message: 'Cannot delete the last admin user' },
          });
        }
      }

      // Prevent self-deletion
      if (existing.id === request.user?.id) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Cannot delete your own account' },
        });
      }

      await userService.deleteUser(userId);
      logger.info({ adminUser: request.user?.username, deletedUser: userId }, 'Admin deleted user');
      
      return reply.status(204).send();
    }
  );

  // ==========================================================================
  // Auth Settings
  // ==========================================================================

  /**
   * GET /api/v1/admin/settings/auth
   * Get authentication settings
   */
  app.get(`${prefix}/settings/auth`, async (_request: FastifyRequest, reply: FastifyReply) => {
    const authSettings = await settingsService.getAuthSettings();
    return reply.send(authSettings);
  });

  /**
   * PATCH /api/v1/admin/settings/auth
   * Update authentication settings
   */
  app.patch<{ Body: AuthSettingsBody }>(
    `${prefix}/settings/auth`,
    async (request: FastifyRequest<{ Body: AuthSettingsBody }>, reply: FastifyReply) => {
      const settings = request.body;
      
      // Validate auth mode
      if (settings.mode && !['local', 'oidc', 'both'].includes(settings.mode)) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Invalid auth mode. Must be local, oidc, or both' },
        });
      }

      await settingsService.updateAuthSettings(settings, request.user?.id);
      logger.info({ adminUser: request.user?.username }, 'Admin updated auth settings');
      
      const updated = await settingsService.getAuthSettings();
      return reply.send(updated);
    }
  );

  /**
   * GET /api/v1/admin/settings/oidc
   * Get OIDC settings
   */
  app.get(`${prefix}/settings/oidc`, async (_request: FastifyRequest, reply: FastifyReply) => {
    const oidcSettings = await settingsService.getOidcSettings();
    return reply.send(oidcSettings);
  });

  /**
   * PATCH /api/v1/admin/settings/oidc
   * Update OIDC settings
   */
  app.patch<{ Body: OidcSettingsBody }>(
    `${prefix}/settings/oidc`,
    async (request: FastifyRequest<{ Body: OidcSettingsBody }>, reply: FastifyReply) => {
      const settings = request.body;

      await settingsService.updateOidcSettings(settings, request.user?.id);
      logger.info({ adminUser: request.user?.username }, 'Admin updated OIDC settings');
      
      const updated = await settingsService.getOidcSettings();
      return reply.send(updated);
    }
  );

  // ==========================================================================
  // Role Permissions
  // ==========================================================================

  /**
   * GET /api/v1/admin/roles
   * Get all role permissions
   */
  app.get(`${prefix}/roles`, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      roles: ['admin', 'developer', 'user'],
      permissions: ROLE_PERMISSIONS,
    });
  });

  // ==========================================================================
  // System Info
  // ==========================================================================

  /**
   * GET /api/v1/admin/stats
   * Get system statistics
   */
  app.get(`${prefix}/stats`, async (_request: FastifyRequest, reply: FastifyReply) => {
    const userStats = await userService.getUserCountByRole();
    const totalUsers = await userService.getUserCount();
    const authEnabled = authService.isAuthEnabled();
    
    return reply.send({
      users: {
        total: totalUsers,
        byRole: userStats,
      },
      auth: {
        enabled: authEnabled,
      },
    });
  });
}
