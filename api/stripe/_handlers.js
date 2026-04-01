const {
  getStripeClient,
  normalizeEmail,
  getQuery,
  sendJson,
  sendError,
  getPublicBillingConfig,
  listCustomerSubscriptions,
  summarizeEntitlementsFromProfile,
  summarizeEntitlementsFromSubscriptions,
  getConfiguredPlanPrices,
  getRequestOrigin,
  normalizePlanId,
  isLikelyEmail,
  sanitizeReturnUrl,
  readJsonBody,
  readRawBody,
  forwardWebhookEvent,
  getPastDueGracePeriodMs,
} = require("./_shared");
const { ensureSession } = require("../auth/_session");
const {
  getStripeBillingProfile,
  bindUserToStripeCustomer,
  saveStripeBillingProfile,
  getUserIdForStripeCustomer,
  findStripeBillingProfiles,
  hasProcessedStripeWebhookEvent,
  markStripeWebhookEventProcessed,
} = require("./_store");
const {
  FAMILY_INVITE_TTL_MS,
  getDefaultFamilySeatLimit,
  getFamilyAccount,
  getFamilyAccountForUser,
  ensureFamilyAccountForOwner,
  listFamilyInvitesForAccount,
  createFamilyInvite,
  getFamilyInviteByToken,
  acceptFamilyInvite,
  removeFamilyMember,
  listEmailDeliveries,
  listEmailDeliveriesForFamilyAccount,
  saveFamilyInvite,
  saveFamilyAccount,
} = require("./_family-store");
const { isAdminAuthorized } = require("./admin/_admin-auth");
const {
  sendBillingCancellationScheduledEmail,
  sendBillingPaymentConfirmedEmail,
  sendBillingPaymentFailedEmail,
  sendBillingSubscriptionEndedEmail,
  sendFamilyInviteEmail,
  sendFamilyInviteAcceptedEmail,
  sendFamilyMemberRemovedEmail,
} = require("../_email");

const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
]);

function normalizeId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTimestampMillis(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function toBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    return lowered === "1" || lowered === "true" || lowered === "yes";
  }
  return false;
}

function summarizeShape(source) {
  const raw = source && typeof source === "object" ? source : {};
  return {
    entitlements: {
      familyPremium: Boolean(raw.entitlements && raw.entitlements.familyPremium),
      schoolLicense: Boolean(raw.entitlements && raw.entitlements.schoolLicense),
    },
    activePlanId: typeof raw.activePlanId === "string" ? raw.activePlanId : "",
    subscriptions: Array.isArray(raw.subscriptions) ? raw.subscriptions : [],
    subscriptionStatus: typeof raw.subscriptionStatus === "string" ? raw.subscriptionStatus : "",
    currentPeriodEnd: Number(raw.currentPeriodEnd || 0),
    graceUntil: Number(raw.graceUntil || 0),
  };
}

function didSummaryChange(previousSummary, nextSummary) {
  const previous = summarizeShape(previousSummary);
  const next = summarizeShape(nextSummary);
  return JSON.stringify(previous) !== JSON.stringify(next);
}

function readCustomerIdFromEventObject(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.customer === "string") return payload.customer.trim();
  if (payload.customer && typeof payload.customer === "object" && typeof payload.customer.id === "string") {
    return payload.customer.id.trim();
  }
  return "";
}

function readUserIdFromCheckoutSession(sessionPayload) {
  if (!sessionPayload || typeof sessionPayload !== "object") return "";
  const metadataUserId = typeof sessionPayload?.metadata?.appUserId === "string"
    ? sessionPayload.metadata.appUserId.trim()
    : "";
  return metadataUserId;
}

function readCustomerEmailFromCheckoutSession(sessionPayload) {
  if (!sessionPayload || typeof sessionPayload !== "object") return "";
  const emailFromDetails = typeof sessionPayload?.customer_details?.email === "string"
    ? sessionPayload.customer_details.email
    : "";
  const emailFromSession = typeof sessionPayload?.customer_email === "string"
    ? sessionPayload.customer_email
    : "";
  return String(emailFromDetails || emailFromSession || "").trim().toLowerCase().slice(0, 160);
}

function readInvoiceIdFromEventObject(payload) {
  if (!payload || typeof payload !== "object") return "";
  return typeof payload.id === "string" ? payload.id.trim() : "";
}

function readInvoiceStatusFromEventObject(payload) {
  if (!payload || typeof payload !== "object") return "";
  return typeof payload.status === "string" ? payload.status.trim() : "";
}

function readEventTimestampMs(event) {
  return normalizeTimestampMillis(Number(event?.created || 0) * 1000);
}

function buildBillingSnapshotPatch(summary, existingProfile, overrides = {}) {
  const safeSummary = summary && typeof summary === "object" ? summary : {};
  const safeProfile = existingProfile && typeof existingProfile === "object" ? existingProfile : {};
  return {
    entitlements: safeSummary.entitlements || safeProfile.entitlements,
    subscriptions: Array.isArray(safeSummary.subscriptions) ? safeSummary.subscriptions : safeProfile.subscriptions,
    activePlanId: safeSummary.activePlanId || "",
    subscriptionId: safeSummary.subscriptionId || "",
    subscriptionStatus: safeSummary.subscriptionStatus || "",
    priceId: safeSummary.priceId || "",
    billingInterval: safeSummary.billingInterval || "",
    currentPeriodStart: Number(safeSummary.currentPeriodStart || 0),
    currentPeriodEnd: Number(safeSummary.currentPeriodEnd || 0),
    cancelAtPeriodEnd: Boolean(safeSummary.cancelAtPeriodEnd),
    cancelAt: Number(safeSummary.cancelAt || 0),
    canceledAt: Number(safeSummary.canceledAt || 0),
    trialEnd: Number(safeSummary.trialEnd || 0),
    latestInvoiceId: safeSummary.latestInvoiceId || safeProfile.latestInvoiceId || "",
    latestInvoiceStatus: safeSummary.latestInvoiceStatus || safeProfile.latestInvoiceStatus || "",
    lastPaymentFailureAt: Number(safeSummary.lastPaymentFailureAt || 0),
    graceUntil: Number(safeSummary.graceUntil || 0),
    seatLimit: Number(safeProfile.seatLimit || 0),
    seatCount: Number(safeProfile.seatCount || 0),
    familyAccountId: typeof safeProfile.familyAccountId === "string" ? safeProfile.familyAccountId : "",
    familyRole: typeof safeProfile.familyRole === "string" ? safeProfile.familyRole : "",
    familyOwnerUserId: typeof safeProfile.familyOwnerUserId === "string" ? safeProfile.familyOwnerUserId : "",
    notificationPrefs: safeProfile.notificationPrefs,
    ...overrides,
  };
}

