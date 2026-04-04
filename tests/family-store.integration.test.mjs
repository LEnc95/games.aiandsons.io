import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { __resetFirebaseAdminForTests } = require("../api/_firebase-admin.js");
const {
  __resetFamilyStoreForTests,
  createDefaultFamilyAccount,
  ensureFamilyAccountForOwner,
  getFamilyAccountForUser,
  listFamilyInvitesForAccount,
  createFamilyInvite,
  getFamilyInviteByToken,
  acceptFamilyInvite,
  removeFamilyMember,
  createEmailDeliveryRecord,
  updateEmailDeliveryRecord,
  listEmailDeliveriesForFamilyAccount,
} = require("../api/stripe/_family-store.js");

const originalFirebaseEnv = {
  FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64,
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
};

test.beforeEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PRIVATE_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  __resetFirebaseAdminForTests();
  __resetFamilyStoreForTests();
});

test.after(() => {
  for (const [key, value] of Object.entries(originalFirebaseEnv)) {
    if (typeof value === "string") process.env[key] = value;
    else delete process.env[key];
  }
  __resetFirebaseAdminForTests();
  __resetFamilyStoreForTests();
});

test("createDefaultFamilyAccount returns a safe inactive baseline", () => {
  const account = createDefaultFamilyAccount("usr_owner");
  assert.deepEqual(account, {
    id: "",
    ownerUserId: "usr_owner",
    ownerEmail: "",
    ownerDisplayName: "",
    status: "inactive",
    planId: "",
    seatLimit: 5,
    seatCount: 0,
    pendingInviteCount: 0,
    memberUserIds: [],
    members: [],
    createdAt: 0,
    updatedAt: 0,
  });
});

test("family store provisions owner account and accepts invites", async () => {
  const account = await ensureFamilyAccountForOwner({
    ownerUserId: "usr_owner",
    ownerEmail: "parent@example.com",
    ownerDisplayName: "Parent",
    planId: "family-annual",
    status: "active",
    seatLimit: 5,
  });

  assert.equal(account.ownerUserId, "usr_owner");
  assert.equal(account.members.length, 1);
  assert.equal(account.members[0].role, "owner");

  const invite = await createFamilyInvite({
    familyAccountId: account.id,
    createdByUserId: "usr_owner",
    email: "kid@example.com",
    baseOrigin: "https://games.aiandsons.io",
  });

  assert.equal(invite.status, "pending");
  assert.equal(invite.email, "kid@example.com");
  assert.match(invite.inviteUrl, /familyInviteToken=/);

  const listed = await listFamilyInvitesForAccount(account.id);
  assert.equal(listed.length, 1);

  const accepted = await acceptFamilyInvite({
    token: invite.token,
    claimedByUserId: "usr_child",
    claimedByEmail: "kid@example.com",
    claimedByDisplayName: "Kid",
  });

  assert.equal(accepted.invite.status, "accepted");
  assert.equal(accepted.account.members.length, 2);
  assert.equal(accepted.account.members[1].userId, "usr_child");

  const familyForChild = await getFamilyAccountForUser("usr_child");
  assert.equal(familyForChild.id, account.id);
});

test("family store can remove members and track email deliveries", async () => {
  const account = await ensureFamilyAccountForOwner({
    ownerUserId: "usr_owner",
    ownerEmail: "parent@example.com",
    ownerDisplayName: "Parent",
    planId: "family-monthly",
    status: "active",
  });

  const invite = await createFamilyInvite({
    familyAccountId: account.id,
    createdByUserId: "usr_owner",
    email: "sibling@example.com",
    baseOrigin: "https://games.aiandsons.io",
  });
  await acceptFamilyInvite({
    token: invite.token,
    claimedByUserId: "usr_sibling",
    claimedByEmail: "sibling@example.com",
    claimedByDisplayName: "Sibling",
  });

  const trimmed = await removeFamilyMember({
    familyAccountId: account.id,
    memberUserId: "usr_sibling",
  });
  assert.equal(trimmed.members.length, 1);
  assert.equal(trimmed.members[0].userId, "usr_owner");

  const delivery = await createEmailDeliveryRecord({
    templateKey: "family-invite",
    familyAccountId: account.id,
    inviteId: invite.id,
    to: "sibling@example.com",
    subject: "Invite",
  });
  const updated = await updateEmailDeliveryRecord(delivery.id, {
    status: "sent",
    providerMessageId: "email_123",
  });
  assert.equal(updated.status, "sent");

  const deliveries = await listEmailDeliveriesForFamilyAccount(account.id);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].providerMessageId, "email_123");

  const loadedInvite = await getFamilyInviteByToken(invite.token);
  assert.equal(loadedInvite.status, "accepted");
});
