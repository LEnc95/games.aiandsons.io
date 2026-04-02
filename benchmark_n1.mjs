import { performance } from 'perf_hooks';

// Mock function representing clearFamilyAccessForUser
async function clearFamilyAccessForUser(userId) {
  return new Promise(resolve => setTimeout(resolve, 10)); // Simulate 10ms database latency
}

async function runSequential(members) {
  const start = performance.now();
  for (const member of members) {
    await clearFamilyAccessForUser(member.userId);
  }
  const end = performance.now();
  return end - start;
}

async function runParallel(members) {
  const start = performance.now();
  await Promise.all(members.map(member => clearFamilyAccessForUser(member.userId)));
  const end = performance.now();
  return end - start;
}

async function benchmark() {
  const members = Array.from({ length: 100 }).map((_, i) => ({ userId: `user_${i}` }));

  console.log('Running sequential test (Current Code)...');
  const seqTime = await runSequential(members);
  console.log(`Sequential time: ${seqTime.toFixed(2)} ms`);

  console.log('\nRunning parallel test (Optimized Code)...');
  const parTime = await runParallel(members);
  console.log(`Parallel time: ${parTime.toFixed(2)} ms`);

  console.log('\nImprovement:');
  console.log(`${(seqTime / parTime).toFixed(2)}x faster`);
}

benchmark().catch(console.error);