function getDisplayNameFromSession(session) {
  if (session && typeof session.displayName === "string" && session.displayName.trim()) {
    return session.displayName.trim();
  }
  if (session && typeof session.email === "string" && session.email.includes("@")) {
    return session.email.split("@")[0];
  }
  return "";
}

function getFamilyAccessContext(profile) {
  const safeProfile = profile && typeof profile === "object" ? profile : {};
  const entitlements = safeProfile.entitlements && typeof safeProfile.entitlements === "object"
    ? safeProfile.entitlements
    : {};
  const planId = typeof safeProfile.activePlanId === "string" ? safeProfile.activePlanId : "";
  const familyPremium = Boolean(entitlements.familyPremium);
  const eligiblePlan = planId.startsWith("family-");
  return {
    entitled: familyPremium && eligiblePlan,
    planId: eligiblePlan ? planId : "",
    seatLimit: getDefaultFamilySeatLimit(),
  };
}

function isInvitePending(invite, now = Date.now()) {
  return invite && invite.status === "pending" && Number(invite.expiresAt || 0) > now;
}

async function reconcileFamilyInvitesForAccount(accountId) {
  const invites = await listFamilyInvitesForAccount(accountId);
  const now = Date.now();
  const out = [];
  for (const invite of invites) {
    if (invite.status === "pending" && Number(invite.expiresAt || 0) > 0 && Number(invite.expiresAt) <= now) {
      const expired = await saveFamilyInvite(invite.id, { status: "expired" });
      out.push(expired);
    } else {
      out.push(invite);
    }
  }
  return out;
}

function countReservedFamilySeats(account, invites) {
  const family = account && typeof account === "object" ? account : { members: [], seatLimit: 0 };
  const memberCount = Array.isArray(family.members) ? family.members.length : 0;
  const pendingInviteCount = Array.isArray(invites)
    ? invites.filter((invite) => isInvitePending(invite)).length
    : 0;
  return {
    memberCount,
    pendingInviteCount,
    reservedSeatCount: memberCount + pendingInviteCount,
  };
}

function requireAuthenticatedSession(req, res) {
  const session = ensureSession(req, res, { createIfMissing: true });
  if (!session || !session.userId || !session.isAuthenticated) {
    sendError(res, 401, "Google sign-in is required for family management.", "auth_required");
    return null;
  }
  return session;
}

async function clearFamilyAccessForUser(userId) {
  const existingProfile = await getStripeBillingProfile(userId);
  const entitlements = existingProfile.entitlements && typeof existingProfile.entitlements === "object"
    ? existingProfile.entitlements
    : {};
  const nextActivePlanId = entitlements.schoolLicense
    ? existingProfile.activePlanId
    : (existingProfile.customerId ? existingProfile.activePlanId : "");

  return saveStripeBillingProfile(userId, {
    entitlements: {
      familyPremium: false,
      schoolLicense: Boolean(entitlements.schoolLicense),
    },
    activePlanId: nextActivePlanId && !nextActivePlanId.startsWith("family-") ? nextActivePlanId : "",
    familyAccountId: "",
    familyRole: "",
    familyOwnerUserId: "",
    seatLimit: 0,
    seatCount: 0,
    lastSource: "family_access_cleared",
  });
}

async function syncFamilyMemberProfiles(account, ownerProfile) {
  if (!account || !account.id || !account.ownerUserId) {
    return null;
  }

  const familyAccess = getFamilyAccessContext(ownerProfile);
  const members = Array.isArray(account.members) ? account.members : [];

  const syncedMembers = await Promise.all(members.map(async (member) => {
    const existing = await getStripeBillingProfile(member.userId);
    const currentEntitlements = existing.entitlements && typeof existing.entitlements === "object"
      ? existing.entitlements
      : {};
    const isOwner = member.userId === account.ownerUserId;
    const familyPremium = isOwner
      ? Boolean(ownerProfile?.entitlements?.familyPremium)
      : familyAccess.entitled;
    const nextActivePlanId = familyPremium
      ? (familyAccess.planId || existing.activePlanId || "")
      : (currentEntitlements.schoolLicense && existing.activePlanId && !existing.activePlanId.startsWith("family-")
        ? existing.activePlanId
        : "");

    const saved = await saveStripeBillingProfile(member.userId, {
      entitlements: {
        familyPremium,
        schoolLicense: Boolean(currentEntitlements.schoolLicense),
      },
      activePlanId: nextActivePlanId,
      familyAccountId: account.id,
      familyRole: isOwner ? "owner" : "member",
      familyOwnerUserId: account.ownerUserId,
      seatLimit: account.seatLimit,
      seatCount: account.members.length,
      lastSource: isOwner ? "family_owner_sync" : "family_member_sync",
    });
    return saved;
  }));

  return syncedMembers;
}

async function provisionFamilyAccountForProfile({ userId, profile, session }) {
  const familyAccess = getFamilyAccessContext(profile);
  let account = await getFamilyAccountForUser(userId);

  if (familyAccess.entitled) {
    if (account && account.ownerUserId && account.ownerUserId !== userId) {
      return account;
    }
    account = await ensureFamilyAccountForOwner({
      ownerUserId: userId,
      ownerEmail: session?.email || profile.customerEmail || account?.ownerEmail || "",
      ownerDisplayName: getDisplayNameFromSession(session) || account?.ownerDisplayName || "",
      planId: familyAccess.planId,
      status: "active",
      seatLimit: familyAccess.seatLimit,
    });
    await syncFamilyMemberProfiles(account, profile);
    return account;
  }

  if (!account || account.ownerUserId !== userId) {
    return account;
  }

  const inactiveAccount = await saveFamilyAccount(account.id, {
    status: "inactive",
    planId: "",
  });

  const nonOwnerMembers = inactiveAccount.members.filter((member) => member.userId !== inactiveAccount.ownerUserId);
  for (const member of nonOwnerMembers) {
    await clearFamilyAccessForUser(member.userId);
  }
  await saveStripeBillingProfile(userId, {
    familyAccountId: inactiveAccount.id,
    familyRole: "owner",
    familyOwnerUserId: inactiveAccount.ownerUserId,
    seatLimit: inactiveAccount.seatLimit,
    seatCount: inactiveAccount.members.length,
    lastSource: "family_owner_sync",
  });
  return inactiveAccount;
}

