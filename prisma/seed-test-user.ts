import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding test user...\n');

  const testUserId = 'test-user-12345';
  const testWalletAddress = '0xTEST1234567890ABCDEF';
  const testEmail = 'test@example.com';

  // Check if test user already exists
  const existingUser = await prisma.users.findUnique({
    where: { id: testUserId },
  });

  let user;

  if (existingUser) {
    console.log('✅ Test user already exists');
    user = existingUser;
  } else {
    // Create test user with Credits
    user = await prisma.users.create({
      data: {
        id: testUserId,
        walletAddress: testWalletAddress,
        email: testEmail,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        description: 'Test user for API testing',
        currentPlan: 'FREE',
        status: 'ACTIVE',
        Credits: {
          create: {
            availableCredits: 1000,
            creditUsage: 0,
            status: 'ACTIVE',
          },
        },
      },
    });

    console.log('✅ Test user created');
  }

  // Check if credits exist, create if missing
  const existingCredits = await prisma.credits.findUnique({
    where: { userId: user.id },
  });

  if (!existingCredits) {
    await prisma.credits.create({
      data: {
        userId: user.id,
        availableCredits: 1000,
        creditUsage: 0,
        status: 'ACTIVE',
      },
    });
    console.log('✅ Credits record created (1000 credits)');
  } else {
    console.log(`✅ Credits record exists (${existingCredits.availableCredits} credits)`);
  }

  console.log(`   ID: ${user.id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Wallet: ${user.walletAddress}\n`);

  const token = 'test-token';

  console.log('🔑 Test Authentication Token:');
  console.log('─'.repeat(80));
  console.log(token);
  console.log('─'.repeat(80));
  console.log('\n📋 Usage:');
  console.log('   Add this header to your API requests:');
  console.log(`   Authorization: Bearer ${token}\n`);
  
  console.log('📝 Example cURL command:');
  console.log(`   curl -H "Authorization: Bearer ${token}" http://localhost:3000/your-endpoint\n`);
  
  console.log('📝 Example .http file:');
  console.log('   ### Test Request');
  console.log('   GET http://localhost:3000/your-endpoint');
  console.log(`   Authorization: Bearer ${token}\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
