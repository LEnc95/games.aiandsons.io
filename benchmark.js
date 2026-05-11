const { performance } = require("perf_hooks");
const { getFamilyAccountForUser, saveFamilyAccount, __resetFamilyStoreForTests } = require("./api/stripe/_family-store.js");

async function run() {
  __resetFamilyStoreForTests();

  // create 10,000 accounts
  for (let i = 0; i < 10000; i++) {
    await saveFamilyAccount(`fam_${i}`, { ownerUserId: `user_${i}`, members: [{ userId: `member_${i}` }] });
  }

  const start = performance.now();
  let found = 0;
  for (let i = 0; i < 1000; i++) {
    const account = await getFamilyAccountForUser(`member_${9000 + i}`);
    if (account) found++;
  }
  const end = performance.now();
  console.log(`Found ${found} accounts. Benchmark took: ${(end - start).toFixed(2)} ms`);
}

run().catch(console.error);