async function buildFamilySummary(session) {
  const profile = await getStripeBillingProfile(session.userId);
  const account = await provisionFamilyAccountForProfile({
    userId: session.userId,
    profile,
    session,
  }) || await getFamilyAccountForUser(session.userId);
  const emailDeliveries = account ? await listEmailDeliveriesForFamilyAccount(account.id) : [];
  const invites = account && account.ownerUserId === session.userId
    ? await reconcileFamilyInvitesForAccount(account.id)
    : [];
  const deliveriesById = new Map(emailDeliveries.map((delivery) => [delivery.id, delivery]));
  const invitesWithDelivery = invites.map((invite) => ({
    ...invite,
    lastEmailDelivery: invite.lastEmailDeliveryId ? (deliveriesById.get(invite.lastEmailDeliveryId) || null) : null,
    copyable: Boolean(invite.inviteUrl),
  }));
  const seatCounts = countReservedFamilySeats(account, invitesWithDelivery);

  return {
    profile,
    account,
    invites: invitesWithDelivery,
    emailDeliveries,
    payload: {
      ok: true,
      userId: session.userId,
      isAuthenticated: true,
      billing: {
        ...summarizeEntitlementsFromProfile(profile),
        customerEmail: profile.customerEmail || "",
      },
      family: account ? {
        id: account.id,
        ownerUserId: account.ownerUserId,
        ownerEmail: account.ownerEmail,
        ownerDisplayName: account.ownerDisplayName,
        status: account.status,
        planId: account.planId,
        seatLimit: account.seatLimit,
        seatCount: account.members.length,
        pendingInviteCount: seatCounts.pendingInviteCount,
        reservedSeatCount: seatCounts.reservedSeatCount,
        seatsRemaining: Math.max(0, account.seatLimit - seatCounts.reservedSeatCount),
        members: account.members,
        invites: invitesWithDelivery,
        recentEmailDeliveries: emailDeliveries.slice(0, 5),
      } : null,
    },
  };
}

async function deliverFamilyInviteEmail({ invite, account, session }) {
  const emailResult = await sendFamilyInviteEmail({
    to: invite.email,
    inviteUrl: invite.inviteUrl,
    inviterName: getDisplayNameFromSession(session),
    familyPlanLabel: account.planId || "Family plan",
    expiresAt: invite.expiresAt || (Date.now() + FAMILY_INVITE_TTL_MS),
    familyAccountId: account.id,
    inviteId: invite.id,
  });

  if (emailResult?.delivery?.id) {
    const updatedInvite = await saveFamilyInvite(invite.id, {
      lastEmailDeliveryId: emailResult.delivery.id,
    });
    return {
      invite: updatedInvite,
      emailResult,
    };
  }

  return {
    invite,
    emailResult,
  };
}

function canSendBillingEmail(profile, preferenceKey = "billingEmail") {
  const prefs = profile && typeof profile.notificationPrefs === "object"
    ? profile.notificationPrefs
    : {};
  return prefs[preferenceKey] !== false;
}

function mergeDeliveryLists(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const delivery of Array.isArray(list) ? list : []) {
      if (!delivery || !delivery.id || seen.has(delivery.id)) continue;
      seen.add(delivery.id);
      out.push(delivery);
    }
  }
  return out.sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
}

async function maybeSendBillingLifecycleEmails({
  event,
  previousProfile,
  nextProfile,
  userId = "",
  customerId = "",
} = {}) {
  const safePrevious = previousProfile && typeof previousProfile === "object" ? previousProfile : {};
  const safeNext = nextProfile && typeof nextProfile === "object" ? nextProfile : {};
  const recipient = normalizeEmail(safeNext.customerEmail || safePrevious.customerEmail);
  if (!recipient || !canSendBillingEmail(safeNext, "billingEmail")) {
    return [];
  }

  const shared = {
    to: recipient,
    planId: safeNext.activePlanId || safePrevious.activePlanId || "",
    familyAccountId: safeNext.familyAccountId || safePrevious.familyAccountId || "",
    userId: userId || safeNext.userId || safePrevious.userId || "",
    customerId: customerId || safeNext.customerId || safePrevious.customerId || "",
    subscriptionId: safeNext.subscriptionId || safePrevious.subscriptionId || "",
    invoiceId: safeNext.latestInvoiceId || safePrevious.latestInvoiceId || "",
    eventId: normalizeId(event?.id),
  };

  switch (event?.type) {
    case "invoice.payment_failed":
      if (safeNext.subscriptionStatus === "past_due" || Number(safeNext.graceUntil || 0) > Date.now()) {
        return [await sendBillingPaymentFailedEmail({
          ...shared,
          graceUntil: safeNext.graceUntil || safePrevious.graceUntil || 0,
        })];
      }
      return [];
    case "invoice.paid":
      return [await sendBillingPaymentConfirmedEmail({
        ...shared,
        currentPeriodEnd: safeNext.currentPeriodEnd || safePrevious.currentPeriodEnd || 0,
      })];
    case "customer.subscription.updated":
      if (!Boolean(safePrevious.cancelAtPeriodEnd) && Boolean(safeNext.cancelAtPeriodEnd)) {
        return [await sendBillingCancellationScheduledEmail({
          ...shared,
          currentPeriodEnd: safeNext.currentPeriodEnd || safePrevious.currentPeriodEnd || 0,
        })];
      }
      return [];
    case "customer.subscription.deleted":
      return [await sendBillingSubscriptionEndedEmail(shared)];
    default:
      return [];
  }
}

async function buildBillingAdminRecord(profile) {
  const safeProfile = profile && typeof profile === "object" ? profile : null;
  if (!safeProfile || !safeProfile.userId) return null;

  const familyAccount = safeProfile.familyAccountId
    ? await getFamilyAccount(safeProfile.familyAccountId)
    : await getFamilyAccountForUser(safeProfile.userId);
  const invites = familyAccount ? await reconcileFamilyInvitesForAccount(familyAccount.id) : [];
  const userDeliveries = await listEmailDeliveries({
    userId: safeProfile.userId,
    limit: 25,
  });
  const customerDeliveries = safeProfile.customerId
    ? await listEmailDeliveries({ customerId: safeProfile.customerId, limit: 25 })
    : [];
  const familyDeliveries = familyAccount
    ? await listEmailDeliveries({ familyAccountId: familyAccount.id, limit: 25 })
    : [];
  const emailDeliveries = mergeDeliveryLists(userDeliveries, customerDeliveries, familyDeliveries);

  return {
    userId: safeProfile.userId,
    billing: summarizeEntitlementsFromProfile(safeProfile),
    profile: safeProfile,
    family: familyAccount ? {
      id: familyAccount.id,
      ownerUserId: familyAccount.ownerUserId,
      ownerEmail: familyAccount.ownerEmail,
      ownerDisplayName: familyAccount.ownerDisplayName,
      status: familyAccount.status,
      planId: familyAccount.planId,
      seatLimit: familyAccount.seatLimit,
      seatCount: familyAccount.seatCount,
      pendingInviteCount: familyAccount.pendingInviteCount,
      members: familyAccount.members,
      invites,
      recentEmailDeliveries: emailDeliveries.slice(0, 10),
    } : null,
    emailDeliveries,
  };
}

