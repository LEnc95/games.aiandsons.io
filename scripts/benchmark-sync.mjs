import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const _store = require("../api/stripe/_store.js");

// Ensure we mock the imported functions that handlers.js will use
require.cache[require.resolve("../api/stripe/_store.js")].exports = {
  ..._store,
  getStripeBillingProfile: async (userId) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          userId,
          entitlements: { familyPremium: true },
          activePlanId: "family-monthly",
        });
      }, 50);
    });
  },
  saveStripeBillingProfile: async (userId, data) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          userId,
          ...data,
        });
      }, 50);
    });
  }
};

const { syncFamilyMemberProfiles } = require("../api/stripe/_handlers.js");

async function runBenchmark() {
  const account = {
    id: "fam_123",
    ownerUserId: "user_0",
    seatLimit: 10,
    members: Array.from({ length: 10 }).map((_, i) => ({
      userId: `user_${i}`,
    })),
  };

  const ownerProfile = {
    userId: "user_0",
    entitlements: { familyPremium: true },
    activePlanId: "family-monthly",
  };

  console.log("Starting benchmark for syncFamilyMemberProfiles with 10 members...");
  const start = Date.now();
  await syncFamilyMemberProfiles(account, ownerProfile);
  const end = Date.now();

  console.log(`Execution time: ${end - start}ms`);
}

runBenchmark().catch(console.error);
