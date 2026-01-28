import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sslService } from '../services/ssl.service.js';
import { logger } from '../utils/logger.js';

interface UploadCertificateBody {
  name: string;
  certificate: string;
  privateKey: string;
  caBundle?: string;
  setActive?: boolean;
}

interface GenerateSelfSignedBody {
  name?: string;
  commonName?: string;
  organization?: string;
  validDays?: number;
  setActive?: boolean;
}

interface UpdateSettingsBody {
  httpsEnabled?: boolean;
  httpsPort?: number;
  forceHttps?: boolean;
  hstsEnabled?: boolean;
  hstsMaxAge?: number;
  minTlsVersion?: string;
}

export async function sslRoutes(fastify: FastifyInstance) {
  // Get SSL settings and active certificate status
  fastify.get('/api/v1/ssl/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = await sslService.getSettings();
      const activeCert = await sslService.getActiveCertificate();
      
      let certStatus = null;
      if (activeCert) {
        const expiry = sslService.checkCertificateExpiry(activeCert.certificate);
        certStatus = {
          id: activeCert.id,
          name: activeCert.name,
          commonName: activeCert.commonName,
          issuer: activeCert.issuer,
          isSelfSigned: activeCert.isSelfSigned,
          validFrom: activeCert.validFrom,
          validUntil: activeCert.validUntil,
          fingerprint: activeCert.fingerprint,
          isExpired: expiry.isExpired,
          expiresInDays: expiry.expiresInDays,
        };
      }

      return reply.send({
        settings,
        activeCertificate: certStatus,
        httpsAvailable: !!activeCert,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get SSL status');
      return reply.status(500).send({
        error: { code: 'SSL_STATUS_ERROR', message: 'Failed to get SSL status' },
      });
    }
  });

  // Get SSL settings
  fastify.get('/api/v1/ssl/settings', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = await sslService.getSettings();
      return reply.send(settings);
    } catch (error) {
      logger.error({ error }, 'Failed to get SSL settings');
      return reply.status(500).send({
        error: { code: 'SSL_SETTINGS_ERROR', message: 'Failed to get SSL settings' },
      });
    }
  });

  // Update SSL settings
  fastify.patch('/api/v1/ssl/settings', async (
    request: FastifyRequest<{ Body: UpdateSettingsBody }>,
    reply: FastifyReply
  ) => {
    try {
      const settings = await sslService.updateSettings(request.body);
      
      logger.info({ settings }, 'SSL settings updated');
      
      return reply.send({
        message: 'SSL settings updated. Restart LeForge to apply HTTPS changes.',
        settings,
        restartRequired: request.body.httpsEnabled !== undefined,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to update SSL settings');
      return reply.status(500).send({
        error: { code: 'SSL_UPDATE_ERROR', message: 'Failed to update SSL settings' },
      });
    }
  });

  // List all certificates
  fastify.get('/api/v1/ssl/certificates', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const certificates = await sslService.listCertificates();
      
      // Don't send private keys in list response
      const safeCerts = certificates.map(cert => {
        const expiry = sslService.checkCertificateExpiry(cert.certificate);
        return {
          id: cert.id,
          name: cert.name,
          isActive: cert.isActive,
          isSelfSigned: cert.isSelfSigned,
          commonName: cert.commonName,
          issuer: cert.issuer,
          validFrom: cert.validFrom,
          validUntil: expiry.validUntil,
          fingerprint: cert.fingerprint,
          createdAt: cert.createdAt,
          isExpired: expiry.isExpired,
          expiresInDays: expiry.expiresInDays,
        };
      });

      return reply.send({ certificates: safeCerts });
    } catch (error) {
      logger.error({ error }, 'Failed to list certificates');
      return reply.status(500).send({
        error: { code: 'SSL_LIST_ERROR', message: 'Failed to list certificates' },
      });
    }
  });

  // Upload a certificate
  fastify.post('/api/v1/ssl/certificates', async (
    request: FastifyRequest<{ Body: UploadCertificateBody }>,
    reply: FastifyReply
  ) => {
    try {
      const { name, certificate, privateKey, caBundle, setActive } = request.body;

      if (!name || !certificate || !privateKey) {
        return reply.status(400).send({
          error: { code: 'INVALID_INPUT', message: 'Name, certificate, and private key are required' },
        });
      }

      const cert = await sslService.saveCertificate({
        name,
        certificate,
        privateKey,
        caBundle,
        isSelfSigned: false,
        setActive,
      });

      logger.info({ certId: cert.id, name }, 'Certificate uploaded');

      return reply.status(201).send({
        message: 'Certificate uploaded successfully',
        certificate: {
          id: cert.id,
          name: cert.name,
          isActive: cert.isActive,
          commonName: cert.commonName,
          issuer: cert.issuer,
          validFrom: cert.validFrom,
          validUntil: cert.validUntil,
          fingerprint: cert.fingerprint,
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error({ error }, 'Failed to upload certificate');
      
      if (err.message.includes('do not match')) {
        return reply.status(400).send({
          error: { code: 'KEY_MISMATCH', message: 'Certificate and private key do not match' },
        });
      }
      
      return reply.status(500).send({
        error: { code: 'SSL_UPLOAD_ERROR', message: 'Failed to upload certificate' },
      });
    }
  });

  // Generate self-signed certificate
  fastify.post('/api/v1/ssl/certificates/generate', async (
    request: FastifyRequest<{ Body: GenerateSelfSignedBody }>,
    reply: FastifyReply
  ) => {
    try {
      const { 
        name = 'LeForge Self-Signed', 
        commonName = 'LeForge.local',
        organization = 'LeForge',
        validDays = 365,
        setActive = true,
      } = request.body;

      logger.info({ commonName, validDays }, 'Generating self-signed certificate');

      const { certificate, privateKey, info } = await sslService.generateSelfSigned({
        commonName,
        organization,
        validDays,
      });

      const cert = await sslService.saveCertificate({
        name,
        certificate,
        privateKey,
        isSelfSigned: true,
        setActive,
      });

      logger.info({ certId: cert.id, commonName }, 'Self-signed certificate generated');

      return reply.status(201).send({
        message: 'Self-signed certificate generated successfully',
        certificate: {
          id: cert.id,
          name: cert.name,
          isActive: cert.isActive,
          isSelfSigned: true,
          commonName: info.commonName,
          issuer: info.issuer,
          validFrom: info.validFrom,
          validUntil: info.validUntil,
          fingerprint: info.fingerprint,
        },
        note: 'Self-signed certificates will show browser warnings. For production, use a certificate from a trusted CA.',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate self-signed certificate');
      return reply.status(500).send({
        error: { code: 'SSL_GENERATE_ERROR', message: 'Failed to generate self-signed certificate' },
      });
    }
  });

  // Set certificate as active
  fastify.post('/api/v1/ssl/certificates/:id/activate', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      await sslService.setActiveCertificate(request.params.id);
      
      logger.info({ certId: request.params.id }, 'Certificate activated');
      
      return reply.send({
        message: 'Certificate activated. Restart LeForge to apply changes.',
        restartRequired: true,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to activate certificate');
      return reply.status(500).send({
        error: { code: 'SSL_ACTIVATE_ERROR', message: 'Failed to activate certificate' },
      });
    }
  });

  // Delete a certificate
  fastify.delete('/api/v1/ssl/certificates/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      await sslService.deleteCertificate(request.params.id);
      
      logger.info({ certId: request.params.id }, 'Certificate deleted');
      
      return reply.send({ message: 'Certificate deleted' });
    } catch (error) {
      logger.error({ error }, 'Failed to delete certificate');
      return reply.status(500).send({
        error: { code: 'SSL_DELETE_ERROR', message: 'Failed to delete certificate' },
      });
    }
  });

  // Download certificate (public key only, for client trust)
  fastify.get('/api/v1/ssl/certificates/:id/download', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const certs = await sslService.listCertificates();
      const cert = certs.find(c => c.id === request.params.id);
      
      if (!cert) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Certificate not found' },
        });
      }

      return reply
        .header('Content-Type', 'application/x-pem-file')
        .header('Content-Disposition', `attachment; filename="${cert.name.replace(/[^a-z0-9]/gi, '_')}.crt"`)
        .send(cert.certificate);
    } catch (error) {
      logger.error({ error }, 'Failed to download certificate');
      return reply.status(500).send({
        error: { code: 'SSL_DOWNLOAD_ERROR', message: 'Failed to download certificate' },
      });
    }
  });
}
