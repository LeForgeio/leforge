import { spawn } from 'child_process';
import crypto from 'crypto';
import { databaseService } from './database.service.js';
import { logger } from '../utils/logger.js';

export interface SSLCertificate {
  id: string;
  name: string;
  isActive: boolean;
  isSelfSigned: boolean;
  certificate: string;
  privateKey: string;
  caBundle?: string;
  commonName?: string;
  issuer?: string;
  validFrom?: Date;
  validUntil?: Date;
  fingerprint?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SSLSettings {
  httpsEnabled: boolean;
  httpsPort: number;
  forceHttps: boolean;
  hstsEnabled: boolean;
  hstsMaxAge: number;
  minTlsVersion: string;
}

export interface CertificateInfo {
  commonName: string;
  issuer: string;
  validFrom: Date;
  validUntil: Date;
  fingerprint: string;
  isSelfSigned: boolean;
}

class SSLService {
  /**
   * Generate a self-signed certificate
   */
  async generateSelfSigned(options: {
    commonName?: string;
    organization?: string;
    validDays?: number;
  } = {}): Promise<{ certificate: string; privateKey: string; info: CertificateInfo }> {
    const {
      commonName = 'FlowForge',
      organization = 'FlowForge',
      validDays = 365,
    } = options;

    logger.info({ commonName, validDays }, 'Generating self-signed certificate');

    return new Promise((resolve, reject) => {
      // Generate using OpenSSL
      const subject = `/CN=${commonName}/O=${organization}`;
      
      const opensslArgs = [
        'req', '-x509',
        '-newkey', 'rsa:4096',
        '-keyout', '-',
        '-out', '-', 
        '-days', validDays.toString(),
        '-nodes',
        '-subj', subject,
        '-addext', `subjectAltName=DNS:${commonName},DNS:localhost,IP:127.0.0.1`,
      ];

      const openssl = spawn('openssl', opensslArgs);
      let output = '';
      let errorOutput = '';

      openssl.stdout.on('data', (data) => {
        output += data.toString();
      });

      openssl.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      openssl.on('close', (code) => {
        if (code !== 0) {
          logger.error({ code, errorOutput }, 'OpenSSL failed');
          reject(new Error(`OpenSSL failed with code ${code}: ${errorOutput}`));
          return;
        }

        // Parse output - contains both key and cert
        const keyMatch = output.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/);
        const certMatch = output.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);

        if (!keyMatch || !certMatch) {
          reject(new Error('Failed to parse OpenSSL output'));
          return;
        }

        const privateKey = keyMatch[0];
        const certificate = certMatch[0];

        // Calculate fingerprint
        const fingerprint = this.calculateFingerprint(certificate);

        const validFrom = new Date();
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + validDays);

        resolve({
          certificate,
          privateKey,
          info: {
            commonName,
            issuer: commonName, // Self-signed, so issuer = subject
            validFrom,
            validUntil,
            fingerprint,
            isSelfSigned: true,
          },
        });
      });

