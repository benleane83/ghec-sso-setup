#!/usr/bin/env node

// Simple test script to verify the CLI works
const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 Testing GHEC SSO CLI...\n');

try {
  // Build the project
  console.log('📦 Building project...');
  execSync('npm run build', { stdio: 'inherit' });
  
  // Test help command
  console.log('\n📋 Testing help command...');
  execSync('node dist/index.js --help', { stdio: 'inherit' });
  
  console.log('\n✅ CLI test completed successfully!');
  console.log('\n🚀 To use the CLI:');
  console.log('   npm link                    # Install globally for testing');
  console.log('   ghec-sso --help            # See all commands');
  console.log('   ghec-sso auth login        # Start with authentication');
  console.log('   ghec-sso setup             # Run the setup wizard');
  
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
}