function applyEventDerivedBillingState(summary, event, existingProfile) {
  const safeSummary = summary && typeof summary === "object" ? summary : {};
  const safeProfile = existingProfile && typeof existingProfile === "object" ? existingProfile : {};
  const payload = event && event.data ? event.data.object : null;
  const eventTimestampMs = readEventTimestampMs(event);
  const invoiceId = readInvoiceIdFromEventObject(payload);
  const invoiceStatus = readInvoiceStatusFromEventObject(payload);
  const patch = {
    ...safeSummary,
    latestInvoiceId: safeSummary.latestInvoiceId || safeProfile.latestInvoiceId || "",
    latestInvoiceStatus: safeSummary.latestInvoiceStatus || safeProfile.latestInvoiceStatus || "",
    lastPaymentFailureAt: Number(safeSummary.lastPaymentFailureAt || safeProfile.lastPaymentFailureAt || 0),
    graceUntil: Number(safeSummary.graceUntil || safeProfile.graceUntil || 0),
  };

  switch (event?.type) {
    case "invoice.payment_failed": {
      patch.latestInvoiceId = invoiceId || patch.latestInvoiceId;
      patch.latestInvoiceStatus = invoiceStatus || patch.latestInvoiceStatus || "open";
      patch.lastPaymentFailureAt = eventTimestampMs || patch.lastPaymentFailureAt;
      if (patch.subscriptionStatus === "past_due" || typeof payload?.subscription === "string") {
        const baseFailureAt = patch.lastPaymentFailureAt || eventTimestampMs || Date.now();
        patch.graceUntil = Math.max(Number(patch.graceUntil || 0), baseFailureAt + getPastDueGracePeriodMs());
      }
      break;
    }
    case "invoice.paid": {
      patch.latestInvoiceId = invoiceId || patch.latestInvoiceId;
      patch.latestInvoiceStatus = invoiceStatus || patch.latestInvoiceStatus || "paid";
      patch.lastPaymentFailureAt = 0;
      patch.graceUntil = 0;
      break;
    }
    case "customer.subscription.deleted": {
      patch.graceUntil = 0;
      patch.lastPaymentFailureAt = 0;
      break;
    }
    default: {
      if (patch.subscriptionStatus !== "past_due") {
        patch.graceUntil = 0;
        if (patch.subscriptionStatus === "active" || patch.subscriptionStatus === "trialing") {
          patch.lastPaymentFailureAt = 0;
        }
      }
      break;
    }
  }

  return patch;
}

async function syncCustomerBillingProfile({ stripe, userId, customerId, customerEmail = "", source = "", existingProfile = null, event = null }) {
  const profile = existingProfile || await getStripeBillingProfile(userId);
  const subscriptions = await listCustomerSubscriptions(stripe, customerId);
  const summary = summarizeEntitlementsFromSubscriptions(subscriptions, undefined, {
    graceUntil: profile.graceUntil,
    lastPaymentFailureAt: profile.lastPaymentFailureAt,
  });
  const enrichedSummary = event
    ? applyEventDerivedBillingState(summary, event, profile)
    : summary;

  const savedProfile = await saveStripeBillingProfile(userId, buildBillingSnapshotPatch(enrichedSummary, profile, {
    customerId,
    customerEmail: customerEmail || profile.customerEmail,
    lastSource: source,
  }));
  await provisionFamilyAccountForProfile({ userId, profile: savedProfile });

  return {
    subscriptions,
    summary: summarizeEntitlementsFromProfile(await getStripeBillingProfile(userId)),
    profile: await getStripeBillingProfile(userId),
  };
}

async function processHandledEvent(stripe, event) {
  const payload = event && event.data ? event.data.object : null;
  const customerId = readCustomerIdFromEventObject(payload);
  let userId = "";
  let customerEmail = "";

  if (event.type === "checkout.session.completed") {
    userId = readUserIdFromCheckoutSession(payload);
    customerEmail = readCustomerEmailFromCheckoutSession(payload);
    if (userId && customerId) {
      await bindUserToStripeCustomer({ userId, customerId, customerEmail });
    }
  }

  if (!userId && customerId) {
    userId = await getUserIdForStripeCustomer(customerId);
  }

  if (!customerId || !userId) {
    return {
      customerId,
      userId,
      customerBound: false,
      summary: null,
    };
  }

  const existingProfile = await getStripeBillingProfile(userId);
  const sync = await syncCustomerBillingProfile({
    stripe,
    userId,
    customerId,
    customerEmail: customerEmail || existingProfile.customerEmail,
    source: `webhook:${event.type}`,
    existingProfile,
    event,
  });

  await maybeSendBillingLifecycleEmails({
    event,
    previousProfile: existingProfile,
    nextProfile: sync.profile,
    userId,
    customerId,
  });

  return {
    customerId,
    userId,
    customerBound: true,
    summary: sync.summary,
  };
}

async function handleFamilySummary(req, res) {
  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const session = requireAuthenticatedSession(req, res);
  if (!session) return;

  try {
    const summary = await buildFamilySummary(session);
    return sendJson(res, 200, summary.payload);
  } catch (error) {
    return sendError(res, 500, "Could not load family account summary.", "family_summary_failed", {
      message: String(error?.message || error),
    });
  }
}

async function handleFamilyInvite(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const session = requireAuthenticatedSession(req, res);
  if (!session) return;

  try {
    const profile = await getStripeBillingProfile(session.userId);
    const familyAccess = getFamilyAccessContext(profile);
    if (!familyAccess.entitled) {
      return sendError(res, 403, "An active family subscription is required before inviting members.", "family_plan_required");
    }

    const account = await provisionFamilyAccountForProfile({
      userId: session.userId,
      profile,
      session,
    });
    if (!account || account.ownerUserId !== session.userId) {
      return sendError(res, 403, "Only the family account owner can invite members.", "family_owner_required");
    }

    const body = await readJsonBody(req);
    const inviteEmail = normalizeEmail(body.email);
    if (!isLikelyEmail(inviteEmail)) {
      return sendError(res, 400, "A valid email address is required for family invites.", "invalid_invite_email");
    }
    if (inviteEmail === normalizeEmail(session.email)) {
      return sendError(res, 400, "Use a different email address for invited family members.", "invite_self_not_allowed");
    }

    const existingMember = account.members.find((member) => normalizeEmail(member.email) === inviteEmail);
    if (existingMember) {
      return sendError(res, 409, "That email is already part of this family account.", "family_member_exists");
    }

    const invites = await reconcileFamilyInvitesForAccount(account.id);
    const activePendingInvite = invites.find((invite) => (
      isInvitePending(invite) &&
      invite.email === inviteEmail
    ));
    const seatCounts = countReservedFamilySeats(account, invites);
    if (!activePendingInvite && seatCounts.reservedSeatCount >= account.seatLimit) {
      return sendError(res, 409, "All family seats are currently used or reserved by pending invites.", "family_no_available_seats");
    }

    const baseOrigin = getRequestOrigin(req);
    const invite = activePendingInvite || await createFamilyInvite({
      familyAccountId: account.id,
      createdByUserId: session.userId,
      email: inviteEmail,
      baseOrigin,
    });

    const delivery = await deliverFamilyInviteEmail({ invite, account, session });
    const updatedInvite = delivery.invite;
    const emailResult = delivery.emailResult;

    const refreshed = await buildFamilySummary(session);
    return sendJson(res, 200, {
      ok: true,
      invite: refreshed.invites?.find((entry) => entry.id === updatedInvite.id) || updatedInvite,
      email: emailResult,
      ...refreshed.payload,
    });
  } catch (error) {
    return sendError(res, 500, "Could not create family invite.", "family_invite_failed", {
      message: String(error?.message || error),
    });
  }
}

