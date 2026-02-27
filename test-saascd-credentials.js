#!/usr/bin/env node

/**
 * Test script to verify SaaS Custom Domains API credentials
 * Usage: node test-saascd-credentials.js
 */

require('dotenv').config();

const SAAS_CD_API_TOKEN = process.env.SAAS_CD_API_TOKEN;
const SAAS_CD_ACCOUNT_UUID = process.env.SAAS_CD_ACCOUNT_UUID;

if (!SAAS_CD_API_TOKEN || !SAAS_CD_ACCOUNT_UUID) {
  console.error('❌ Missing credentials in .env file');
  console.error(
    '   SAAS_CD_API_TOKEN:',
    SAAS_CD_API_TOKEN ? '✓ Set' : '✗ Missing',
  );
  console.error(
    '   SAAS_CD_ACCOUNT_UUID:',
    SAAS_CD_ACCOUNT_UUID ? '✓ Set' : '✗ Missing',
  );
  process.exit(1);
}

console.log('🔍 Testing SaaS Custom Domains API Credentials...\n');
console.log('Token:', SAAS_CD_API_TOKEN.substring(0, 8) + '...');
console.log('Account UUID:', SAAS_CD_ACCOUNT_UUID);
console.log('');

async function testCredentials() {
  const baseUrl = 'https://app.saascustomdomains.com/api/v1';
  const endpoints = [
    {
      name: 'List Upstreams',
      url: `${baseUrl}/accounts/${SAAS_CD_ACCOUNT_UUID}/upstreams`,
      method: 'GET',
    },
    {
      name: 'List Domains',
      url: `${baseUrl}/accounts/${SAAS_CD_ACCOUNT_UUID}/domains`,
      method: 'GET',
    },
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`📡 Testing: ${endpoint.name}`);
      console.log(`   ${endpoint.method} ${endpoint.url}`);

      const response = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: {
          Authorization: `Bearer ${SAAS_CD_API_TOKEN}`,
          Accept: 'application/json',
        },
      });

      console.log(`   Status: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ Success! Response:`, JSON.stringify(data, null, 2));
      } else {
        const errorText = await response.text();
        console.log(`   ❌ Error: ${errorText}`);

        if (response.status === 401) {
          console.log('\n⚠️  Authentication failed. Check:');
          console.log('   1. Token is correct and not revoked');
          console.log('   2. Token has proper permissions');
        } else if (response.status === 404) {
          console.log(
            '\n⚠️  Account UUID might be incorrect or account does not exist',
          );
        }
      }
    } catch (error) {
      console.log(`   ❌ Request failed: ${error.message}`);
    }
    console.log('');
  }
}

testCredentials()
  .then(() => {
    console.log('✅ Credential test complete!');
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
