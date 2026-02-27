# Test User Authentication Setup

## Quick Start

1. **Generate test user and auth token:**
   ```bash
   yarn seed:test-user
   ```

2. **Use the generated token** in your API requests by adding the Authorization header:
   ```
   Authorization: Bearer test-token
   ```

## What It Does

The seed script creates a test user in the database with the following details:
- **User ID:** `test-user-12345`
- **Email:** `test@example.com`
- **Wallet Address:** `0xTEST1234567890ABCDEF`
- **Username:** `testuser`
- **Plan:** FREE
- **Status:** ACTIVE

## Using the Token

### With cURL
```bash
curl -H "Authorization: Bearer test-token" \
  http://localhost:3000/your-endpoint
```

### With VS Code REST Client
Open [test-auth.http](./test-auth.http) and:
1. The `@token` variable is already set to `test-token`
2. Click "Send Request" on any endpoint

### With Postman
1. Create a new request
2. Go to "Authorization" tab
3. Select "Bearer Token" type
4. Enter `test-token`

## Token Details
- **Token:** `test-token` (simple string for easy testing)
- **Valid for:** Test user `test-user-12345` only
- **Expiration:** Never expires
- **Usage:** Development and testing only

## Regenerating Test User

If you need to recreate the test user:
```bash
yarn seed:test-user
```

The script is idempotent - it won't create duplicate users if one already exists.

## Environment Requirements

Make sure your `.env` file contains:
```env
DATABASE_URL=your-database-url
```

Note: `JWT_SECRET` is only needed if you use real JWT tokens. The `test-token` bypasses JWT verification for the test user.

## Files Created

- `prisma/seed-test-user.ts` - Seed script
- `test-auth.http` - VS Code REST Client test file with sample requests
- `TEST-USER-README.md` - This documentation

## Troubleshooting

**Error: Database connection failed**
- Check `DATABASE_URL` in `.env`
- Ensure database is running
- Run `yarn prisma generate` if Prisma client is not generated

**Token doesn't work**
- Ensure you're using exactly `test-token` (no extra spaces)
- Check that the test user exists in the database
- Verify the auth middleware is properly configured
