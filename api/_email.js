const {
  createEmailDeliveryRecord,
  updateEmailDeliveryRecord,
} = require("./stripe/_family-store");

function normalizeText(value, maxLength = 400) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeText(value, 200).toLowerCase();
}

function getEmailConfig() {
  const apiKey = normalizeText(process.env.RESEND_API_KEY, 400);
  const from = normalizeText(process.env.EMAIL_FROM, 240);
  const replyTo = normalizeText(process.env.EMAIL_REPLY_TO, 240);
  return {
    enabled: Boolean(apiKey && from),
    apiKey,
    from,
    replyTo,
    provider: "resend",
  };
}

async function sendEmail({
  to,
  subject,
  html,
  text,
  templateKey,
  familyAccountId = "",
  inviteId = "",
  userId = "",
  customerId = "",
  subscriptionId = "",
  invoiceId = "",
  eventId = "",
  dedupeKey = "",
} = {}) {
  const normalizedTo = normalizeEmail(to);
  const normalizedSubject = normalizeText(subject, 200);
  const config = getEmailConfig();
  const delivery = await createEmailDeliveryRecord({
    templateKey,
    familyAccountId,
    inviteId,
    userId,
    customerId,
    subscriptionId,
    invoiceId,
    eventId,
    dedupeKey,
    to: normalizedTo,
    subject: normalizedSubject,
    status: config.enabled ? "pending" : "skipped",
    provider: config.provider,
    error: config.enabled ? "" : "email_not_configured",
  });

  if (!config.enabled) {
    return {
      ok: false,
      skipped: true,
      code: "email_not_configured",
      delivery,
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [normalizedTo],
        reply_to: config.replyTo || undefined,
        subject: normalizedSubject,
        html: String(html || ""),
        text: String(text || ""),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = normalizeText(payload?.message || payload?.error || `resend_http_${response.status}`, 500);
      const failed = await updateEmailDeliveryRecord(delivery.id, {
        status: "failed",
        error: message,
      });
      return {
        ok: false,
        skipped: false,
        code: "email_send_failed",
        delivery: failed,
      };
    }

    const sent = await updateEmailDeliveryRecord(delivery.id, {
      status: "sent",
      providerMessageId: normalizeText(payload?.id, 200),
      error: "",
    });
    return {
      ok: true,
      skipped: false,
      delivery: sent,
    };
  } catch (error) {
    const failed = await updateEmailDeliveryRecord(delivery.id, {
      status: "failed",
      error: normalizeText(error?.message || error, 500),
    });
    return {
      ok: false,
      skipped: false,
      code: "email_send_failed",
      delivery: failed,
    };
  }
}

function formatDateTime(timestamp) {
  const numeric = Number(timestamp || 0);
  const normalized = Number.isFinite(numeric) && numeric > 0 && numeric < 1e12
    ? numeric * 1000
    : numeric;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function describePlanLabel(planId) {
  const normalized = normalizeText(planId, 80).toLowerCase();
  switch (normalized) {
    case "family-monthly":
      return "Family Monthly";
    case "family-annual":
      return "Family Annual";
    case "school-monthly":
      return "School Monthly";
    case "school-annual":
      return "School Annual";
    default:
      return normalizeText(planId, 80) || "Ai and Sons plan";
  }
}

async function sendFamilyInviteEmail({
  to,
  inviteUrl,
  inviterName,
  familyPlanLabel,
  expiresAt,
  familyAccountId,
  inviteId,
} = {}) {
  const safeInviter = normalizeText(inviterName, 160) || "An Ai and Sons family organizer";
  const safePlanLabel = normalizeText(familyPlanLabel, 80) || "Family plan";
  const expiresLabel = formatDateTime(expiresAt) || "soon";
  const subject = `${safeInviter} invited you to join Ai and Sons`;
  const text = [
    `${safeInviter} invited you to join their Ai and Sons ${safePlanLabel}.`,
    "",
    `Accept your invite: ${inviteUrl}`,
    `This invite expires ${expiresLabel}.`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#132238;line-height:1.6;">
      <h2 style="margin:0 0 12px;">You're invited to join Ai and Sons</h2>
      <p style="margin:0 0 12px;">${safeInviter} invited you to join their <strong>${safePlanLabel}</strong>.</p>
      <p style="margin:0 0 16px;">Sign in with Google, then accept the invite to share family access.</p>
      <p style="margin:0 0 16px;">
        <a href="${inviteUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#0b5fff;color:#ffffff;text-decoration:none;font-weight:700;">Accept invite</a>
      </p>
      <p style="margin:0;color:#5f6f86;font-size:13px;">This invite expires ${expiresLabel}.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    text,
    html,
    templateKey: "family-invite",
    familyAccountId,
    inviteId,
  });
}

async function sendFamilyInviteAcceptedEmail({
  to,
  memberName,
  familyAccountId,
} = {}) {
  const safeMemberName = normalizeText(memberName, 160) || "A family member";
  const subject = `${safeMemberName} joined your Ai and Sons family plan`;
  const text = `${safeMemberName} accepted your invite and now has access through your family plan.`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#132238;line-height:1.6;">
      <h2 style="margin:0 0 12px;">Family invite accepted</h2>
      <p style="margin:0;">${safeMemberName} accepted your invite and now has access through your family plan.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    text,
    html,
    templateKey: "family-invite-accepted",
    familyAccountId,
  });
}

