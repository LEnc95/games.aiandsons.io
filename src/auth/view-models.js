const PLAN_LABELS = Object.freeze({
  "family-monthly": "Family Monthly",
  "family-annual": "Family Annual",
  "school-monthly": "School Monthly",
  "school-annual": "School Annual",
});

const STATUS_LABELS = Object.freeze({
  active: "Active",
  trialing: "Trialing",
  past_due: "Payment issue",
  unpaid: "Unpaid",
  canceled: "Canceled",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
  paused: "Paused",
});

const INTERVAL_LABELS = Object.freeze({
  month: "Monthly",
  year: "Annual",
  week: "Weekly",
  day: "Daily",
});

function toTitleCase(value) {
  return String(value || "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeTimestamp(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric < 1e12 ? numeric * 1000 : numeric;
}

export function formatBillingDate(value) {
  const timestamp = normalizeTimestamp(value);
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

export function describeBillingPlan(planId = "") {
  const normalized = String(planId || "").trim().toLowerCase();
  if (!normalized) return "No plan active";
  return PLAN_LABELS[normalized] || toTitleCase(normalized.replace(/-/g, " "));
}

export function describeBillingStatus(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return "Inactive";
  return STATUS_LABELS[normalized] || toTitleCase(normalized.replace(/_/g, " "));
}

export function describeBillingInterval(interval = "") {
  const normalized = String(interval || "").trim().toLowerCase();
  if (!normalized) return "";
  return INTERVAL_LABELS[normalized] || toTitleCase(normalized);
}

export function buildBillingOverviewModel({ billing, billingEnabled } = {}) {
  const safeBilling = billing && typeof billing === "object" ? billing : {};
  const hasFamilyPremium = Boolean(safeBilling?.entitlements?.familyPremium);
  const hasSchoolLicense = Boolean(safeBilling?.entitlements?.schoolLicense);
  const entitled = hasFamilyPremium || hasSchoolLicense;
  const planLabel = describeBillingPlan(safeBilling.activePlanId);
  const statusLabel = describeBillingStatus(safeBilling.subscriptionStatus || (entitled ? "active" : ""));
  const intervalLabel = describeBillingInterval(safeBilling.billingInterval);
  const renewalDate = formatBillingDate(safeBilling.currentPeriodEnd);
  const cancelDate = formatBillingDate(safeBilling.cancelAt || safeBilling.currentPeriodEnd);
  const trialDate = formatBillingDate(safeBilling.trialEnd);
  const graceDate = formatBillingDate(safeBilling.graceUntil);
  const paymentFailureDate = formatBillingDate(safeBilling.lastPaymentFailureAt);
  const customerEmail = typeof safeBilling.customerEmail === "string" ? safeBilling.customerEmail.trim() : "";
  const canManageBilling = Boolean(
    billingEnabled &&
    (
      customerEmail ||
      (typeof safeBilling.subscriptionId === "string" && safeBilling.subscriptionId.trim()) ||
      (typeof safeBilling.activePlanId === "string" && safeBilling.activePlanId.trim())
    )
  );
  const cards = [];

  if (!billingEnabled) {
    return {
      tone: "warning",
      statusMessage: "Secure Stripe billing is not enabled on this deployment yet.",
      cards,
      canManageBilling,
      customerEmail,
    };
  }

  if (!safeBilling.activePlanId && !safeBilling.subscriptionStatus && !entitled) {
    return {
      tone: "",
      statusMessage: "No paid plan is attached to this account yet.",
      cards,
      canManageBilling,
      customerEmail,
    };
  }

  const planLines = [];
  planLines.push(`Status: ${statusLabel}`);
  if (intervalLabel) {
    planLines.push(`Billing cadence: ${intervalLabel}`);
  }
  if (customerEmail) {
    planLines.push(`Billing email: ${customerEmail}`);
  }
  cards.push({
    title: planLabel,
    lines: planLines,
    badge: entitled ? "Active" : statusLabel,
  });

  const timelineLines = [];
  if (safeBilling.subscriptionStatus === "trialing" && trialDate) {
    timelineLines.push(`Trial access ends ${trialDate}.`);
  }
  if (safeBilling.cancelAtPeriodEnd && cancelDate) {
    timelineLines.push(`Cancellation is scheduled for ${cancelDate}.`);
  } else if (renewalDate && entitled) {
    timelineLines.push(`Next renewal on ${renewalDate}.`);
  }
  if (graceDate && safeBilling.subscriptionStatus === "past_due") {
    timelineLines.push(`Grace access remains on until ${graceDate}.`);
  }
  if (timelineLines.length > 0) {
    cards.push({
      title: "Timeline",
      lines: timelineLines,
      badge: safeBilling.cancelAtPeriodEnd ? "Ends soon" : (safeBilling.subscriptionStatus === "trialing" ? "Trial" : "Renewal"),
    });
  }

  const invoiceLines = [];
  if (safeBilling.latestInvoiceStatus) {
    invoiceLines.push(`Latest invoice: ${describeBillingStatus(safeBilling.latestInvoiceStatus)}`);
  }
  if (paymentFailureDate) {
    invoiceLines.push(`Last payment issue noted ${paymentFailureDate}.`);
  }
  if (invoiceLines.length > 0) {
    cards.push({
      title: "Billing health",
      lines: invoiceLines,
      badge: safeBilling.subscriptionStatus === "past_due" ? "Needs care" : "Healthy",
    });
  }

  if (safeBilling.subscriptionStatus === "past_due") {
    return {
      tone: "warning",
      statusMessage: graceDate
        ? `There is a payment issue, but your access remains on through ${graceDate} while billing retries.`
        : `There is a payment issue with your ${planLabel}.`,
      cards,
      canManageBilling,
      customerEmail,
    };
  }

  if (safeBilling.cancelAtPeriodEnd && cancelDate) {
    return {
      tone: "warning",
      statusMessage: `Your ${planLabel} stays active until ${cancelDate}, then it will cancel.`,
      cards,
      canManageBilling,
      customerEmail,
    };
  }

  if (safeBilling.subscriptionStatus === "trialing" && trialDate) {
    return {
      tone: "",
      statusMessage: `Your ${planLabel} trial is active through ${trialDate}.`,
      cards,
      canManageBilling,
      customerEmail,
    };
  }

  if (entitled) {
    return {
      tone: "",
      statusMessage: renewalDate
        ? `Your ${planLabel} is active and renews on ${renewalDate}.`
        : `Your ${planLabel} is active.`,
      cards,
      canManageBilling,
      customerEmail,
    };
  }

  return {
    tone: "warning",
    statusMessage: `Billing status: ${statusLabel}.`,
    cards,
    canManageBilling,
    customerEmail,
  };
}
