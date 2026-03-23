const crypto = require("crypto");

const { getFirestore, isFirebaseAdminConfigured } = require("../_firebase-admin");

const FIRESTORE_ACCOUNTS_COLLECTION = "familyAccounts";
const FIRESTORE_INVITES_COLLECTION = "familyInvites";
const FIRESTORE_EMAIL_COLLECTION = "emailDeliveries";
const DEFAULT_FAMILY_MAX_MEMBERS = 5;
const FAMILY_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const memoryState = (() => {
  if (!globalThis.__cadeFamilyStore) {
    globalThis.__cadeFamilyStore = {
      accounts: new Map(),
      invites: new Map(),
      emails: new Map(),
    };
  }
  return globalThis.__cadeFamilyStore;
})();

function makeId(prefix) {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

function normalizeText(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeText(value, 200).toLowerCase();
}

function normalizeTimestampMillis(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeCount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeMember(entry, fallbackRole = "member") {
  const raw = entry && typeof entry === "object" ? entry : {};
  return {
    userId: normalizeText(raw.userId, 160),
    email: normalizeEmail(raw.email),
    displayName: normalizeText(raw.displayName, 160),
    role: normalizeText(raw.role || fallbackRole, 40) || fallbackRole,
    invitedByUserId: normalizeText(raw.invitedByUserId, 160),
    joinedAt: normalizeTimestampMillis(raw.joinedAt),
  };
}

function sortMembers(members) {
  return [...members].sort((left, right) => {
    if (left.role === "owner" && right.role !== "owner") return -1;
    if (left.role !== "owner" && right.role === "owner") return 1;
    return left.joinedAt - right.joinedAt;
  });
}

function createDefaultFamilyAccount(ownerUserId = "") {
  return {
    id: "",
    ownerUserId: normalizeText(ownerUserId, 160),
    ownerEmail: "",
    ownerDisplayName: "",
    status: "inactive",
    planId: "",
    seatLimit: DEFAULT_FAMILY_MAX_MEMBERS,
    seatCount: 0,
    pendingInviteCount: 0,
    memberUserIds: [],
    members: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

function normalizeFamilyAccount(source, fallbackOwnerUserId = "") {
  const raw = source && typeof source === "object" ? source : {};
  const fallback = createDefaultFamilyAccount(fallbackOwnerUserId);
  const seenUserIds = new Set();
  const members = [];
  const memberSource = Array.isArray(raw.members) ? raw.members : [];
  for (const entry of memberSource) {
    const member = normalizeMember(entry);
    if (!member.userId || seenUserIds.has(member.userId)) continue;
    seenUserIds.add(member.userId);
    members.push(member);
  }

  const ownerUserId = normalizeText(raw.ownerUserId || fallback.ownerUserId, 160);
  const ownerEmail = normalizeEmail(raw.ownerEmail);
  const ownerDisplayName = normalizeText(raw.ownerDisplayName, 160);
  if (ownerUserId && !seenUserIds.has(ownerUserId)) {
    members.push({
      userId: ownerUserId,
      email: ownerEmail,
      displayName: ownerDisplayName,
      role: "owner",
      invitedByUserId: "",
      joinedAt: normalizeTimestampMillis(raw.createdAt) || Date.now(),
    });
    seenUserIds.add(ownerUserId);
  }

  const normalizedMembers = sortMembers(members.map((member) => {
    if (member.userId === ownerUserId) {
      return { ...member, role: "owner", email: member.email || ownerEmail, displayName: member.displayName || ownerDisplayName };
    }
    return { ...member, role: member.role === "owner" ? "member" : member.role };
  }));
  const memberUserIds = normalizedMembers.map((member) => member.userId);
  const seatLimit = Math.max(DEFAULT_FAMILY_MAX_MEMBERS, normalizeCount(raw.seatLimit) || DEFAULT_FAMILY_MAX_MEMBERS);
  const pendingInviteCount = normalizeCount(raw.pendingInviteCount);
  const createdAt = normalizeTimestampMillis(raw.createdAt);
  const updatedAt = normalizeTimestampMillis(raw.updatedAt);

  return {
    id: normalizeText(raw.id, 120),
    ownerUserId,
    ownerEmail,
    ownerDisplayName,
    status: normalizeText(raw.status, 40) || "inactive",
    planId: normalizeText(raw.planId, 80),
    seatLimit,
    seatCount: normalizedMembers.length,
    pendingInviteCount,
    memberUserIds,
    members: normalizedMembers,
    createdAt,
    updatedAt,
  };
}

function normalizeFamilyInvite(source) {
  const raw = source && typeof source === "object" ? source : {};
  return {
    id: normalizeText(raw.id, 120),
    token: normalizeText(raw.token || raw.id, 120),
    familyAccountId: normalizeText(raw.familyAccountId, 120),
    email: normalizeEmail(raw.email),
    status: normalizeText(raw.status, 40) || "pending",
    createdByUserId: normalizeText(raw.createdByUserId, 160),
    claimedByUserId: normalizeText(raw.claimedByUserId, 160),
    claimedByEmail: normalizeEmail(raw.claimedByEmail),
    inviteUrl: normalizeText(raw.inviteUrl, 1000),
    createdAt: normalizeTimestampMillis(raw.createdAt),
    updatedAt: normalizeTimestampMillis(raw.updatedAt),
    expiresAt: normalizeTimestampMillis(raw.expiresAt),
    acceptedAt: normalizeTimestampMillis(raw.acceptedAt),
    lastEmailDeliveryId: normalizeText(raw.lastEmailDeliveryId, 120),
  };
}

function normalizeEmailDelivery(source) {
  const raw = source && typeof source === "object" ? source : {};
  return {
    id: normalizeText(raw.id, 120),
    templateKey: normalizeText(raw.templateKey, 80),
    familyAccountId: normalizeText(raw.familyAccountId, 120),
    inviteId: normalizeText(raw.inviteId, 120),
    to: normalizeEmail(raw.to),
    subject: normalizeText(raw.subject, 200),
    status: normalizeText(raw.status, 40) || "pending",
    provider: normalizeText(raw.provider, 40) || "resend",
    providerMessageId: normalizeText(raw.providerMessageId, 200),
    error: normalizeText(raw.error, 500),
    createdAt: normalizeTimestampMillis(raw.createdAt),
    updatedAt: normalizeTimestampMillis(raw.updatedAt),
  };
}

function isFirestoreFamilyStoreEnabled() {
  return isFirebaseAdminConfigured();
}

function getFamilyCollections() {
  const firestore = getFirestore();
  return {
    accounts: firestore.collection(FIRESTORE_ACCOUNTS_COLLECTION),
    invites: firestore.collection(FIRESTORE_INVITES_COLLECTION),
    emails: firestore.collection(FIRESTORE_EMAIL_COLLECTION),
  };
}

function getMemoryAccountById(accountId) {
  const raw = memoryState.accounts.get(accountId);
  return raw ? normalizeFamilyAccount(raw) : null;
}

async function getFamilyAccount(accountId) {
  const normalizedId = normalizeText(accountId, 120);
  if (!normalizedId) return null;

  if (isFirestoreFamilyStoreEnabled()) {
    const snapshot = await getFamilyCollections().accounts.doc(normalizedId).get();
    if (!snapshot.exists) return null;
    return normalizeFamilyAccount(snapshot.data());
  }

  return getMemoryAccountById(normalizedId);
}

async function saveFamilyAccount(accountId, patch = {}) {
  const normalizedId = normalizeText(accountId || patch.id, 120) || makeId("fam");
  const existing = await getFamilyAccount(normalizedId);
  const base = existing || createDefaultFamilyAccount(normalizeText(patch.ownerUserId, 160));
  const next = normalizeFamilyAccount(
    {
      ...base,
      ...(patch && typeof patch === "object" ? patch : {}),
      id: normalizedId,
      updatedAt: Date.now(),
      createdAt: base.createdAt || Date.now(),
    },
    normalizeText(patch.ownerUserId || base.ownerUserId, 160),
  );

  if (isFirestoreFamilyStoreEnabled()) {
    await getFamilyCollections().accounts.doc(normalizedId).set(next, { merge: true });
  } else {
    memoryState.accounts.set(normalizedId, next);
  }

  return next;
}

async function getFamilyAccountForUser(userId) {
  const normalizedUserId = normalizeText(userId, 160);
  if (!normalizedUserId) return null;

  if (isFirestoreFamilyStoreEnabled()) {
    const snapshot = await getFamilyCollections().accounts
      .where("memberUserIds", "array-contains", normalizedUserId)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    return normalizeFamilyAccount(snapshot.docs[0].data());
  }

  for (const rawAccount of memoryState.accounts.values()) {
    const account = normalizeFamilyAccount(rawAccount);
    if (account.memberUserIds.includes(normalizedUserId)) {
      return account;
    }
  }
  return null;
}

function getDefaultFamilySeatLimit() {
  const configured = Number(process.env.FAMILY_PLAN_MAX_MEMBERS || DEFAULT_FAMILY_MAX_MEMBERS);
  if (!Number.isFinite(configured) || configured < 2) {
    return DEFAULT_FAMILY_MAX_MEMBERS;
  }
  return Math.floor(configured);
}

async function ensureFamilyAccountForOwner({
  ownerUserId,
  ownerEmail = "",
  ownerDisplayName = "",
  planId = "",
  status = "active",
  seatLimit = getDefaultFamilySeatLimit(),
} = {}) {
  const normalizedOwnerUserId = normalizeText(ownerUserId, 160);
  if (!normalizedOwnerUserId) {
    throw new Error("family_owner_required");
  }

  const existing = await getFamilyAccountForUser(normalizedOwnerUserId);
  const existingMembers = Array.isArray(existing?.members) ? existing.members : [];
  const ownerMember = existingMembers.find((member) => member.userId === normalizedOwnerUserId);

  return saveFamilyAccount(existing?.id, {
    ownerUserId: normalizedOwnerUserId,
    ownerEmail: ownerEmail || existing?.ownerEmail || ownerMember?.email || "",
    ownerDisplayName: ownerDisplayName || existing?.ownerDisplayName || ownerMember?.displayName || "",
    status,
    planId,
    seatLimit,
    members: existingMembers.length > 0
      ? existingMembers.map((member) => (
        member.userId === normalizedOwnerUserId
          ? {
            ...member,
            email: ownerEmail || member.email,
            displayName: ownerDisplayName || member.displayName,
            role: "owner",
          }
          : member
      ))
      : [{
        userId: normalizedOwnerUserId,
        email: ownerEmail,
        displayName: ownerDisplayName,
        role: "owner",
        invitedByUserId: "",
        joinedAt: Date.now(),
      }],
  });
}

async function getFamilyInviteByToken(token) {
  const normalizedToken = normalizeText(token, 120);
  if (!normalizedToken) return null;

  if (isFirestoreFamilyStoreEnabled()) {
    const snapshot = await getFamilyCollections().invites.doc(normalizedToken).get();
    if (!snapshot.exists) return null;
    return normalizeFamilyInvite(snapshot.data());
  }

  const raw = memoryState.invites.get(normalizedToken);
  return raw ? normalizeFamilyInvite(raw) : null;
}

async function saveFamilyInvite(token, patch = {}) {
  const normalizedToken = normalizeText(token || patch.token || patch.id, 120) || makeId("finv");
  const existing = await getFamilyInviteByToken(normalizedToken);
  const next = normalizeFamilyInvite({
    ...existing,
    ...(patch && typeof patch === "object" ? patch : {}),
    id: normalizedToken,
    token: normalizedToken,
    updatedAt: Date.now(),
    createdAt: existing?.createdAt || Date.now(),
  });

  if (isFirestoreFamilyStoreEnabled()) {
    await getFamilyCollections().invites.doc(normalizedToken).set(next, { merge: true });
  } else {
    memoryState.invites.set(normalizedToken, next);
  }
  return next;
}

async function listFamilyInvitesForAccount(familyAccountId) {
  const normalizedAccountId = normalizeText(familyAccountId, 120);
  if (!normalizedAccountId) return [];

  let invites = [];
  if (isFirestoreFamilyStoreEnabled()) {
    const snapshot = await getFamilyCollections().invites
      .where("familyAccountId", "==", normalizedAccountId)
      .limit(50)
      .get();
    invites = snapshot.docs.map((doc) => normalizeFamilyInvite(doc.data()));
  } else {
    invites = [...memoryState.invites.values()]
      .map((entry) => normalizeFamilyInvite(entry))
      .filter((invite) => invite.familyAccountId === normalizedAccountId);
  }

  return invites.sort((left, right) => right.createdAt - left.createdAt);
}

async function createFamilyInvite({
  familyAccountId,
  createdByUserId,
  email,
  baseOrigin,
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  const token = makeId("finv");
  const inviteUrl = `${String(baseOrigin || "").replace(/\/+$/, "") || "http://localhost"}/?familyInviteToken=${encodeURIComponent(token)}`;
  const invite = await saveFamilyInvite(token, {
    familyAccountId,
    email: normalizedEmail,
    status: "pending",
    createdByUserId: normalizeText(createdByUserId, 160),
    inviteUrl,
    expiresAt: Date.now() + FAMILY_INVITE_TTL_MS,
    acceptedAt: 0,
  });
  return invite;
}

async function acceptFamilyInvite({
  token,
  claimedByUserId,
  claimedByEmail,
  claimedByDisplayName = "",
} = {}) {
  const invite = await getFamilyInviteByToken(token);
  if (!invite) {
    throw new Error("family_invite_not_found");
  }
  if (invite.status === "accepted" && invite.claimedByUserId === normalizeText(claimedByUserId, 160)) {
    const account = await getFamilyAccount(invite.familyAccountId);
    return { invite, account, alreadyAccepted: true };
  }
  if (invite.status !== "pending") {
    throw new Error("family_invite_not_pending");
  }
  if (invite.expiresAt && invite.expiresAt < Date.now()) {
    await saveFamilyInvite(invite.token, { status: "expired" });
    throw new Error("family_invite_expired");
  }
  if (invite.email && normalizeEmail(claimedByEmail) !== invite.email) {
    throw new Error("family_invite_email_mismatch");
  }

  const account = await getFamilyAccount(invite.familyAccountId);
  if (!account) {
    throw new Error("family_account_not_found");
  }

  const normalizedUserId = normalizeText(claimedByUserId, 160);
  const alreadyMember = account.members.find((member) => member.userId === normalizedUserId);
  if (!alreadyMember && account.members.length >= account.seatLimit) {
    throw new Error("family_no_available_seats");
  }

  const nextMembers = alreadyMember
    ? account.members
    : [
      ...account.members,
      {
        userId: normalizedUserId,
        email: normalizeEmail(claimedByEmail),
        displayName: normalizeText(claimedByDisplayName, 160),
        role: "member",
        invitedByUserId: invite.createdByUserId,
        joinedAt: Date.now(),
      },
    ];

  const savedAccount = await saveFamilyAccount(account.id, { members: nextMembers });
  const savedInvite = await saveFamilyInvite(invite.token, {
    status: "accepted",
    claimedByUserId: normalizedUserId,
    claimedByEmail: normalizeEmail(claimedByEmail),
    acceptedAt: Date.now(),
  });

  return {
    invite: savedInvite,
    account: savedAccount,
    alreadyAccepted: Boolean(alreadyMember),
  };
}

async function removeFamilyMember({ familyAccountId, memberUserId } = {}) {
  const account = await getFamilyAccount(familyAccountId);
  if (!account) {
    throw new Error("family_account_not_found");
  }

  const normalizedMemberUserId = normalizeText(memberUserId, 160);
  if (!normalizedMemberUserId || normalizedMemberUserId === account.ownerUserId) {
    throw new Error("family_member_remove_invalid");
  }

  const nextMembers = account.members.filter((member) => member.userId !== normalizedMemberUserId);
  if (nextMembers.length === account.members.length) {
    return account;
  }

  return saveFamilyAccount(account.id, { members: nextMembers });
}

async function createEmailDeliveryRecord(patch = {}) {
  const id = makeId("mail");
  const next = normalizeEmailDelivery({
    ...patch,
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  if (isFirestoreFamilyStoreEnabled()) {
    await getFamilyCollections().emails.doc(id).set(next, { merge: true });
  } else {
    memoryState.emails.set(id, next);
  }
  return next;
}

async function updateEmailDeliveryRecord(id, patch = {}) {
  const normalizedId = normalizeText(id, 120);
  if (!normalizedId) return null;
  const existing = isFirestoreFamilyStoreEnabled()
    ? await (async () => {
      const snapshot = await getFamilyCollections().emails.doc(normalizedId).get();
      return snapshot.exists ? normalizeEmailDelivery(snapshot.data()) : null;
    })()
    : (memoryState.emails.has(normalizedId) ? normalizeEmailDelivery(memoryState.emails.get(normalizedId)) : null);

  const next = normalizeEmailDelivery({
    ...existing,
    ...patch,
    id: normalizedId,
    updatedAt: Date.now(),
    createdAt: existing?.createdAt || Date.now(),
  });
  if (isFirestoreFamilyStoreEnabled()) {
    await getFamilyCollections().emails.doc(normalizedId).set(next, { merge: true });
  } else {
    memoryState.emails.set(normalizedId, next);
  }
  return next;
}

async function listEmailDeliveriesForFamilyAccount(familyAccountId) {
  const normalizedAccountId = normalizeText(familyAccountId, 120);
  if (!normalizedAccountId) return [];
  let deliveries = [];
  if (isFirestoreFamilyStoreEnabled()) {
    const snapshot = await getFamilyCollections().emails
      .where("familyAccountId", "==", normalizedAccountId)
      .limit(25)
      .get();
    deliveries = snapshot.docs.map((doc) => normalizeEmailDelivery(doc.data()));
  } else {
    deliveries = [...memoryState.emails.values()]
      .map((entry) => normalizeEmailDelivery(entry))
      .filter((entry) => entry.familyAccountId === normalizedAccountId);
  }
  return deliveries.sort((left, right) => right.createdAt - left.createdAt);
}

function __resetFamilyStoreForTests() {
  memoryState.accounts.clear();
  memoryState.invites.clear();
  memoryState.emails.clear();
}

module.exports = {
  DEFAULT_FAMILY_MAX_MEMBERS,
  FAMILY_INVITE_TTL_MS,
  createDefaultFamilyAccount,
  normalizeFamilyAccount,
  normalizeFamilyInvite,
  getDefaultFamilySeatLimit,
  getFamilyAccount,
  getFamilyAccountForUser,
  saveFamilyAccount,
  ensureFamilyAccountForOwner,
  getFamilyInviteByToken,
  saveFamilyInvite,
  listFamilyInvitesForAccount,
  createFamilyInvite,
  acceptFamilyInvite,
  removeFamilyMember,
  createEmailDeliveryRecord,
  updateEmailDeliveryRecord,
  listEmailDeliveriesForFamilyAccount,
  __resetFamilyStoreForTests,
};