async function sendFamilyMemberRemovedEmail({
  to,
  memberName,
  familyAccountId,
  userId = "",
} = {}) {
  const safeMemberName = normalizeText(memberName, 160) || "Family member";
  const subject = `Your Ai and Sons family access has changed`;
  const text = `${safeMemberName}, your access through the shared Ai and Sons family plan has been removed. You can still sign in and start your own plan anytime.`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#132238;line-height:1.6;">
      <h2 style="margin:0 0 12px;">Family access updated</h2>
      <p style="margin:0;">${safeMemberName}, your access through the shared Ai and Sons family plan has been removed. You can still sign in and start your own plan anytime.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    text,
    html,
    templateKey: "family-member-removed",
    familyAccountId,
    userId,
  });
}

async function sendBillingPaymentFailedEmail({
  to,
  planId,
  graceUntil,
  familyAccountId = "",
  userId = "",
  customerId = "",
  subscriptionId = "",
  invoiceId = "",
  eventId = "",
} = {}) {
  const planLabel = describePlanLabel(planId);
  const graceLabel = formatDateTime(graceUntil) || "soon";
  const subject = `Action needed for your Ai and Sons ${planLabel}`;
  const text = [
    `We couldn't process your latest payment for ${planLabel}.`,
    "",
    `Your access is currently in a grace window until ${graceLabel}.`,
    "Please update your billing details in the customer portal to avoid an interruption.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#132238;line-height:1.6;">
      <h2 style="margin:0 0 12px;">Payment issue detected</h2>
      <p style="margin:0 0 12px;">We couldn't process your latest payment for <strong>${planLabel}</strong>.</p>
      <p style="margin:0 0 12px;">Your access is currently in a grace window until <strong>${graceLabel}</strong>.</p>
      <p style="margin:0;">Please update your billing details in the customer portal to avoid an interruption.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    text,
    html,
    templateKey: "billing-payment-failed",
    familyAccountId,
    userId,
    customerId,
    subscriptionId,
    invoiceId,
    eventId,
    dedupeKey: eventId || invoiceId,
  });
}

async function sendBillingPaymentConfirmedEmail({
  to,
  planId,
  currentPeriodEnd,
  familyAccountId = "",
  userId = "",
  customerId = "",
  subscriptionId = "",
  invoiceId = "",
  eventId = "",
} = {}) {
  const planLabel = describePlanLabel(planId);
  const renewalLabel = formatDateTime(currentPeriodEnd) || "your next billing cycle";
  const subject = `Your Ai and Sons ${planLabel} payment is confirmed`;
  const text = [
    `Your latest payment for ${planLabel} was confirmed.`,
    "",
    `Your access is active through ${renewalLabel}.`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#132238;line-height:1.6;">
      <h2 style="margin:0 0 12px;">Payment confirmed</h2>
      <p style="margin:0 0 12px;">Your latest payment for <strong>${planLabel}</strong> was confirmed.</p>
      <p style="margin:0;">Your access is active through <strong>${renewalLabel}</strong>.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    text,
    html,
    templateKey: "billing-payment-confirmed",
    familyAccountId,
    userId,
    customerId,
    subscriptionId,
    invoiceId,
    eventId,
    dedupeKey: eventId || invoiceId,
  });
}

async function sendBillingCancellationScheduledEmail({
  to,
  planId,
  currentPeriodEnd,
  familyAccountId = "",
  userId = "",
  customerId = "",
  subscriptionId = "",
  eventId = "",
} = {}) {
  const planLabel = describePlanLabel(planId);
  const endLabel = formatDateTime(currentPeriodEnd) || "the end of your current billing period";
  const subject = `Your Ai and Sons ${planLabel} will end at period close`;
  const text = [
    `Your ${planLabel} is set to cancel at the end of the current billing period.`,
    "",
    `Access remains active through ${endLabel}.`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#132238;line-height:1.6;">
      <h2 style="margin:0 0 12px;">Cancellation scheduled</h2>
      <p style="margin:0 0 12px;">Your <strong>${planLabel}</strong> is set to cancel at the end of the current billing period.</p>
      <p style="margin:0;">Access remains active through <strong>${endLabel}</strong>.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    text,
    html,
    templateKey: "billing-cancel-scheduled",
    familyAccountId,
    userId,
    customerId,
    subscriptionId,
    eventId,
    dedupeKey: eventId || subscriptionId,
  });
}

async function sendBillingSubscriptionEndedEmail({
  to,
  planId,
  familyAccountId = "",
  userId = "",
  customerId = "",
  subscriptionId = "",
  eventId = "",
} = {}) {
  const planLabel = describePlanLabel(planId);
  const subject = `Your Ai and Sons ${planLabel} has ended`;
  const text = `Your ${planLabel} has ended. You can sign in any time to restart a plan when you're ready.`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#132238;line-height:1.6;">
      <h2 style="margin:0 0 12px;">Subscription ended</h2>
      <p style="margin:0;">Your <strong>${planLabel}</strong> has ended. You can sign in any time to restart a plan when you're ready.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    text,
    html,
    templateKey: "billing-subscription-ended",
    familyAccountId,
    userId,
    customerId,
    subscriptionId,
    eventId,
    dedupeKey: eventId || subscriptionId,
  });
}

module.exports = {
  getEmailConfig,
  sendEmail,
  sendBillingCancellationScheduledEmail,
  sendBillingPaymentConfirmedEmail,
  sendBillingPaymentFailedEmail,
  sendBillingSubscriptionEndedEmail,
  sendFamilyInviteEmail,
  sendFamilyInviteAcceptedEmail,
  sendFamilyMemberRemovedEmail,
};