async function handleFamilyAcceptInvite(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const session = requireAuthenticatedSession(req, res);
  if (!session) return;

  try {
    const body = await readJsonBody(req);
    const token = normalizeId(body.token);
    if (!token) {
      return sendError(res, 400, "Invite token is required.", "family_invite_token_required");
    }

    const invite = await getFamilyInviteByToken(token);
    if (!invite) {
      return sendError(res, 404, "That family invite could not be found.", "family_invite_not_found");
    }

    const accepted = await acceptFamilyInvite({
      token,
      claimedByUserId: session.userId,
      claimedByEmail: session.email,
      claimedByDisplayName: getDisplayNameFromSession(session),
    });
    const ownerProfile = await getStripeBillingProfile(accepted.account.ownerUserId);
    await syncFamilyMemberProfiles(accepted.account, ownerProfile);
    if (accepted.account.ownerEmail) {
      await sendFamilyInviteAcceptedEmail({
        to: accepted.account.ownerEmail,
        memberName: getDisplayNameFromSession(session) || session.email,
        familyAccountId: accepted.account.id,
      });
    }

    const summary = await buildFamilySummary(session);
    return sendJson(res, 200, {
      ok: true,
      invite: accepted.invite,
      alreadyAccepted: Boolean(accepted.alreadyAccepted),
      ...summary.payload,
    });
  } catch (error) {
    const code = String(error?.message || error);
    const mapped = {
      family_invite_email_mismatch: { status: 403, message: "Sign in with the same email address that received the invite." },
      family_invite_expired: { status: 410, message: "That family invite has expired." },
      family_no_available_seats: { status: 409, message: "This family plan has no seats available right now." },
      family_invite_not_pending: { status: 409, message: "That family invite can no longer be accepted." },
      family_account_not_found: { status: 404, message: "The family account linked to this invite no longer exists." },
    }[code];
    if (mapped) {
      return sendError(res, mapped.status, mapped.message, code);
    }
    return sendError(res, 500, "Could not accept family invite.", "family_accept_failed", {
      message: code,
    });
  }
}

async function handleFamilyRemoveMember(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const session = requireAuthenticatedSession(req, res);
  if (!session) return;

  try {
    const summary = await buildFamilySummary(session);
    const account = summary.account;
    if (!account || account.ownerUserId !== session.userId) {
      return sendError(res, 403, "Only the family account owner can remove members.", "family_owner_required");
    }

    const body = await readJsonBody(req);
    const memberUserId = normalizeId(body.memberUserId);
    if (!memberUserId) {
      return sendError(res, 400, "Member userId is required.", "family_member_required");
    }

    const removedMember = Array.isArray(account.members)
      ? account.members.find((member) => member.userId === memberUserId)
      : null;

    const nextAccount = await removeFamilyMember({
      familyAccountId: account.id,
      memberUserId,
    });
    const removedProfile = await clearFamilyAccessForUser(memberUserId);
    const ownerProfile = await getStripeBillingProfile(session.userId);
    await syncFamilyMemberProfiles(nextAccount, ownerProfile);
    if (removedMember?.email && canSendBillingEmail(removedProfile, "productEmail")) {
      await sendFamilyMemberRemovedEmail({
        to: removedMember.email,
        memberName: removedMember.displayName || removedMember.email || removedMember.userId,
        familyAccountId: account.id,
        userId: memberUserId,
      });
    }

    const refreshed = await buildFamilySummary(session);
    return sendJson(res, 200, {
      ok: true,
      removedUserId: memberUserId,
      ...refreshed.payload,
    });
  } catch (error) {
    const code = String(error?.message || error);
    if (code === "family_member_remove_invalid") {
      return sendError(res, 400, "That member cannot be removed from the family account.", code);
    }
    return sendError(res, 500, "Could not remove family member.", "family_remove_failed", {
      message: code,
    });
  }
}

async function handleAdminLookup(req, res) {
  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const auth = isAdminAuthorized(req);
  if (!auth.ok) {
    const status = auth.reason === "admin_token_not_configured" ? 503 : 401;
    const message = auth.reason === "admin_token_missing"
      ? "Admin token is required."
      : auth.reason === "admin_token_not_configured"
        ? "Stripe admin token is not configured."
        : "Admin token is invalid.";
    return sendError(res, status, message, auth.reason);
  }

  try {
    const query = getQuery(req);
    const lookup = {
      userId: normalizeId(query.userId),
      customerId: normalizeId(query.customerId),
      customerEmail: normalizeEmail(query.customerEmail),
      familyAccountId: normalizeId(query.familyAccountId),
    };

    if (!lookup.userId && !lookup.customerId && !lookup.customerEmail && !lookup.familyAccountId) {
      return sendError(res, 400, "Provide a userId, customerId, customerEmail, or familyAccountId.", "billing_lookup_query_required");
    }

    const profiles = [];
    const seenUserIds = new Set();
    const addProfile = (profile) => {
      if (!profile || !profile.userId || seenUserIds.has(profile.userId)) return;
      seenUserIds.add(profile.userId);
      profiles.push(profile);
    };

    for (const profile of await findStripeBillingProfiles({
      userId: lookup.userId,
      customerId: lookup.customerId,
      customerEmail: lookup.customerEmail,
      limit: 10,
    })) {
      addProfile(profile);
    }

    let lookedUpFamilyAccount = null;
    if (lookup.familyAccountId) {
      lookedUpFamilyAccount = await getFamilyAccount(lookup.familyAccountId);
      if (!lookedUpFamilyAccount) {
        return sendError(res, 404, "That family account could not be found.", "family_account_not_found");
      }
      const memberUserIds = new Set([
        lookedUpFamilyAccount.ownerUserId,
        ...((Array.isArray(lookedUpFamilyAccount.members) ? lookedUpFamilyAccount.members : []).map((member) => member.userId)),
      ]);
      for (const memberUserId of memberUserIds) {
        if (!memberUserId) continue;
        addProfile(await getStripeBillingProfile(memberUserId));
      }
    }

    const matches = [];
    for (const profile of profiles) {
      const record = await buildBillingAdminRecord(profile);
      if (record) matches.push(record);
    }

    const familyAccount = lookedUpFamilyAccount ? {
      id: lookedUpFamilyAccount.id,
      ownerUserId: lookedUpFamilyAccount.ownerUserId,
      ownerEmail: lookedUpFamilyAccount.ownerEmail,
      ownerDisplayName: lookedUpFamilyAccount.ownerDisplayName,
      status: lookedUpFamilyAccount.status,
      planId: lookedUpFamilyAccount.planId,
      seatLimit: lookedUpFamilyAccount.seatLimit,
      seatCount: lookedUpFamilyAccount.seatCount,
      pendingInviteCount: lookedUpFamilyAccount.pendingInviteCount,
      members: lookedUpFamilyAccount.members,
      invites: await reconcileFamilyInvitesForAccount(lookedUpFamilyAccount.id),
      recentEmailDeliveries: await listEmailDeliveries({ familyAccountId: lookedUpFamilyAccount.id, limit: 25 }),
    } : null;

    return sendJson(res, 200, {
      ok: true,
      query: lookup,
      resultCount: matches.length,
      matches,
      familyAccount,
    });
  } catch (error) {
    return sendError(res, 500, "Billing lookup failed.", "billing_lookup_failed", {
      message: String(error?.message || error),
    });
  }
}

