import bcrypt from 'bcryptjs';
import { databaseService } from './database.service.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

export type UserRole = 'admin' | 'developer' | 'user';

export interface DbUser {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  role: UserRole;
  auth_provider: 'local' | 'oidc';
  oidc_subject: string | null;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  role: UserRole;
  authProvider: 'local' | 'oidc';
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  email?: string;
  password?: string;
  role?: UserRole;
  authProvider?: 'local' | 'oidc';
  oidcSubject?: string;
}

export interface UpdateUserInput {
  displayName?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
  password?: string;
}

// =============================================================================
// Role Permissions
// =============================================================================

export const ROLE_PERMISSIONS = {
  admin: {
    // Full access
    canManageUsers: true,
    canManageSettings: true,
    canManagePlugins: true,
    canManageApiKeys: true,
    canManageIntegrations: true,
    canManageSSL: true,
    canUsePlayground: true,
    canViewDashboard: true,
    canViewDocs: true,
  },
  developer: {
    // Can manage technical aspects
    canManageUsers: false,
    canManageSettings: false,
    canManagePlugins: true,
    canManageApiKeys: true,
    canManageIntegrations: true,
    canManageSSL: false,
    canUsePlayground: true,
    canViewDashboard: true,
    canViewDocs: true,
  },
  user: {
    // Consumer only - create keys and use endpoints
    canManageUsers: false,
    canManageSettings: false,
    canManagePlugins: false,
    canManageApiKeys: true, // Can create their own keys
    canManageIntegrations: false,
    canManageSSL: false,
    canUsePlayground: true,
    canViewDashboard: true,
    canViewDocs: true,
  },
} as const;

export type PermissionKey = keyof typeof ROLE_PERMISSIONS.admin;

// =============================================================================
// User Service
// =============================================================================

class UserService {
  /**
   * Convert database row to User object
   */
  private toUser(row: DbUser): User {
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      email: row.email || undefined,
      role: row.role,
      authProvider: row.auth_provider,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Hash a password
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  /**
   * Verify a password
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Get all users
   */
  async getUsers(): Promise<User[]> {
    const result = await databaseService.query(
      'SELECT * FROM users ORDER BY created_at DESC'
    );
    return (result.rows as DbUser[]).map((row: DbUser) => this.toUser(row));
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    const result = await databaseService.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    const row = result.rows[0] as DbUser | undefined;
    return row ? this.toUser(row) : null;
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | null> {
    const result = await databaseService.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    const row = result.rows[0] as DbUser | undefined;
    return row ? this.toUser(row) : null;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const result = await databaseService.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    const row = result.rows[0] as DbUser | undefined;
    return row ? this.toUser(row) : null;
  }

  /**
   * Get user by OIDC subject
   */
  async getUserByOidcSubject(subject: string): Promise<User | null> {
    const result = await databaseService.query(
      'SELECT * FROM users WHERE oidc_subject = $1',
      [subject]
    );
    const row = result.rows[0] as DbUser | undefined;
    return row ? this.toUser(row) : null;
  }

  /**
   * Get internal user row (with password hash for authentication)
   */
  async getInternalUserByUsername(username: string): Promise<DbUser | null> {
    const result = await databaseService.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return (result.rows[0] as DbUser | undefined) || null;
  }

  /**
   * Create a new user
   */
  async createUser(input: CreateUserInput): Promise<User> {
    const {
      username,
      displayName,
      email,
      password,
      role = 'user',
      authProvider = 'local',
      oidcSubject,
    } = input;

    // Hash password if provided
    const passwordHash = password ? await this.hashPassword(password) : null;

    const result = await databaseService.query(
      `INSERT INTO users (username, display_name, email, password_hash, role, auth_provider, oidc_subject)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [username, displayName, email, passwordHash, role, authProvider, oidcSubject]
    );

    const user = this.toUser(result.rows[0] as DbUser);
    logger.info({ username, role }, 'User created');
    return user;
  }

  /**
   * Update a user
   */
  async updateUser(id: string, input: UpdateUserInput): Promise<User | null> {
    const updates: string[] = [];
    const values: (string | boolean | null)[] = [];
    let paramIndex = 1;

    if (input.displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(input.displayName);
    }

    if (input.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(input.email || null);
    }

    if (input.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(input.role);
    }

    if (input.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(input.isActive);
    }

    if (input.password !== undefined) {
      const passwordHash = await this.hashPassword(input.password);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(passwordHash);
    }

    if (updates.length === 0) {
      return this.getUserById(id);
    }

    values.push(id);
    const result = await databaseService.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    const row = result.rows[0] as DbUser | undefined;
    if (!row) {
      return null;
    }

    const user = this.toUser(row);
    logger.info({ userId: id }, 'User updated');
    return user;
  }

  /**
   * Delete a user
   */
  async deleteUser(id: string): Promise<boolean> {
    const result = await databaseService.query(
      'DELETE FROM users WHERE id = $1',
      [id]
    );
    
    if (result.rowCount && result.rowCount > 0) {
      logger.info({ userId: id }, 'User deleted');
      return true;
    }
    return false;
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    await databaseService.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [id]
    );
  }

  /**
   * Update user password directly (with pre-hashed password)
   */
  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    await databaseService.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, id]
    );
    logger.info({ userId: id }, 'Password updated');
  }

  /**
   * Get user count
   */
  async getUserCount(): Promise<number> {
    const result = await databaseService.query(
      'SELECT COUNT(*) as count FROM users'
    );
    return parseInt((result.rows[0] as { count: string }).count, 10);
  }

  /**
   * Get user count by role
   */
  async getUserCountByRole(): Promise<Record<UserRole, number>> {
    const result = await databaseService.query(
      'SELECT role, COUNT(*) as count FROM users GROUP BY role'
    );
    
    const counts: Record<UserRole, number> = { admin: 0, developer: 0, user: 0 };
    for (const row of result.rows as Array<{ role: UserRole; count: string }>) {
      counts[row.role] = parseInt(row.count, 10);
    }
    return counts;
  }

  /**
   * Check if any users exist (for initial setup)
   */
  async hasUsers(): Promise<boolean> {
    const count = await this.getUserCount();
    return count > 0;
  }

  /**
   * Check if user has permission
   */
  hasPermission(role: UserRole, permission: PermissionKey): boolean {
    return ROLE_PERMISSIONS[role]?.[permission] ?? false;
  }

  /**
   * Get permissions for a role
   */
  getPermissions(role: UserRole): (typeof ROLE_PERMISSIONS)[UserRole] {
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user;
  }
}

// Export singleton
export const userService = new UserService();
