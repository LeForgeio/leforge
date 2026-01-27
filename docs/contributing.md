# Contributing to FlowForge

Thank you for your interest in contributing to FlowForge! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- **Be respectful**: Treat everyone with respect and consideration
- **Be constructive**: Provide helpful feedback and suggestions
- **Be inclusive**: Welcome newcomers and help them get started
- **Be patient**: Remember that everyone is learning

## Getting Started

### Finding Issues to Work On

- Look for issues labeled `good first issue` for beginner-friendly tasks
- Issues labeled `help wanted` are open for community contributions
- Check the project roadmap for larger features

### Reporting Bugs

1. Search existing issues to avoid duplicates
2. Use the bug report template
3. Include:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Docker version, etc.)
   - Logs if applicable

### Suggesting Features

1. Check if the feature is already requested
2. Use the feature request template
3. Explain the use case and benefits
4. Consider implementation details

## Development Setup

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+ (for Node.js services)
- Python 3.11+ (for Python services)
- Git

### Setup Steps

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/LeForgeio/leforge.git
cd flowforge

# 3. Add upstream remote
git remote add upstream https://github.com/LeForgeio/leforge.git

# 4. Copy environment file
cp .env.example .env

# 5. Start development environment
docker compose up -d

# 6. Install app dependencies for local development
cd app
npm install

# 7. Start the app in development mode
npm run dev
```

### Development Tools

- **Adminer**: Database management at http://localhost:8080
- **Redis Commander**: Redis management at http://localhost:8081

## Making Changes

### Branch Naming

Use descriptive branch names:

```
feature/add-pdf-merge-endpoint
fix/crypto-service-memory-leak
docs/update-api-reference
refactor/improve-error-handling
```

### Commit Messages

Follow the Conventional Commits specification:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(crypto-service): add AES-GCM encryption support

fix(math-service): handle division by zero error

docs(api-reference): add examples for vector service

test(pdf-service): add integration tests for merge endpoint
```

### Keeping Your Fork Updated

```bash
# Fetch upstream changes
git fetch upstream

# Rebase your branch
git checkout main
git rebase upstream/main

# Push to your fork
git push origin main
```

## Coding Standards

### Node.js (TypeScript) Services

```typescript
// Use TypeScript strict mode
// tsconfig.json: "strict": true

// Use meaningful variable names
const encryptionKey = generateKey(); // Good
const k = generateKey(); // Bad

// Use async/await over callbacks/promises
async function hashData(data: string): Promise<string> {
  const hash = await createHash(data);
  return hash;
}

// Document public APIs
/**
 * Encrypts data using AES-256-GCM
 * @param data - The data to encrypt
 * @param key - The encryption key (32 bytes)
 * @returns Encrypted data with IV and auth tag
 */
export function encrypt(data: string, key: Buffer): EncryptedData {
  // ...
}
```

### Python Services

```python
# Use type hints
def calculate_hash(data: str, algorithm: str = "sha256") -> str:
    """
    Calculate hash of input data.
    
    Args:
        data: The data to hash
        algorithm: Hash algorithm (default: sha256)
        
    Returns:
        Hexadecimal hash string
        
    Raises:
        ValueError: If algorithm is not supported
    """
    pass

# Use meaningful variable names
encryption_key = generate_key()  # Good
k = generate_key()  # Bad

# Use async where appropriate
async def fetch_embeddings(text: str) -> list[float]:
    async with httpx.AsyncClient() as client:
        response = await client.post(...)
    return response.json()
```

### API Design Guidelines

1. **Use RESTful conventions**
   - `GET` for retrieval
   - `POST` for creation/actions
   - `PUT` for full updates
   - `PATCH` for partial updates
   - `DELETE` for removal

2. **Consistent response format**
   ```json
   {
     "success": true,
     "data": {...},
     "requestId": "req-xxx"
   }
   ```

3. **Meaningful error messages**
   ```json
   {
     "success": false,
     "error": {
       "code": "VALIDATION_ERROR",
       "message": "Algorithm 'xyz' is not supported",
       "details": [...]
     }
   }
   ```

### File Structure

```
service-name/
├── src/
│   ├── index.ts          # Entry point
│   ├── routes/           # Route handlers
│   ├── middleware/       # Express middleware
│   ├── services/         # Business logic
│   ├── utils/            # Utility functions
│   └── types/            # TypeScript types
├── tests/
│   ├── unit/             # Unit tests
│   └── integration/      # Integration tests
├── Dockerfile
├── package.json
├── tsconfig.json
├── openapi.yaml
└── README.md
```

## Testing

### Running Tests

```bash
# Run all tests
./scripts/test.sh

# Run app tests
cd app
npm test

# Run with coverage
npm run test:coverage

# Run server-side tests only
npm run test:server
```

### Writing Tests

**Unit Tests (Node.js):**
```typescript
describe('HashService', () => {
  describe('hash()', () => {
    it('should generate SHA256 hash', async () => {
      const result = await hashService.hash('test', 'sha256');
      expect(result).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    });

    it('should throw error for unsupported algorithm', async () => {
      await expect(hashService.hash('test', 'invalid'))
        .rejects.toThrow('Unsupported algorithm');
    });
  });
});
```

**Unit Tests (Python):**
```python
class TestMathService:
    def test_calculate_expression(self):
        result = math_service.calculate("2 + 2")
        assert result == 4
    
    def test_calculate_with_variables(self):
        result = math_service.calculate("x + y", {"x": 1, "y": 2})
        assert result == 3
    
    def test_division_by_zero(self):
        with pytest.raises(ValueError):
            math_service.calculate("1 / 0")
```

### Test Coverage Requirements

- Minimum 80% code coverage for new code
- All public APIs must have tests
- Edge cases and error conditions must be tested

## Pull Request Process

### Before Submitting

1. [ ] Code compiles without errors
2. [ ] All tests pass
3. [ ] Code follows style guidelines
4. [ ] Documentation is updated
5. [ ] Commit messages follow conventions
6. [ ] Branch is up to date with main

### Submitting a PR

1. Push your branch to your fork
2. Open a PR against `upstream/main`
3. Fill out the PR template completely
4. Link related issues

### PR Review Process

1. Automated checks run (CI, linting, tests)
2. Maintainer reviews the code
3. Address feedback and make changes
4. Once approved, PR will be merged

### After Merge

- Delete your feature branch
- Update your local main branch
- Celebrate your contribution! 🎉

## Release Process

FlowForge uses semantic versioning (SemVer):

- **MAJOR**: Breaking API changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

Releases are automated via GitHub Actions when tags are pushed.

## Questions?

- Open a Discussion on GitHub
- Join our community chat
- Check existing documentation

Thank you for contributing to FlowForge! 🚀
