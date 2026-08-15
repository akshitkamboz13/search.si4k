import { Request } from 'express';
import { EnvironmentDetector } from './EnvironmentDetector.js';
import { config } from '../config.js';

async function runEnvironmentDetectionTests() {
  console.log('====================================================');
  console.log(' Running Automatic Environment & Network Detection Tests');
  console.log('====================================================\n');

  const detector = new EnvironmentDetector();

  // Test 1: LAN Private IP Request
  console.log('1. Testing LAN Request Origin (IP: 192.168.1.50)...');
  const lanReq = {
    ip: '192.168.1.50',
    headers: {},
    socket: { remoteAddress: '192.168.1.50' },
  } as unknown as Request;

  const lanResult = detector.detectEnvironment(lanReq);
  console.log(`   Detected Environment: ${lanResult.environment} | Mode: ${lanResult.mode} | Public URL: ${lanResult.publicUrl}`);

  if (lanResult.environment !== 'local' || lanResult.mode !== 'local') {
    console.error('❌ Test 1 Failed! Expected environment=local, mode=local for 192.168.1.50');
    process.exit(1);
  }
  console.log('   ✅ PASS: LAN request correctly detected environment=local & mode=local.\n');

  // Test 2: Cloudflare / Public Internet Request
  console.log('2. Testing Cloudflare Request Origin (CF-Connecting-IP: 203.0.113.195)...');
  const cfReq = {
    ip: '172.70.100.5', // Cloudflare proxy IP
    headers: {
      'cf-connecting-ip': '203.0.113.195',
    },
    socket: { remoteAddress: '172.70.100.5' },
  } as unknown as Request;

  const cfResult = detector.detectEnvironment(cfReq);
  console.log(`   Detected Environment: ${cfResult.environment} | Mode: ${cfResult.mode} | Public URL: ${cfResult.publicUrl}`);

  if (cfResult.environment !== 'internet' || cfResult.mode !== 'online') {
    console.error('❌ Test 2 Failed! Expected environment=internet, mode=online for Cloudflare request');
    process.exit(1);
  }
  console.log('   ✅ PASS: Cloudflare public request correctly detected environment=internet & mode=online.\n');

  // Test 3: Client IP Header Spoofing Prevention
  console.log('3. Testing Header Spoofing Prevention (Attacker sends X-Si4k-Environment: local)...');
  const spoofReq = {
    ip: '203.0.113.195', // Public IP
    headers: {
      'x-si4k-environment': 'local',
      'cf-connecting-ip': '203.0.113.195',
    },
    socket: { remoteAddress: '203.0.113.195' },
  } as unknown as Request;

  const spoofResult = detector.detectEnvironment(spoofReq);
  console.log(`   Detected Environment: ${spoofResult.environment} | Mode: ${spoofResult.mode}`);

  if (spoofResult.environment !== 'internet' || spoofResult.mode !== 'online') {
    console.error('❌ Test 3 Failed! Spoofed browser header was not ignored.');
    process.exit(1);
  }
  console.log('   ✅ PASS: Browser spoofing header ignored. Server authoritative decision enforced.\n');

  // Test 4: Development Override
  console.log('4. Testing Development Overrides (ENVIRONMENT_OVERRIDE=local / internet)...');
  config.environment.override = 'local';
  const devLocalResult = detector.detectEnvironment(cfReq);
  console.log(`   Override=local -> Environment: ${devLocalResult.environment} | Mode: ${devLocalResult.mode}`);

  config.environment.override = 'internet';
  const devInternetResult = detector.detectEnvironment(lanReq);
  console.log(`   Override=internet -> Environment: ${devInternetResult.environment} | Mode: ${devInternetResult.mode}`);

  // Reset override
  config.environment.override = 'auto';

  if (devLocalResult.environment !== 'local' || devInternetResult.environment !== 'internet') {
    console.error('❌ Test 4 Failed! Development overrides not respected.');
    process.exit(1);
  }
  console.log('   ✅ PASS: Development overrides correctly executed.\n');

  console.log('====================================================');
  console.log(' ✅ ALL ENVIRONMENT DETECTION TESTS PASSED!');
  console.log('====================================================');
}

runEnvironmentDetectionTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
