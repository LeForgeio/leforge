import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import { createWriteStream, createReadStream } from 'fs';
import { mkdir, rm, readFile, writeFile, stat } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createGzip, createGunzip } from 'zlib';
import { createHash } from 'crypto';
import tar from 'tar-stream';
import { dockerService } from '../services/docker.service.js';
import { logger } from '../utils/logger.js';
import { ForgeHookManifest } from '../types/index.js';
import { Readable } from 'stream';

interface PluginParams {
  pluginId: string;
}

interface PackageImportBody {
  config?: Record<string, unknown>;
  environment?: Record<string, string>;
  autoStart?: boolean;
}

// Temp directory for package operations
const PACKAGE_TEMP_DIR = '/tmp/flowforge-packages';

export async function packageRoutes(fastify: FastifyInstance) {
  // Ensure temp directory exists
  await mkdir(PACKAGE_TEMP_DIR, { recursive: true });

  // ============================================================================
  // Export Plugin as .fhk Package
  // ============================================================================

  /**
   * Export an installed plugin as a .fhk package
   * Package contains: manifest.json, image.tar, checksums.sha256
   */
  fastify.get<{ Params: PluginParams }>(
    '/api/v1/plugins/:pluginId/export',
    async (request, reply) => {
      const { pluginId } = request.params;

      const plugin = dockerService.getPlugin(pluginId);
      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      const packageId = `${plugin.manifest.id}-${plugin.manifest.version}`;
      const packageDir = path.join(PACKAGE_TEMP_DIR, packageId);
      const packageFile = path.join(PACKAGE_TEMP_DIR, `${packageId}.fhk`);

      try {
        logger.info({ pluginId, packageId }, 'Exporting plugin as .fhk package');

        // Create package directory
        await mkdir(packageDir, { recursive: true });

        // 1. Write manifest
        const manifestPath = path.join(packageDir, 'manifest.json');
        await writeFile(manifestPath, JSON.stringify(plugin.manifest, null, 2));

        // Check if this is a container plugin that can export an image
        if (!plugin.manifest.image?.repository) {
          // Embedded plugins don't have Docker images
          logger.info({ pluginId }, 'Skipping image export for embedded plugin');
        } else {
          // 2. Export Docker image for container plugins
          const imageName = `${plugin.manifest.image.repository}:${plugin.manifest.image.tag || 'latest'}`;
          const imageTarPath = path.join(packageDir, 'image.tar');

          logger.debug({ imageName }, 'Exporting Docker image');

          // Use dockerode to get image and save it
          const dockerClient = (dockerService as any).docker;
          const image = dockerClient.getImage(imageName);

          const imageStream = await image.get();
          await pipeline(imageStream, createWriteStream(imageTarPath));
        }

        // 3. Write README
        const readmePath = path.join(packageDir, 'README.md');
        const readme = `# ${plugin.manifest.name}

**Version:** ${plugin.manifest.version}
**ID:** ${plugin.manifest.id}

${plugin.manifest.description}

## Installation

Upload this .fhk file to FlowForge via:
- Web UI: Settings > Packages > Import
- API: POST /api/v1/packages/import

## Contents

- \`manifest.json\` - ForgeHook manifest
- \`image.tar\` - Docker image
- \`checksums.sha256\` - File checksums

## Original Repository

${plugin.manifest.repository || 'N/A'}
`;
        await writeFile(readmePath, readme);

        // 4. Calculate checksums
        const checksums: string[] = [];
        for (const file of ['manifest.json', 'image.tar', 'README.md']) {
          const filePath = path.join(packageDir, file);
          const hash = createHash('sha256');
          const stream = createReadStream(filePath);
          for await (const chunk of stream) {
            hash.update(chunk);
          }
          checksums.push(`${hash.digest('hex')}  ${file}`);
        }
        await writeFile(path.join(packageDir, 'checksums.sha256'), checksums.join('\n'));

        // 5. Create tar.gz package
        logger.debug({ packageFile }, 'Creating .fhk package');

        const pack = tar.pack();
        const gzip = createGzip();

        // Add files to tar
        for (const file of ['manifest.json', 'image.tar', 'README.md', 'checksums.sha256']) {
          const filePath = path.join(packageDir, file);
          const fileStat = await stat(filePath);
          const content = await readFile(filePath);

          pack.entry({ name: file, size: fileStat.size }, content);
        }
        pack.finalize();

        // Stream the package file
        const writeStream = createWriteStream(packageFile);
        await pipeline(pack, gzip, writeStream);

        // Get final file size
        const packageStat = await stat(packageFile);

        // Clean up temp directory
        await rm(packageDir, { recursive: true, force: true });

        // Send the package file
        const filename = `${packageId}.fhk`;
        reply.header('Content-Type', 'application/gzip');
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);
        reply.header('Content-Length', packageStat.size);

        return reply.send(createReadStream(packageFile));

      } catch (error) {
        // Clean up on error
        await rm(packageDir, { recursive: true, force: true }).catch(() => {});
        await rm(packageFile, { force: true }).catch(() => {});

        logger.error({ error, pluginId }, 'Failed to export plugin');
        return reply.status(500).send({
          error: {
            code: 'EXPORT_FAILED',
            message: error instanceof Error ? error.message : 'Export failed',
          },
        });
      }
    }
  );

  // ============================================================================
  // Import .fhk Package
  // ============================================================================

  /**
   * Import a plugin from an uploaded .fhk package
   */
  fastify.post<{ Body: PackageImportBody }>(
    '/api/v1/packages/import',
    async (request, reply) => {
      const packageId = `import-${Date.now()}`;
      const packageDir = path.join(PACKAGE_TEMP_DIR, packageId);

      try {
        // Get the uploaded file
        const file = await request.file();

        if (!file) {
          return reply.status(400).send({
            error: {
              code: 'NO_FILE',
              message: 'No file uploaded. Send a .fhk package file.',
            },
          });
        }

        logger.info({ filename: file.filename }, 'Importing .fhk package');

        // Create extraction directory
        await mkdir(packageDir, { recursive: true });

        // Save uploaded file
        const packageFile = path.join(packageDir, 'package.fhk');
        await pipeline(file.file, createWriteStream(packageFile));

        // Extract package
        logger.debug('Extracting package');

        const extract = tar.extract();
        const extractedFiles: Map<string, Buffer> = new Map();

        extract.on('entry', (header, stream, next) => {
          const chunks: Buffer[] = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            extractedFiles.set(header.name, Buffer.concat(chunks));
            next();
          });
          stream.resume();
        });

        await pipeline(
          createReadStream(packageFile),
          createGunzip(),
          extract
        );

        // Validate required files
        if (!extractedFiles.has('manifest.json')) {
          throw new Error('Invalid package: missing manifest.json');
        }
        if (!extractedFiles.has('image.tar')) {
          throw new Error('Invalid package: missing image.tar');
        }

        // Parse manifest
        const manifest = JSON.parse(extractedFiles.get('manifest.json')!.toString()) as ForgeHookManifest;

        if (!manifest.id || !manifest.name || !manifest.image?.repository) {
          throw new Error('Invalid manifest: missing required fields');
        }

        // Check if already installed
        const existing = dockerService.getPluginByForgehookId(manifest.id);
        if (existing) {
          // Clean up
          await rm(packageDir, { recursive: true, force: true });

          return reply.status(409).send({
            error: {
              code: 'PLUGIN_EXISTS',
              message: `Plugin ${manifest.id} is already installed`,
              existingPluginId: existing.id,
            },
          });
        }

        // Verify checksum if present
        if (extractedFiles.has('checksums.sha256')) {
          const checksums = extractedFiles.get('checksums.sha256')!.toString();
          const expectedChecksums = new Map<string, string>();

          for (const line of checksums.split('\n')) {
            const [hash, filename] = line.trim().split(/\s+/);
            if (hash && filename) {
              expectedChecksums.set(filename, hash);
            }
          }

          // Verify manifest checksum
          if (expectedChecksums.has('manifest.json')) {
            const actualHash = createHash('sha256')
              .update(extractedFiles.get('manifest.json')!)
              .digest('hex');

            if (actualHash !== expectedChecksums.get('manifest.json')) {
              throw new Error('Checksum verification failed for manifest.json');
            }
          }

          // Verify image checksum
          if (expectedChecksums.has('image.tar')) {
            const actualHash = createHash('sha256')
              .update(extractedFiles.get('image.tar')!)
              .digest('hex');

            if (actualHash !== expectedChecksums.get('image.tar')) {
              throw new Error('Checksum verification failed for image.tar');
            }
          }

          logger.debug('Checksums verified');
        }

        // Load Docker image
        logger.info({ imageName: manifest.image.repository }, 'Loading Docker image from package');

        const dockerClient = (dockerService as any).docker;
        const imageBuffer = extractedFiles.get('image.tar')!;
        const imageStream = Readable.from(imageBuffer);

        await new Promise<void>((resolve, reject) => {
          dockerClient.loadImage(imageStream, {}, (err: Error | null, stream: NodeJS.ReadableStream) => {
            if (err) {
              reject(err);
              return;
            }

            // Follow progress
            dockerClient.modem.followProgress(stream, (err: Error | null) => {
              if (err) reject(err);
              else resolve();
            });
          });
        });

        logger.info('Docker image loaded successfully');

        // Parse fields from multipart if present
        const fields = (request as any).body || {};
        const config = fields.config ? JSON.parse(fields.config) : undefined;
        const environment = fields.environment ? JSON.parse(fields.environment) : undefined;
        const autoStart = fields.autoStart !== 'false';

        // Install the plugin
        const plugin = await dockerService.installPlugin({
          manifest,
          config,
          environment,
          autoStart,
        });

        // Clean up
        await rm(packageDir, { recursive: true, force: true });

        return reply.status(201).send({
          id: plugin.id,
          forgehookId: plugin.forgehookId,
          name: plugin.manifest.name,
          version: plugin.manifest.version,
          status: plugin.status,
          hostPort: plugin.hostPort,
          message: 'Plugin imported from package',
        });

      } catch (error) {
        // Clean up on error
        await rm(packageDir, { recursive: true, force: true }).catch(() => {});

        logger.error({ error }, 'Failed to import package');
        return reply.status(500).send({
          error: {
            code: 'IMPORT_FAILED',
            message: error instanceof Error ? error.message : 'Import failed',
          },
        });
      }
    }
  );

  // ============================================================================
  // Package Info (without importing)
  // ============================================================================

  /**
   * Get info about an uploaded package without importing
   */
  fastify.post(
    '/api/v1/packages/inspect',
    async (request, reply) => {
      try {
        const file = await request.file();

        if (!file) {
          return reply.status(400).send({
            error: {
              code: 'NO_FILE',
              message: 'No file uploaded',
            },
          });
        }

        // Extract just the manifest
        const extract = tar.extract();
        let manifest: ForgeHookManifest | null = null;
        let readme: string | null = null;
        let checksums: string | null = null;
        let imageSize: number = 0;

        extract.on('entry', (header, stream, next) => {
          const chunks: Buffer[] = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            const content = Buffer.concat(chunks);

            if (header.name === 'manifest.json') {
              manifest = JSON.parse(content.toString());
            } else if (header.name === 'README.md') {
              readme = content.toString();
            } else if (header.name === 'checksums.sha256') {
              checksums = content.toString();
            } else if (header.name === 'image.tar') {
              imageSize = content.length;
            }

            next();
          });
          stream.resume();
        });

        await pipeline(
          file.file,
          createGunzip(),
          extract
        );

        if (!manifest) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_PACKAGE',
              message: 'Package does not contain manifest.json',
            },
          });
        }

        // Check if already installed
        const manifestData = manifest as ForgeHookManifest;
        const existing = dockerService.getPluginByForgehookId(manifestData.id);

        return reply.send({
          manifest: manifestData,
          readme,
          checksums,
          imageSize,
          installed: !!existing,
          installedPluginId: existing?.id,
          installedVersion: existing?.manifest.version,
        });

      } catch (error) {
        logger.error({ error }, 'Failed to inspect package');
        return reply.status(500).send({
          error: {
            code: 'INSPECT_FAILED',
            message: error instanceof Error ? error.message : 'Inspection failed',
          },
        });
      }
    }
  );
}