async function handleFamilyResendInvite(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const session = requireAuthenticatedSession(req, res);
  if (!session) return;

  try {
    const summary = await buildFamilySummary(session);
    const account = summary.account;
    if (!account || account.ownerUserId !== session.userId) {
      return sendError(res, 403, "Only the family account owner can resend invites.", "family_owner_required");
    }

    const body = await readJsonBody(req);
    const inviteId = normalizeId(body.inviteId);
    if (!inviteId) {
      return sendError(res, 400, "Invite id is required.", "family_invite_id_required");
    }

    const invite = await getFamilyInviteByToken(inviteId);
    if (!invite || invite.familyAccountId !== account.id) {
      return sendError(res, 404, "That family invite could not be found.", "family_invite_not_found");
    }
    if (invite.status !== "pending") {
      return sendError(res, 409, "Only pending invites can be resent.", "family_invite_not_pending");
    }
    if (!isInvitePending(invite)) {
      await saveFamilyInvite(invite.id, { status: "expired" });
      return sendError(res, 410, "That family invite has expired. Create a fresh invite instead.", "family_invite_expired");
    }

    const delivery = await deliverFamilyInviteEmail({ invite, account, session });
    const refreshed = await buildFamilySummary(session);
    return sendJson(res, 200, {
      ok: true,
      invite: refreshed.invites?.find((entry) => entry.id === invite.id) || delivery.invite,
      email: delivery.emailResult,
      ...refreshed.payload,
    });
  } catch (error) {
    return sendError(res, 500, "Could not resend the family invite.", "family_resend_failed", {
      message: String(error?.message || error),
    });
  }
}

async function handleFamilyRevokeInvite(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const session = requireAuthenticatedSession(req, res);
  if (!session) return;

  try {
    const summary = await buildFamilySummary(session);
    const account = summary.account;
    if (!account || account.ownerUserId !== session.userId) {
      return sendError(res, 403, "Only the family account owner can revoke invites.", "family_owner_required");
    }

    const body = await readJsonBody(req);
    const inviteId = normalizeId(body.inviteId);
    if (!inviteId) {
      return sendError(res, 400, "Invite id is required.", "family_invite_id_required");
    }

    const invite = await getFamilyInviteByToken(inviteId);
    if (!invite || invite.familyAccountId !== account.id) {
      return sendError(res, 404, "That family invite could not be found.", "family_invite_not_found");
    }
    if (invite.status !== "pending") {
      return sendError(res, 409, "Only pending invites can be revoked.", "family_invite_not_pending");
    }

    await saveFamilyInvite(invite.id, {
      status: "revoked",
    });
    const refreshed = await buildFamilySummary(session);
    return sendJson(res, 200, {
      ok: true,
      revokedInviteId: invite.id,
      ...refreshed.payload,
    });
  } catch (error) {
    return sendError(res, 500, "Could not revoke the family invite.", "family_revoke_failed", {
      message: String(error?.message || error),
    });
  }
}

async function handleConfig(req, res) {
  if (req.method !== "GET") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const payload = getPublicBillingConfig(req);
  if (payload.enabled) {
    const session = ensureSession(req, res, { createIfMissing: true });
    if (session && session.userId) {
      payload.auth = {
        userId: session.userId,
        expiresAt: session.expiresAt,
      };
    }
  }

  return sendJson(res, 200, payload);
}

async function handleCreateCheckoutSession(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const billingConfig = getPublicBillingConfig(req);
  if (!billingConfig.enabled) {
    return sendError(res, 503, "Stripe billing is not configured on this deployment.", "billing_not_configured");
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return sendError(res, 503, "Stripe billing is unavailable.", "stripe_unavailable");
  }

  const session = ensureSession(req, res, { createIfMissing: true });
  if (!session || !session.userId) {
    return sendError(res, 401, "Authenticated billing session is required.", "auth_required");
  }

  try {
    const body = await readJsonBody(req);
    const planId = normalizePlanId(body.planId);
    const planPrices = getConfiguredPlanPrices();
    const priceId = planPrices[planId];
    if (!priceId) {
      return sendError(res, 400, "Unknown or unsupported plan.", "invalid_plan", { planId });
    }

    const customerEmail = normalizeEmail(body.customerEmail);
    if (!isLikelyEmail(customerEmail)) {
      return sendError(res, 400, "A valid billing email is required.", "invalid_customer_email");
    }

    const profile = await getStripeBillingProfile(session.userId);
    const existingCustomerId = typeof profile.customerId === "string" ? profile.customerId.trim() : "";

    const baseOrigin = getRequestOrigin(req);
    const defaultSuccessPath = planId.startsWith("school-")
      ? "/school-license.html?checkout=success&session_id={CHECKOUT_SESSION_ID}"
      : "/pricing.html?checkout=success&session_id={CHECKOUT_SESSION_ID}";
    const defaultCancelPath = planId.startsWith("school-")
      ? "/school-license.html?checkout=canceled"
      : "/pricing.html?checkout=canceled";

    const successUrl = sanitizeReturnUrl(body.successUrl, baseOrigin, defaultSuccessPath);
    const cancelUrl = sanitizeReturnUrl(body.cancelUrl, baseOrigin, defaultCancelPath);

    const params = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        app: "cade-games",
        planId,
        appUserId: session.userId,
      },
      subscription_data: {
        metadata: {
          app: "cade-games",
          planId,
          appUserId: session.userId,
        },
      },
    };

    if (process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true") {
      params.automatic_tax = { enabled: true };
    }

    if (existingCustomerId) {
      params.customer = existingCustomerId;
    } else {
      params.customer_email = customerEmail;
    }

    const checkoutSession = await stripe.checkout.sessions.create(params);
    const sessionCustomerId = typeof checkoutSession.customer === "string"
      ? checkoutSession.customer.trim()
      : "";
    const resolvedCustomerId = sessionCustomerId || existingCustomerId;

    await saveStripeBillingProfile(session.userId, {
      customerId: resolvedCustomerId,
      customerEmail,
      checkoutSessionId: checkoutSession.id,
      activePlanId: planId,
      priceId,
      billingInterval: planId.endsWith("annual") ? "year" : "month",
      lastSource: "checkout_session_created",
    });

    if (resolvedCustomerId) {
      await bindUserToStripeCustomer({
        userId: session.userId,
        customerId: resolvedCustomerId,
        customerEmail,
      });
    }

    return sendJson(res, 200, {
      ok: true,
      mode: "stripe",
      id: checkoutSession.id,
      url: checkoutSession.url,
      customerId: resolvedCustomerId,
      userId: session.userId,
      planId,
      priceId,
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "Could not create Stripe checkout session.",
      "checkout_session_failed",
      { message: String(error && error.message ? error.message : error) },
    );
  }
}

