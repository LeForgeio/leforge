/**
 * Core Utilities Routes
 * Built-in utilities that don't require plugin installation
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  generateQR,
  generateQRSvg,
  generateQRBase64,
  generateQRMatrix,
  generateBarcode,
  generateCode128,
  generateEAN13,
  generateUPCA,
  validateEAN13,
  validateUPCA,
  calculateCheckDigit,
  QROptions,
  BarcodeOptions
} from '../utils/qrcode.js';

interface QRBody {
  data: string;
  options?: QROptions;
}

interface BarcodeBody {
  data: string;
  options?: BarcodeOptions;
}

interface ValidateBody {
  data: string;
  type?: 'ean13' | 'upca';
}

export default async function utilsRoutes(fastify: FastifyInstance) {
  // ========================================
  // QR Code Endpoints
  // ========================================

  /**
   * Generate QR code as SVG
   */
  fastify.post<{ Body: QRBody }>(
    '/qr/svg',
    async (request: FastifyRequest<{ Body: QRBody }>, reply: FastifyReply) => {
      const { data, options = {} } = request.body;
      
      if (!data) {
        return reply.status(400).send({ error: 'data is required' });
      }
      
      const svg = generateQRSvg(data, options);
      return reply.type('image/svg+xml').send(svg);
    }
  );

  /**
   * Generate QR code as base64 data URI
   */
  fastify.post<{ Body: QRBody }>(
    '/qr/base64',
    async (request: FastifyRequest<{ Body: QRBody }>, reply: FastifyReply) => {
      const { data, options = {} } = request.body;
      
      if (!data) {
        return reply.status(400).send({ error: 'data is required' });
      }
      
      const base64 = generateQRBase64(data, options);
      return { dataUri: base64 };
    }
  );

  /**
   * Generate QR code as boolean matrix
   */
  fastify.post<{ Body: QRBody }>(
    '/qr/matrix',
    async (request: FastifyRequest<{ Body: QRBody }>, reply: FastifyReply) => {
      const { data, options = {} } = request.body;
      
      if (!data) {
        return reply.status(400).send({ error: 'data is required' });
      }
      
      const matrix = generateQRMatrix(data, options);
      return { matrix, size: matrix.length };
    }
  );

  /**
   * Generate QR code (auto-format based on Accept header or options)
   */
  fastify.post<{ Body: QRBody }>(
    '/qr',
    async (request: FastifyRequest<{ Body: QRBody }>, reply: FastifyReply) => {
      const { data, options = {} } = request.body;
      
      if (!data) {
        return reply.status(400).send({ error: 'data is required' });
      }
      
      // Check Accept header for format preference
      const accept = request.headers.accept || '';
      if (accept.includes('image/svg+xml') && !options.format) {
        options.format = 'svg';
      }
      
      const result = generateQR(data, options);
      
      if (options.format === 'svg' || (!options.format && typeof result === 'string' && result.startsWith('<?xml'))) {
        return reply.type('image/svg+xml').send(result);
      }
      
      if (options.format === 'matrix') {
        return { matrix: result, size: (result as boolean[][]).length };
      }
      
      return { result };
    }
  );

  // ========================================
  // Barcode Endpoints
  // ========================================

  /**
   * Generate Code128 barcode
   */
  fastify.post<{ Body: BarcodeBody }>(
    '/barcode/code128',
    async (request: FastifyRequest<{ Body: BarcodeBody }>, reply: FastifyReply) => {
      const { data, options = {} } = request.body;
      
      if (!data) {
        return reply.status(400).send({ error: 'data is required' });
      }
      
      const svg = generateCode128(data, options);
      return reply.type('image/svg+xml').send(svg);
    }
  );

  /**
   * Generate EAN-13 barcode
   */
  fastify.post<{ Body: BarcodeBody }>(
    '/barcode/ean13',
    async (request: FastifyRequest<{ Body: BarcodeBody }>, reply: FastifyReply) => {
      const { data, options = {} } = request.body;
      
      if (!data) {
        return reply.status(400).send({ error: 'data is required' });
      }
      
      try {
        const svg = generateEAN13(data, options);
        return reply.type('image/svg+xml').send(svg);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid input';
        return reply.status(400).send({ error: message });
      }
    }
  );

  /**
   * Generate UPC-A barcode
   */
  fastify.post<{ Body: BarcodeBody }>(
    '/barcode/upca',
    async (request: FastifyRequest<{ Body: BarcodeBody }>, reply: FastifyReply) => {
      const { data, options = {} } = request.body;
      
      if (!data) {
        return reply.status(400).send({ error: 'data is required' });
      }
      
      try {
        const svg = generateUPCA(data, options);
        return reply.type('image/svg+xml').send(svg);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid input';
        return reply.status(400).send({ error: message });
      }
    }
  );

  /**
   * Generate barcode (type specified in options)
   */
  fastify.post<{ Body: BarcodeBody }>(
    '/barcode',
    async (request: FastifyRequest<{ Body: BarcodeBody }>, reply: FastifyReply) => {
      const { data, options = {} } = request.body;
      
      if (!data) {
        return reply.status(400).send({ error: 'data is required' });
      }
      
      try {
        const svg = generateBarcode(data, options);
        return reply.type('image/svg+xml').send(svg);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid input';
        return reply.status(400).send({ error: message });
      }
    }
  );

  /**
   * Validate barcode
   */
  fastify.post<{ Body: ValidateBody }>(
    '/barcode/validate',
    async (request: FastifyRequest<{ Body: ValidateBody }>, reply: FastifyReply) => {
      const { data, type = 'ean13' } = request.body;
      
      if (!data) {
        return reply.status(400).send({ error: 'data is required' });
      }
      
      const valid = type === 'upca' ? validateUPCA(data) : validateEAN13(data);
      const checkDigit = calculateCheckDigit(data, type);
      
      return { valid, checkDigit, type };
    }
  );

  // ========================================
  // Utility Info
  // ========================================

  /**
   * List available built-in utilities
   */
  fastify.get('/info', async () => {
    return {
      name: 'LeForge Core Utilities',
      version: '1.0.0',
      utilities: [
        {
          name: 'QR Code',
          endpoints: [
            { method: 'POST', path: '/utils/qr', description: 'Generate QR code' },
            { method: 'POST', path: '/utils/qr/svg', description: 'Generate QR code as SVG' },
            { method: 'POST', path: '/utils/qr/base64', description: 'Generate QR code as base64 data URI' },
            { method: 'POST', path: '/utils/qr/matrix', description: 'Generate QR code as boolean matrix' }
          ]
        },
        {
          name: 'Barcode',
          endpoints: [
            { method: 'POST', path: '/utils/barcode', description: 'Generate barcode (Code128/EAN-13/UPC-A)' },
            { method: 'POST', path: '/utils/barcode/code128', description: 'Generate Code128 barcode' },
            { method: 'POST', path: '/utils/barcode/ean13', description: 'Generate EAN-13 barcode' },
            { method: 'POST', path: '/utils/barcode/upca', description: 'Generate UPC-A barcode' },
            { method: 'POST', path: '/utils/barcode/validate', description: 'Validate barcode check digit' }
          ]
        }
      ]
    };
  });
}
