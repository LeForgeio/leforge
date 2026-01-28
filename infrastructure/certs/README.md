# SSL/TLS Certificates Directory

This directory is for storing SSL/TLS certificates for production deployments.

## Required Files

For Kong Gateway SSL:
- `server.crt` - Server certificate
- `server.key` - Server private key
- `admin.crt` - Admin API certificate (optional, can use same as server)
- `admin.key` - Admin API private key (optional)
- `ca.crt` - CA certificate (if using custom CA)

## Generating Self-Signed Certificates (Development Only)

```bash
# Generate CA key and certificate
openssl genrsa -out ca.key 4096
openssl req -new -x509 -days 365 -key ca.key -out ca.crt \
    -subj "/C=US/ST=State/L=City/O=LeForge/CN=LeForge CA"

# Generate server key and CSR
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr \
    -subj "/C=US/ST=State/L=City/O=LeForge/CN=localhost"

# Sign server certificate with CA
openssl x509 -req -days 365 -in server.csr -CA ca.crt -CAkey ca.key \
    -CAcreateserial -out server.crt

# Copy for admin API
cp server.crt admin.crt
cp server.key admin.key

# Cleanup
rm server.csr
```

## Production Recommendations

1. Use certificates from a trusted CA (Let's Encrypt, DigiCert, etc.)
2. Set proper file permissions: `chmod 600 *.key`
3. Rotate certificates before expiry
4. Use separate certificates for different services if required
5. Store private keys securely (consider using HashiCorp Vault or AWS Secrets Manager)

## File Permissions

```bash
chmod 600 *.key
chmod 644 *.crt
```

## Important Notes

- Never commit private keys to version control
- Add `*.key` and `*.crt` to `.gitignore` (already done)
- For production, use proper certificate management solutions