async function handleCreatePortalSession(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const billingConfig = getPublicBillingConfig(req);
  if (!billingConfig.enabled) {
    return sendError(res, 503, "Stripe billing is not configured on this deployment.", "billing_not_configured");
  }
  if (!billingConfig.customerPortalEnabled) {
    return sendError(res, 400, "Stripe customer portal is disabled.", "customer_portal_disabled");
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return sendError(res, 503, "Stripe billing is unavailable.", "stripe_unavailable");
  }

  const session = ensureSession(req, res, { createIfMissing: true });
  if (!session || !session.userId) {
    return sendError(res, 401, "Authenticated billing session is required.", "auth_required");
  }

  try {
    const body = await readJsonBody(req);
    const profile = await getStripeBillingProfile(session.userId);

    let customerId = typeof profile.customerId === "string" ? profile.customerId.trim() : "";
    const customerEmail = normalizeEmail(body.customerEmail);

    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (!customerId && sessionId) {
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["customer"],
      });
      const metadataUserId = typeof checkoutSession?.metadata?.appUserId === "string"
        ? checkoutSession.metadata.appUserId.trim()
        : "";
      if (metadataUserId && metadataUserId !== session.userId) {
        return sendError(res, 403, "Checkout session does not belong to this user.", "session_user_mismatch");
      }

      const checkoutCustomerId = typeof checkoutSession.customer === "string"
        ? checkoutSession.customer
        : (typeof checkoutSession?.customer?.id === "string" ? checkoutSession.customer.id : "");
      customerId = checkoutCustomerId || "";
      if (customerId) {
        const emailFromCustomer = typeof checkoutSession?.customer?.email === "string"
          ? checkoutSession.customer.email
          : "";
        const emailFromSession = typeof checkoutSession?.customer_details?.email === "string"
          ? checkoutSession.customer_details.email
          : "";
        await bindUserToStripeCustomer({
          userId: session.userId,
          customerId,
          customerEmail: emailFromCustomer || emailFromSession || customerEmail,
        });
      }
    }

    if (!customerId) {
      return sendError(
        res,
        409,
        "No Stripe customer is linked to this account yet. Complete checkout first.",
        "customer_binding_missing",
      );
    }

    const baseOrigin = getRequestOrigin(req);
    const returnUrl = sanitizeReturnUrl(body.returnUrl, baseOrigin, "/pricing.html");
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    await saveStripeBillingProfile(session.userId, {
      customerId,
      customerEmail: isLikelyEmail(customerEmail) ? customerEmail : profile.customerEmail,
      lastSource: "portal_session_created",
    });

    return sendJson(res, 200, {
      ok: true,
      mode: "stripe",
      url: portalSession.url,
      customerId,
      userId: session.userId,
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "Could not create Stripe customer portal session.",
      "portal_session_failed",
      { message: String(error && error.message ? error.message : error) },
    );
  }
}

async function handleSubscriptionStatus(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const billingConfig = getPublicBillingConfig(req);
  if (!billingConfig.enabled) {
    return sendJson(res, 200, {
      ok: true,
      mode: "local",
      entitlements: {
        familyPremium: false,
        schoolLicense: false,
      },
      subscriptions: [],
      activePlanId: "",
      updatedAt: Date.now(),
    });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return sendError(res, 503, "Stripe billing is unavailable.", "stripe_unavailable");
  }

  const session = ensureSession(req, res, { createIfMissing: true });
  if (!session || !session.userId) {
    return sendError(res, 401, "Authenticated billing session is required.", "auth_required");
  }

  try {
    const query = getQuery(req);
    const sessionId = typeof query.sessionId === "string"
      ? query.sessionId.trim()
      : (typeof query.session_id === "string" ? query.session_id.trim() : "");

    const existingProfile = await getStripeBillingProfile(session.userId);
    let customerId = typeof existingProfile.customerId === "string" ? existingProfile.customerId.trim() : "";
    let customerEmail = typeof existingProfile.customerEmail === "string" ? existingProfile.customerEmail : "";

    const requestedCustomerId = typeof query.customerId === "string" ? query.customerId.trim() : "";
    if (requestedCustomerId && customerId && requestedCustomerId !== customerId) {
      return sendError(res, 403, "Customer does not belong to this user.", "customer_mismatch");
    }

    if (sessionId) {
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["customer"],
      });

      const metadataUserId = typeof checkoutSession?.metadata?.appUserId === "string"
        ? checkoutSession.metadata.appUserId.trim()
        : "";
      if (metadataUserId && metadataUserId !== session.userId) {
        return sendError(res, 403, "Checkout session does not belong to this user.", "session_user_mismatch");
      }

      const checkoutCustomerId = typeof checkoutSession.customer === "string"
        ? checkoutSession.customer
        : (typeof checkoutSession?.customer?.id === "string" ? checkoutSession.customer.id : "");
      if (checkoutCustomerId) {
        customerId = checkoutCustomerId;
      }

      const emailFromCustomer = typeof checkoutSession?.customer?.email === "string"
        ? checkoutSession.customer.email
        : "";
      const emailFromSession = typeof checkoutSession?.customer_details?.email === "string"
        ? checkoutSession.customer_details.email
        : "";
      const fallbackEmail = normalizeEmail(emailFromCustomer || emailFromSession || query.customerEmail);
      if (fallbackEmail) {
        customerEmail = fallbackEmail;
      }

      if (customerId) {
        await bindUserToStripeCustomer({
          userId: session.userId,
          customerId,
          customerEmail,
        });
      }
    }

    if (!customerId) {
      const storedSummary = summarizeEntitlementsFromProfile(existingProfile);
      return sendJson(res, 200, {
        ok: true,
        mode: "stripe",
        userId: session.userId,
        customerBound: false,
        customerId: "",
        customerEmail: customerEmail || "",
        sessionId: sessionId || "",
        ...storedSummary,
      });
    }

    const sync = await syncCustomerBillingProfile({
      stripe,
      userId: session.userId,
      customerId,
      customerEmail,
      source: "subscription_status_sync",
      existingProfile,
    });

    return sendJson(res, 200, {
      ok: true,
      mode: "stripe",
      userId: session.userId,
      customerBound: true,
      customerId,
      customerEmail: sync.profile.customerEmail || "",
      sessionId: sessionId || "",
      ...sync.summary,
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "Could not load Stripe subscription status.",
      "subscription_status_failed",
      { message: String(error && error.message ? error.message : error) },
    );
  }
}

