#!/usr/bin/env node
/**
 * LeForge Password Reset CLI
 * 
 * Usage:
 *   npx ts-node src/server/cli/reset-password.ts <username> <new-password>
 *   node dist/server/cli/reset-password.js <username> <new-password>
 * 
 * Inside container:
 *   node /app/dist/server/cli/reset-password.js admin newpassword
 */

import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

async function resetPassword(username: string, newPassword: string): Promise<void> {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'leforge',
    password: process.env.POSTGRES_PASSWORD || 'leforge_password',
    database: process.env.POSTGRES_DB || 'leforge',
  });

  try {
    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    
    // Check if user exists in database
    const checkResult = await pool.query(
      'SELECT id, username FROM users WHERE username = $1',
      [username]
    );

    if (checkResult.rows.length > 0) {
      // Update existing user
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE username = $2',
        [passwordHash, username]
      );
      console.log(`✓ Password updated for user: ${username}`);
    } else if (username === 'admin') {
      // Create admin user if it doesn't exist
      await pool.query(
        `INSERT INTO users (username, display_name, password_hash, role, auth_provider, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (username) DO UPDATE SET password_hash = $3, updated_at = NOW()`,
        [username, 'Administrator', passwordHash, 'admin', 'local', true]
      );
      console.log(`✓ Admin user created/updated with new password`);
    } else {
      console.error(`✗ User '${username}' not found in database`);
      console.log('\nNote: For the config-based admin user, set LEFORGE_ADMIN_PASSWORD environment variable');
      process.exit(1);
    }

    // Also show the hashed password for env var use
    console.log(`\nTo use this password via environment variable:`);
    console.log(`LEFORGE_ADMIN_PASSWORD=${passwordHash}`);
    
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('relation "users" does not exist')) {
      console.log('Users table not found. Using environment variable method.');
      const passwordHash = await bcrypt.hash(newPassword, 12);
      console.log(`\nSet this environment variable and restart:`);
      console.log(`LEFORGE_ADMIN_PASSWORD=${passwordHash}`);
    } else {
      console.error('Error:', error);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

// CLI entry point
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('LeForge Password Reset Tool\n');
  console.log('Usage: reset-password <username> <new-password>\n');
  console.log('Examples:');
  console.log('  node /app/dist/server/cli/reset-password.js admin mynewpassword');
  console.log('  docker exec leforge-app node /app/dist/server/cli/reset-password.js admin mynewpassword');
  process.exit(1);
}

const [username, newPassword] = args;

if (newPassword.length < 4) {
  console.error('Password must be at least 4 characters');
  process.exit(1);
}

resetPassword(username, newPassword);