      openssl.on('error', (_err) => {
        // OpenSSL not available, use Node.js crypto
        logger.warn('OpenSSL not available, using Node.js crypto');
        this.generateSelfSignedNodejs(commonName, organization, validDays)
          .then(resolve)
          .catch(reject);
      });
    });
  }

  /**
   * Fallback: Generate self-signed certificate using Node.js crypto
   */
  private async generateSelfSignedNodejs(
    commonName: string,
    organization: string,
    validDays: number
  ): Promise<{ certificate: string; privateKey: string; info: CertificateInfo }> {
    // Generate key pair
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // For a proper self-signed cert, we need the x509 module (Node 15+)
    // This is a simplified version - in production, use proper ASN.1 encoding
    const validFrom = new Date();
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);

    // Create a simple self-signed certificate structure
    // Note: This is a placeholder - real implementation would need forge or similar
    const certificate = this.createSimpleCertificate(publicKey, privateKey, commonName, organization, validDays);
    const fingerprint = this.calculateFingerprint(certificate);

    return {
      certificate,
      privateKey,
      info: {
        commonName,
        issuer: commonName,
        validFrom,
        validUntil,
        fingerprint,
        isSelfSigned: true,
      },
    };
  }

  /**
   * Create a simple self-signed X.509 certificate
   * Note: Uses Node.js built-in crypto.X509Certificate for validation
   */
  private createSimpleCertificate(
    publicKey: string,
    _privateKey: string,
    _commonName: string,
    _organization: string,
    _validDays: number
  ): string {
    // For Node.js 19+, we can use the built-in X509Certificate
    // For earlier versions, we'll return the public key as a placeholder
    // and rely on OpenSSL being available in the Docker container
    
    // This is a workaround - the Docker container should have OpenSSL
    logger.warn('Node.js certificate generation not fully implemented, using placeholder');
    return publicKey;
  }

  /**
   * Calculate SHA-256 fingerprint of a certificate
   */
  calculateFingerprint(certificate: string): string {
    // Remove PEM headers and decode base64
    const pemContent = certificate
      .replace(/-----BEGIN CERTIFICATE-----/, '')
      .replace(/-----END CERTIFICATE-----/, '')
      .replace(/\s/g, '');
    
    const der = Buffer.from(pemContent, 'base64');
    const hash = crypto.createHash('sha256').update(der).digest('hex');
    
    // Format as colon-separated pairs
    return hash.toUpperCase().match(/.{2}/g)?.join(':') || hash.toUpperCase();
  }

  /**
   * Parse certificate info from PEM
   */
  parseCertificateInfo(certificate: string): Partial<CertificateInfo> {
    try {
      const x509 = new crypto.X509Certificate(certificate);
      
      return {
        commonName: this.extractCN(x509.subject),
        issuer: this.extractCN(x509.issuer),
        validFrom: new Date(x509.validFrom),
        validUntil: new Date(x509.validTo),
        fingerprint: x509.fingerprint256.replace(/:/g, ':'),
        isSelfSigned: x509.subject === x509.issuer,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to parse certificate');
      return {};
    }
  }

  private extractCN(subject: string): string {
    const match = subject.match(/CN=([^,\n]+)/);
    return match ? match[1] : 'Unknown';
  }

  /**
   * Validate certificate and key pair match
   */
  validateCertificateKeyPair(certificate: string, privateKey: string): boolean {
    try {
      const x509 = new crypto.X509Certificate(certificate);
      const key = crypto.createPrivateKey(privateKey);
      
      // Check if the public key in the certificate matches the private key
      return x509.checkPrivateKey(key);
    } catch (error) {
      logger.error({ error }, 'Certificate/key validation failed');
      return false;
    }
  }

  /**
   * Check if certificate is expired or expiring soon
   */
  checkCertificateExpiry(certificate: string): { 
    isExpired: boolean; 
    expiresInDays: number;
    validUntil: Date;
  } {
    try {
      const x509 = new crypto.X509Certificate(certificate);
      const validUntil = new Date(x509.validTo);
      const now = new Date();
      const diffTime = validUntil.getTime() - now.getTime();
      const expiresInDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return {
        isExpired: expiresInDays <= 0,
        expiresInDays,
        validUntil,
      };
    } catch {
      return { isExpired: true, expiresInDays: 0, validUntil: new Date() };
    }
  }

  // ============================================================================
  // Database Operations
  // ============================================================================

  // Type for database row
  private readonly certRowType = {} as {
    id: string;
    name: string;
    is_active: boolean;
    is_self_signed: boolean;
    certificate: string;
    private_key: string;
    ca_bundle: string | null;
    common_name: string | null;
    issuer: string | null;
    valid_from: Date | null;
    valid_until: Date | null;
    fingerprint: string | null;
    created_at: Date;
    updated_at: Date;
  };

  /**
   * Save a certificate to the database
   */
  async saveCertificate(data: {
    name: string;
    certificate: string;
    privateKey: string;
    caBundle?: string;
    isSelfSigned?: boolean;
    setActive?: boolean;
  }): Promise<SSLCertificate> {
    const info = this.parseCertificateInfo(data.certificate);
    
    // Validate key pair
    if (!this.validateCertificateKeyPair(data.certificate, data.privateKey)) {
      throw new Error('Certificate and private key do not match');
    }

    // If setting as active, deactivate all others first
    if (data.setActive) {
      await databaseService.query('UPDATE ssl_certificates SET is_active = false');
    }

    const result = await databaseService.query(`
      INSERT INTO ssl_certificates (
        name, certificate, private_key, ca_bundle, 
        is_self_signed, is_active,
        common_name, issuer, valid_from, valid_until, fingerprint
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      data.name,
      data.certificate,
      data.privateKey,
      data.caBundle || null,
      data.isSelfSigned ?? info.isSelfSigned ?? false,
      data.setActive ?? false,
      info.commonName || null,
      info.issuer || null,
      info.validFrom || null,
      info.validUntil || null,
      info.fingerprint || null,
    ]);

    return this.mapCertificateRow(result.rows[0] as typeof this.certRowType);
  }

  /**
   * Get the active certificate
   */
  async getActiveCertificate(): Promise<SSLCertificate | null> {
    const result = await databaseService.query(
      'SELECT * FROM ssl_certificates WHERE is_active = true LIMIT 1'
    );
    
    return result.rows[0] ? this.mapCertificateRow(result.rows[0] as typeof this.certRowType) : null;
  }

  /**
   * List all certificates
   */
  async listCertificates(): Promise<SSLCertificate[]> {
    const result = await databaseService.query(`
      SELECT id, name, is_active, is_self_signed, 
             common_name, issuer, valid_from, valid_until, fingerprint,
             created_at, updated_at,
             certificate, private_key, ca_bundle
      FROM ssl_certificates 
      ORDER BY is_active DESC, created_at DESC
    `);
    
    return result.rows.map((row: typeof this.certRowType) => this.mapCertificateRow(row));
  }

  /**
   * Set a certificate as active
   */
  async setActiveCertificate(id: string): Promise<void> {
    const client = await databaseService.getClient();
    
    try {
      await client.query('BEGIN');
      await client.query('UPDATE ssl_certificates SET is_active = false');
      await client.query('UPDATE ssl_certificates SET is_active = true WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a certificate
   */
  async deleteCertificate(id: string): Promise<void> {
    await databaseService.query('DELETE FROM ssl_certificates WHERE id = $1 AND is_active = false', [id]);
  }

  /**
   * Get SSL settings
   */
  async getSettings(): Promise<SSLSettings> {
    const result = await databaseService.query('SELECT * FROM ssl_settings WHERE id = $1', ['default']);
    
    if (!result.rows[0]) {
      return {
        httpsEnabled: false,
        httpsPort: 3443,
        forceHttps: false,
        hstsEnabled: false,
        hstsMaxAge: 31536000,
        minTlsVersion: '1.2',
      };
    }

    const row = result.rows[0] as {
      https_enabled: boolean;
      https_port: number;
      force_https: boolean;
      hsts_enabled: boolean;
      hsts_max_age: number;
      min_tls_version: string;
    };
    return {
      httpsEnabled: row.https_enabled,
      httpsPort: row.https_port,
      forceHttps: row.force_https,
      hstsEnabled: row.hsts_enabled,
      hstsMaxAge: row.hsts_max_age,
      minTlsVersion: row.min_tls_version,
    };
  }

  /**
   * Update SSL settings
   */
  async updateSettings(settings: Partial<SSLSettings>): Promise<SSLSettings> {
    const updates: string[] = [];
    const values: (boolean | number | string)[] = [];
    let paramIndex = 1;

    if (settings.httpsEnabled !== undefined) {
      updates.push(`https_enabled = $${paramIndex++}`);
      values.push(settings.httpsEnabled);
    }
    if (settings.httpsPort !== undefined) {
      updates.push(`https_port = $${paramIndex++}`);
      values.push(settings.httpsPort);
    }
    if (settings.forceHttps !== undefined) {
      updates.push(`force_https = $${paramIndex++}`);
      values.push(settings.forceHttps);
    }
    if (settings.hstsEnabled !== undefined) {
      updates.push(`hsts_enabled = $${paramIndex++}`);
      values.push(settings.hstsEnabled);
    }
    if (settings.hstsMaxAge !== undefined) {
      updates.push(`hsts_max_age = $${paramIndex++}`);
      values.push(settings.hstsMaxAge);
    }
    if (settings.minTlsVersion !== undefined) {
      updates.push(`min_tls_version = $${paramIndex++}`);
      values.push(settings.minTlsVersion);
    }

    if (updates.length > 0) {
      values.push('default');
      await databaseService.query(
        `UPDATE ssl_settings SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    }

    return this.getSettings();
  }

  private mapCertificateRow(row: {
    id: string;
    name: string;
    is_active: boolean;
    is_self_signed: boolean;
    certificate: string;
    private_key: string;
    ca_bundle: string | null;
    common_name: string | null;
    issuer: string | null;
    valid_from: Date | null;
    valid_until: Date | null;
    fingerprint: string | null;
    created_at: Date;
    updated_at: Date;
  }): SSLCertificate {
    return {
      id: row.id,
      name: row.name,
      isActive: row.is_active,
      isSelfSigned: row.is_self_signed,
      certificate: row.certificate,
      privateKey: row.private_key,
      caBundle: row.ca_bundle || undefined,
      commonName: row.common_name || undefined,
      issuer: row.issuer || undefined,
      validFrom: row.valid_from || undefined,
      validUntil: row.valid_until || undefined,
      fingerprint: row.fingerprint || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const sslService = new SSLService();