async function handleWebhook(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const billingConfig = getPublicBillingConfig(req);
  if (!billingConfig.enabled) {
    return sendError(res, 503, "Stripe billing is not configured on this deployment.", "billing_not_configured");
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return sendError(res, 503, "Stripe billing is unavailable.", "stripe_unavailable");
  }

  const webhookSecret = typeof process.env.STRIPE_WEBHOOK_SECRET === "string"
    ? process.env.STRIPE_WEBHOOK_SECRET.trim()
    : "";
  if (!webhookSecret) {
    return sendError(res, 503, "Stripe webhook secret is not configured.", "webhook_secret_missing");
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      return sendError(res, 400, "Missing Stripe webhook signature.", "missing_signature");
    }

    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    const handled = HANDLED_EVENT_TYPES.has(event.type);

    let customerBound = false;
    let userId = "";
    let customerId = "";

    if (handled) {
      const alreadyProcessed = await hasProcessedStripeWebhookEvent(event.id);
      if (alreadyProcessed) {
        return sendJson(res, 200, {
          ok: true,
          received: true,
          type: event.type,
          id: event.id,
          handled: true,
          duplicate: true,
        });
      }

      const result = await processHandledEvent(stripe, event);
      customerBound = Boolean(result.customerBound);
      userId = result.userId || "";
      customerId = result.customerId || "";

      await markStripeWebhookEventProcessed(event.id);
      await forwardWebhookEvent(event);
    }

    return sendJson(res, 200, {
      ok: true,
      received: true,
      type: event.type,
      id: event.id,
      handled,
      customerBound,
      customerId,
      userId,
    });
  } catch (error) {
    return sendError(
      res,
      400,
      "Invalid Stripe webhook payload.",
      "invalid_webhook_payload",
      { message: String(error && error.message ? error.message : error) },
    );
  }
}

async function handleAdminReconcile(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.", "method_not_allowed");
  }

  const auth = isAdminAuthorized(req);
  if (!auth.ok) {
    const status = auth.reason === "admin_token_not_configured" ? 503 : 401;
    const message = auth.reason === "admin_token_not_configured"
      ? "Stripe admin token is not configured."
      : "Admin token is required.";
    return sendError(res, status, message, auth.reason);
  }

  const billingConfig = getPublicBillingConfig(req);
  if (!billingConfig.enabled) {
    return sendError(res, 503, "Stripe billing is not configured on this deployment.", "billing_not_configured");
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return sendError(res, 503, "Stripe billing is unavailable.", "stripe_unavailable");
  }

  try {
    const body = await readJsonBody(req);
    let userId = normalizeId(body.userId);
    let customerId = normalizeId(body.customerId);
    const customerEmail = normalizeEmail(body.customerEmail);
    const dryRun = toBoolean(body.dryRun);
    let previousSummary = null;
    let existingProfile = null;

    if (userId) {
      existingProfile = await getStripeBillingProfile(userId);
      if (!customerId) {
        customerId = normalizeId(existingProfile.customerId);
      }
      previousSummary = summarizeEntitlementsFromProfile(existingProfile);
    }

    if (customerId && !userId) {
      userId = await getUserIdForStripeCustomer(customerId);
    }

    if (!customerId) {
      return sendError(
        res,
        400,
        "Customer could not be resolved. Provide customerId, or a userId already bound to Stripe.",
        "customer_resolution_failed",
      );
    }

    const subscriptions = await listCustomerSubscriptions(stripe, customerId);
    const summary = summarizeEntitlementsFromSubscriptions(subscriptions, undefined, {
      graceUntil: existingProfile?.graceUntil,
      lastPaymentFailureAt: existingProfile?.lastPaymentFailureAt,
    });

    if (dryRun) {
      return sendJson(res, 200, {
        ok: true,
        dryRun: true,
        customerId,
        userId: userId || "",
        customerBound: Boolean(userId),
        changed: previousSummary ? didSummaryChange(previousSummary, summary) : false,
        ...summary,
      });
    }

    if (!userId) {
      return sendJson(res, 200, {
        ok: true,
        dryRun: false,
        customerId,
        userId: "",
        customerBound: false,
        changed: false,
        ...summary,
      });
    }

    if (customerId) {
      await bindUserToStripeCustomer({ userId, customerId, customerEmail });
    }

    const savedProfile = await saveStripeBillingProfile(userId, buildBillingSnapshotPatch(summary, existingProfile, {
      customerId,
      customerEmail: customerEmail || existingProfile?.customerEmail || "",
      lastSource: "admin_reconcile",
    }));
    const savedSummary = summarizeEntitlementsFromProfile(savedProfile);

    return sendJson(res, 200, {
      ok: true,
      dryRun: false,
      customerId,
      userId,
      customerBound: true,
      changed: didSummaryChange(previousSummary, savedSummary),
      ...savedSummary,
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "Stripe admin reconcile failed.",
      "admin_reconcile_failed",
      { message: String(error && error.message ? error.message : error) },
    );
  }
}

module.exports = {
  handleAdminLookup,
  handleAdminReconcile,
  handleConfig,
  handleCreateCheckoutSession,
  handleCreatePortalSession,
  handleFamilyAcceptInvite,
  handleFamilyInvite,
  handleFamilyRemoveMember,
  handleFamilyResendInvite,
  handleFamilyRevokeInvite,
  handleFamilySummary,
  handleSubscriptionStatus,
  handleWebhook,
};
