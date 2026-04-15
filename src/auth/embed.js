import {
  fetchAuthSession,
  getFirebaseWebConfig,
  onAuthSessionChanged,
  signInWithGoogle,
  signOutFromApp,
} from "./client.js";
import {
  acceptFamilyInvite,
  createStripePortalSession,
  fetchBillingConfig,
  fetchFamilyBillingSummary,
  isStripeBillingEnabled,
  removeFamilyMember,
  resendFamilyInvite,
  revokeFamilyInvite,
  sendFamilyInvite,
} from "../core/billing.js";
import { buildBillingOverviewModel } from "./view-models.js";

const STYLE_ID = "cadeAuthStyles";
const INLINE_SECTION_ID = "cadeAccountInlineSection";
const STANDALONE_MODAL_ID = "cadeAccountStandaloneModal";
const STANDALONE_TRIGGER_ID = "cadeAccountTrigger";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .cade-account-launcher {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 40px;
      padding: 8px 14px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.08);
      color: #eef5ff;
      text-decoration: none;
      font: 600 14px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      cursor: pointer;
    }
    .cade-account-launcher:hover {
      background: rgba(255,255,255,0.12);
    }
    .cade-account-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10002;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: rgba(3, 8, 20, 0.72);
      backdrop-filter: blur(10px);
    }
    .cade-account-modal-backdrop.active {
      display: flex;
    }
    .cade-account-modal {
      width: min(520px, 100%);
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.12);
      background: linear-gradient(180deg, rgba(12,20,46,0.96) 0%, rgba(7,12,28,0.98) 100%);
      color: #eef5ff;
      box-shadow: 0 24px 72px rgba(0,0,0,0.38);
      padding: 18px;
    }
    .cade-account-modal h2 {
      margin: 0 0 8px 0;
      font-size: 22px;
    }
    .cade-account-panel {
      margin-top: 16px;
      padding: 16px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.05);
      display: grid;
      gap: 12px;
    }
    .cade-account-panel.inline {
      margin-top: 14px;
    }
    .cade-account-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .cade-account-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.08);
      display: none;
    }
    .cade-account-avatar.has-photo {
      display: block;
    }
    .cade-account-copy {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .cade-account-copy strong {
      font-size: 14px;
      color: #f8fbff;
    }
    .cade-account-copy span {
      color: #bdd0ee;
      font-size: 13px;
      line-height: 1.45;
    }
    .cade-account-status {
      margin: 0;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.05);
      color: #d2e2fb;
      font-size: 13px;
      line-height: 1.5;
    }
    .cade-account-status.warning {
      border-color: rgba(255, 215, 148, 0.32);
      background: rgba(255, 215, 148, 0.12);
      color: #ffe5b0;
    }
    .cade-account-status.error {
      border-color: rgba(255, 140, 165, 0.34);
      background: rgba(255, 140, 165, 0.12);
      color: #ffd7df;
    }
    .cade-account-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .cade-account-btn {
      min-height: 38px;
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.08);
      color: #eef5ff;
      font: 700 13px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      cursor: pointer;
    }
    .cade-account-btn.primary {
      background: linear-gradient(135deg, #67cbff 0%, #8bf4da 100%);
      border-color: rgba(255,255,255,0.24);
      color: #061423;
    }
    .cade-account-btn.secondary {
      background: rgba(255,255,255,0.08);
    }
    .cade-account-btn.close {
      margin-left: auto;
    }
    .cade-account-btn:disabled {
      opacity: 0.58;
      cursor: not-allowed;
    }
    .cade-account-divider {
      margin-top: 14px;
      border-top: 1px solid rgba(255,255,255,0.1);
      padding-top: 14px;
    }
    .cade-billing-panel,
    .cade-family-panel {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid rgba(255,255,255,0.1);
      display: grid;
      gap: 12px;
    }
    .cade-billing-panel h3,
    .cade-family-panel h3 {
      margin: 0;
      font-size: 16px;
      color: #f8fbff;
    }
    .cade-billing-copy,
    .cade-family-copy {
      margin: 0;
      color: #bdd0ee;
      font-size: 13px;
      line-height: 1.5;
    }
    .cade-billing-list,
    .cade-family-list {
      display: grid;
      gap: 10px;
    }
    .cade-billing-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .cade-billing-btn {
      min-height: 34px;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.08);
      color: #eef5ff;
      font: 700 12px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      cursor: pointer;
    }
    .cade-billing-btn.primary {
      background: linear-gradient(135deg, #67cbff 0%, #8bf4da 100%);
      border-color: rgba(255,255,255,0.24);
      color: #061423;
    }
    .cade-billing-btn:disabled {
      opacity: 0.58;
      cursor: not-allowed;
    }
    .cade-family-card {
      padding: 12px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.04);
      display: grid;
      gap: 6px;
    }
    .cade-family-card strong {
      font-size: 13px;
      color: #f8fbff;
    }
    .cade-family-card span {
      color: #bdd0ee;
      font-size: 12px;
      line-height: 1.45;
    }
    .cade-family-badge {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(103,203,255,0.14);
      color: #9ce7ff;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .cade-family-form {
      display: grid;
      gap: 10px;
    }
    .cade-family-input {
      width: 100%;
      min-height: 40px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.06);
      color: #eef5ff;
      padding: 10px 12px;
      font: 500 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    .cade-family-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .cade-family-btn {
      min-height: 34px;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.08);
      color: #eef5ff;
      font: 700 12px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      cursor: pointer;
    }
    .cade-family-btn.danger {
      color: #ffd7df;
      border-color: rgba(255, 140, 165, 0.28);
      background: rgba(255, 140, 165, 0.08);
    }
    .cade-family-btn:disabled {
      opacity: 0.58;
      cursor: not-allowed;
    }
    .cade-family-empty {
      margin: 0;
      color: #9fb4d3;
      font-size: 12px;
      line-height: 1.5;
    }
    @media (max-width: 680px) {
      .cade-account-actions {
        flex-direction: column;
      }
      .cade-account-btn,
      .cade-account-btn.close {
        width: 100%;
        margin-left: 0;
      }
      .cade-billing-actions,
      .cade-family-actions {
        flex-direction: column;
      }
      .cade-family-btn,
      .cade-billing-btn {
        width: 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

function getPreferredLabel(session) {
  return session?.displayName || session?.email || "Google account";
}

function createAccountPanel({ inline = false, includeClose = false } = {}) {
  const root = document.createElement("section");
  root.className = `cade-account-panel${inline ? " inline" : ""}`;
  root.innerHTML = `
    <div class="cade-account-header">
      <img class="cade-account-avatar" alt="" />
      <div class="cade-account-copy">
        <strong>Checking account...</strong>
        <span>Use Google to keep your profile, purchases, and feedback together.</span>
      </div>
    </div>
    <p class="cade-account-status">Checking sign-in availability...</p>
    <div class="cade-account-actions">
      <button type="button" class="cade-account-btn primary">Sign in with Google</button>
      <button type="button" class="cade-account-btn secondary" hidden>Sign out</button>
      ${includeClose ? '<button type="button" class="cade-account-btn close">Close</button>' : ""}
    </div>
  `;

  return {
    root,
    avatarEl: root.querySelector(".cade-account-avatar"),
    titleEl: root.querySelector(".cade-account-copy strong"),
    subtitleEl: root.querySelector(".cade-account-copy span"),
    statusEl: root.querySelector(".cade-account-status"),
    primaryBtn: root.querySelector(".cade-account-btn.primary"),
    secondaryBtn: root.querySelector(".cade-account-btn.secondary"),
    closeBtn: root.querySelector(".cade-account-btn.close"),
  };
}

function createBillingSection() {
  const root = document.createElement("section");
  root.className = "cade-billing-panel";
  root.innerHTML = `
    <div>
      <h3>Billing</h3>
      <p class="cade-billing-copy">See your current plan, renewal timing, and billing health in one place.</p>
    </div>
    <p class="cade-account-status">Loading billing details...</p>
    <div class="cade-billing-list" hidden></div>
    <div class="cade-billing-actions">
      <button type="button" class="cade-billing-btn primary">Manage billing</button>
      <button type="button" class="cade-billing-btn">View plans</button>
    </div>
  `;

  const buttons = root.querySelectorAll(".cade-billing-btn");
  return {
    root,
    statusEl: root.querySelector(".cade-account-status"),
    cardsEl: root.querySelector(".cade-billing-list"),
    manageBtn: buttons[0],
    plansBtn: buttons[1],
  };
}

function createFamilySection() {
  const root = document.createElement("section");
  root.className = "cade-family-panel";
  root.innerHTML = `
    <div>
      <h3>Family Sharing</h3>
      <p class="cade-family-copy">Manage who is covered by your family plan and accept family invites after signing in.</p>
    </div>
    <p class="cade-account-status">Loading family details...</p>
    <div class="cade-family-form" hidden>
      <input class="cade-family-input" type="email" placeholder="familymember@example.com" inputmode="email" autocomplete="email" />
      <div class="cade-family-actions">
        <button type="button" class="cade-family-btn">Send invite</button>
        <button type="button" class="cade-family-btn" hidden>Accept invite</button>
      </div>
    </div>
    <div class="cade-family-list" hidden></div>
    <div class="cade-family-list" hidden></div>
    <div class="cade-family-list" hidden></div>
  `;

  const lists = root.querySelectorAll(".cade-family-list");
  return {
    root,
    statusEl: root.querySelector(".cade-account-status"),
    formEl: root.querySelector(".cade-family-form"),
    emailInput: root.querySelector(".cade-family-input"),
    inviteBtn: root.querySelector(".cade-family-btn"),
    acceptBtn: root.querySelectorAll(".cade-family-btn")[1],
    summaryListEl: lists[0],
    membersListEl: lists[1],
    invitesListEl: lists[2],
  };
}

function getFamilyInviteTokenFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return (params.get("familyInviteToken") || "").trim();
  } catch {
    return "";
  }
}

function clearFamilyInviteTokenFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("familyInviteToken");
    window.history.replaceState({}, "", url.toString());
  } catch {
    // Ignore history update failures.
  }
}

function formatFamilyDate(timestamp) {
  const date = new Date(Number(timestamp || 0));
  if (Number.isNaN(date.getTime())) return "soon";
  return date.toLocaleDateString();
}

function formatFamilyDateTime(timestamp) {
  const date = new Date(Number(timestamp || 0));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function describeInviteDelivery(invite) {
  const delivery = invite?.lastEmailDelivery;
  if (!delivery) {
    return invite?.inviteUrl
      ? "Invite link is ready to share."
      : "Invite email is still pending.";
  }
  if (delivery.status === "sent") {
    return `Email sent to ${invite.email}.`;
  }
  if (delivery.status === "failed") {
    return delivery.error
      ? `Email failed: ${delivery.error}`
      : "Email delivery failed. You can resend it.";
  }
  if (delivery.status === "skipped") {
    return "Email sending is not configured yet, but the invite link is ready.";
  }
  return "Invite email is still sending.";
}

async function copyTextToClipboard(value) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error("Invite link is missing.");
  }
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Could not copy the invite link.");
  }
}

function createFamilyCard(title, lines = [], badge = "") {
  const card = document.createElement("article");
  card.className = "cade-family-card";
  if (badge) {
    const badgeEl = document.createElement("span");
    badgeEl.className = "cade-family-badge";
    badgeEl.textContent = badge;
    card.appendChild(badgeEl);
  }
  const strong = document.createElement("strong");
  strong.textContent = title;
  card.appendChild(strong);
  for (const line of lines) {
    const span = document.createElement("span");
    span.textContent = line;
    card.appendChild(span);
  }
  return card;
}

function renderBillingCards(section, model) {
  section.cardsEl.textContent = "";
  const cards = Array.isArray(model?.cards) ? model.cards : [];
  section.cardsEl.hidden = cards.length === 0;
  for (const card of cards) {
    section.cardsEl.appendChild(createFamilyCard(card.title, card.lines, card.badge));
  }
}

function classifyStatus(session, firebaseConfig, pendingMessage = "") {
  if (pendingMessage) {
    return { tone: "", message: pendingMessage };
  }

  if (session?.isAuthenticated) {
    return {
      tone: "",
      message: "Signed in. Your arcade account can now stay consistent across devices.",
    };
  }

  if (session?.stubbed) {
    return {
      tone: "warning",
      message: "Static localhost mode is active. Add ?authApiProbe=1 to exercise the live auth APIs.",
    };
  }

  if (firebaseConfig && firebaseConfig.enabled === false) {
    const missingFields = Array.isArray(firebaseConfig.missingFields)
      ? firebaseConfig.missingFields.filter((field) => typeof field === "string" && field.trim())
      : [];
    const missingHint = missingFields.length > 0
      ? ` Missing public Firebase fields: ${missingFields.join(", ")}.`
      : "";
    return {
      tone: "error",
      message: `Google sign-in is not enabled on this deployment yet. The Firebase web config endpoint is still incomplete.${missingHint}`,
    };
  }

  return {
    tone: "",
    message: "Sign in with Google to connect your profile, purchases, and support feedback.",
  };
}

function renderPanel(panel, session, firebaseConfig, pendingMessage = "") {
  const authenticated = Boolean(session?.isAuthenticated);
  const status = classifyStatus(session, firebaseConfig, pendingMessage);

  if (authenticated) {
    panel.titleEl.textContent = getPreferredLabel(session);
    panel.subtitleEl.textContent = session?.email || "Google account connected";
    panel.primaryBtn.textContent = "Refresh account";
    panel.secondaryBtn.hidden = false;
  } else {
    panel.titleEl.textContent = session?.stubbed
      ? "Local static mode"
      : (firebaseConfig && firebaseConfig.enabled === false ? "Google sign-in unavailable" : "Guest session");
    panel.subtitleEl.textContent = session?.stubbed
      ? "The local static server skips the live auth APIs by default."
      : "Keep your arcade identity consistent anywhere you play.";
    panel.primaryBtn.textContent = firebaseConfig && firebaseConfig.enabled === false
      ? "Refresh status"
      : "Sign in with Google";
    panel.secondaryBtn.hidden = true;
  }

  panel.statusEl.textContent = status.message;
  panel.statusEl.classList.toggle("warning", status.tone === "warning");
  panel.statusEl.classList.toggle("error", status.tone === "error");

  if (session?.photoURL && authenticated) {
    panel.avatarEl.src = session.photoURL;
    panel.avatarEl.classList.add("has-photo");
  } else {
    panel.avatarEl.removeAttribute("src");
    panel.avatarEl.classList.remove("has-photo");
  }
}

function findStandaloneHost() {
  return (
    document.querySelector(".topbar .links") ||
    document.querySelector(".topbar > div:last-child") ||
    document.querySelector(".topbar") ||
    document.body
  );
}

function mountIntoProfileModal() {
  const modal = document.getElementById("profileModal");
  const profileBtn = document.getElementById("profileBtn");
  if (!modal || !profileBtn) {
    return null;
  }
  if (document.getElementById(INLINE_SECTION_ID)) {
    return { kind: "inline", triggerEl: profileBtn, panel: null };
  }

  const modalCard = modal.querySelector(".modal");
  if (!modalCard) {
    return null;
  }

  const heading = modalCard.querySelector("h2");
  if (heading && heading.textContent.trim().toLowerCase() === "set your name") {
    heading.textContent = "Profile";
  }

  const panel = createAccountPanel({ inline: true, includeClose: false });
  panel.root.id = INLINE_SECTION_ID;
  panel.root.classList.add("cade-account-divider");

  const nameInput = modalCard.querySelector("#profileName");
  if (nameInput) {
    nameInput.insertAdjacentElement("afterend", panel.root);
  } else {
    modalCard.appendChild(panel.root);
  }

  return {
    kind: "inline",
    triggerEl: profileBtn,
    panel,
  };
}

function mountStandaloneModal() {
  if (document.getElementById(STANDALONE_MODAL_ID)) {
    return {
      kind: "modal",
      triggerEl: document.getElementById(STANDALONE_TRIGGER_ID),
      panel: null,
      backdropEl: document.getElementById(STANDALONE_MODAL_ID),
    };
  }

  const host = findStandaloneHost();
  const triggerEl = document.createElement("button");
  triggerEl.type = "button";
  triggerEl.id = STANDALONE_TRIGGER_ID;
  triggerEl.className = "cade-account-launcher";
  triggerEl.textContent = "Account";
  host.appendChild(triggerEl);

  const backdropEl = document.createElement("div");
  backdropEl.id = STANDALONE_MODAL_ID;
  backdropEl.className = "cade-account-modal-backdrop";
  backdropEl.innerHTML = `
    <div class="cade-account-modal" role="dialog" aria-modal="true" aria-labelledby="cadeAccountModalTitle">
      <h2 id="cadeAccountModalTitle">Account</h2>
    </div>
  `;
  document.body.appendChild(backdropEl);

  const modalCard = backdropEl.querySelector(".cade-account-modal");
  const panel = createAccountPanel({ includeClose: true });
  modalCard.appendChild(panel.root);

  let lastFocusedElement = null;

  const closeModal = () => {
    backdropEl.classList.remove("active");
    if (lastFocusedElement) {
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  };
  triggerEl.addEventListener("click", () => {
    lastFocusedElement = document.activeElement;
    backdropEl.classList.add("active");
  });
  panel.closeBtn?.addEventListener("click", closeModal);
  backdropEl.addEventListener("click", (event) => {
    if (event.target === backdropEl) {
      closeModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && backdropEl.classList.contains("active")) {
      closeModal();
    }
  });

  return {
    kind: "modal",
    triggerEl,
    panel,
    backdropEl,
  };
}

export function mountAccountWidget() {
  if (document.getElementById(INLINE_SECTION_ID) || document.getElementById(STANDALONE_MODAL_ID)) {
    return;
  }

  injectStyles();

  const mounted = mountIntoProfileModal() || mountStandaloneModal();
  if (!mounted || !mounted.panel) {
    return;
  }

  const panel = mounted.panel;
  const billingSection = createBillingSection();
  const familySection = createFamilySection();
  panel.root.appendChild(billingSection.root);
  panel.root.appendChild(familySection.root);
  const triggerEl = mounted.triggerEl;
  let currentSession = null;
  let firebaseConfig = null;
  let billingConfig = null;
  let familyState = null;
  let inviteToken = getFamilyInviteTokenFromUrl();

  function setFamilyStatus(message, tone = "") {
    familySection.statusEl.textContent = message;
    familySection.statusEl.classList.toggle("warning", tone === "warning");
    familySection.statusEl.classList.toggle("error", tone === "error");
  }

  function setBillingStatus(message, tone = "") {
    billingSection.statusEl.textContent = message;
    billingSection.statusEl.classList.toggle("warning", tone === "warning");
    billingSection.statusEl.classList.toggle("error", tone === "error");
  }

  function toggleFamilyLoading(loading) {
    familySection.inviteBtn.disabled = loading;
    familySection.acceptBtn.disabled = loading;
    familySection.emailInput.disabled = loading;
  }

  function toggleBillingLoading(loading) {
    billingSection.manageBtn.disabled = loading;
    billingSection.plansBtn.disabled = loading;
  }

  function renderBillingSection() {
    const session = currentSession;
    const authenticated = Boolean(session?.isAuthenticated);
    const stripeEnabled = isStripeBillingEnabled(billingConfig);
    const billing = familyState?.billing || null;
    const model = buildBillingOverviewModel({
      billing,
      billingEnabled: stripeEnabled,
    });

    renderBillingCards(billingSection, model);
    billingSection.manageBtn.hidden = !model.canManageBilling;
    billingSection.manageBtn.disabled = !model.canManageBilling;
    billingSection.plansBtn.disabled = false;

    if (!authenticated) {
      billingSection.cardsEl.hidden = true;
      setBillingStatus("Sign in with Google to see your subscription status and manage billing.");
      return;
    }

    if (!familyState) {
      billingSection.cardsEl.hidden = true;
      setBillingStatus(stripeEnabled ? "Loading billing details..." : model.statusMessage, model.tone);
      billingSection.manageBtn.hidden = !stripeEnabled;
      billingSection.manageBtn.disabled = !stripeEnabled;
      return;
    }

    setBillingStatus(model.statusMessage, model.tone);
  }

  function renderMemberCards(summary) {
    familySection.membersListEl.textContent = "";
    const family = summary?.family;
    const members = Array.isArray(family?.members) ? family.members : [];
    familySection.membersListEl.hidden = members.length === 0;
    for (const member of members) {
      const card = document.createElement("article");
      card.className = "cade-family-card";
      const badge = document.createElement("span");
      badge.className = "cade-family-badge";
      badge.textContent = member.role === "owner" ? "Owner" : "Member";
      card.appendChild(badge);
      const title = document.createElement("strong");
      title.textContent = member.displayName || member.email || member.userId;
      card.appendChild(title);
      const email = document.createElement("span");
      email.textContent = member.email || member.userId;
      card.appendChild(email);
      if (member.role !== "owner" && summary.family.ownerUserId === currentSession?.userId) {
        const actions = document.createElement("div");
        actions.className = "cade-family-actions";
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "cade-family-btn danger";
        removeBtn.textContent = "Remove member";
        removeBtn.addEventListener("click", async () => {
          toggleFamilyLoading(true);
          try {
            setFamilyStatus("Removing family member...");
            familyState = await removeFamilyMember({ memberUserId: member.userId });
            renderFamilySection();
          } catch (error) {
            setFamilyStatus(String(error?.message || error || "Could not remove family member."), "error");
          } finally {
            toggleFamilyLoading(false);
          }
        });
        actions.appendChild(removeBtn);
        card.appendChild(actions);
      }
      familySection.membersListEl.appendChild(card);
    }
  }

  function renderInviteCards(summary) {
    familySection.invitesListEl.textContent = "";
    const invites = Array.isArray(summary?.family?.invites) ? summary.family.invites : [];
    const pendingInvites = invites.filter((invite) => invite.status === "pending");
    const isOwner = summary?.family?.ownerUserId === currentSession?.userId;
    familySection.invitesListEl.hidden = pendingInvites.length === 0;
    for (const invite of pendingInvites) {
      const delivery = invite.lastEmailDelivery;
      const lines = [
        `Expires ${formatFamilyDate(invite.expiresAt)}`,
        describeInviteDelivery(invite),
      ];
      if (delivery?.updatedAt) {
        lines.push(`Last email update: ${formatFamilyDateTime(delivery.updatedAt)}`);
      }
      const badge = delivery?.status === "failed"
        ? "Needs attention"
        : (delivery?.status === "sent" ? "Sent" : "Pending");
      const card = createFamilyCard(invite.email, lines, badge);
      if (isOwner) {
        const actions = document.createElement("div");
        actions.className = "cade-family-actions";
        if (invite.inviteUrl) {
          const copyBtn = document.createElement("button");
          copyBtn.type = "button";
          copyBtn.className = "cade-family-btn";
          copyBtn.textContent = "Copy link";
          copyBtn.addEventListener("click", async () => {
            copyBtn.disabled = true;
            try {
              await copyTextToClipboard(invite.inviteUrl);
              setFamilyStatus(`Invite link copied for ${invite.email}.`);
            } catch (error) {
              setFamilyStatus(String(error?.message || error || "Could not copy the invite link."), "error");
            } finally {
              copyBtn.disabled = false;
            }
          });
          actions.appendChild(copyBtn);
        }

        const resendBtn = document.createElement("button");
        resendBtn.type = "button";
        resendBtn.className = "cade-family-btn";
        resendBtn.textContent = "Resend";
        resendBtn.addEventListener("click", async () => {
          resendBtn.disabled = true;
          toggleFamilyLoading(true);
          try {
            setFamilyStatus(`Resending invite to ${invite.email}...`);
            familyState = await resendFamilyInvite({ inviteId: invite.id });
            renderFamilySection();
          } catch (error) {
            setFamilyStatus(String(error?.message || error || "Could not resend the family invite."), "error");
          } finally {
            toggleFamilyLoading(false);
            resendBtn.disabled = false;
          }
        });
        actions.appendChild(resendBtn);

        const revokeBtn = document.createElement("button");
        revokeBtn.type = "button";
        revokeBtn.className = "cade-family-btn danger";
        revokeBtn.textContent = "Revoke";
        revokeBtn.addEventListener("click", async () => {
          revokeBtn.disabled = true;
          toggleFamilyLoading(true);
          try {
            setFamilyStatus(`Revoking invite for ${invite.email}...`);
            familyState = await revokeFamilyInvite({ inviteId: invite.id });
            renderFamilySection();
          } catch (error) {
            setFamilyStatus(String(error?.message || error || "Could not revoke the family invite."), "error");
          } finally {
            toggleFamilyLoading(false);
            revokeBtn.disabled = false;
          }
        });
        actions.appendChild(revokeBtn);
        card.appendChild(actions);
      }
      familySection.invitesListEl.appendChild(card);
    }
  }

  function renderFamilySummaryCards(summary) {
    familySection.summaryListEl.textContent = "";
    const family = summary?.family;
    if (!family) {
      familySection.summaryListEl.hidden = true;
      return;
    }
    const reservedSeatCount = Number(family.reservedSeatCount || family.seatCount || 0);
    const pendingInviteCount = Number(family.pendingInviteCount || 0);
    const seatUsage = `${reservedSeatCount}/${family.seatLimit} seats reserved`;
    familySection.summaryListEl.appendChild(createFamilyCard(
      family.status === "active" ? "Family plan active" : "Family plan inactive",
      [
        family.planId ? `Plan: ${family.planId}` : "No active family billing plan",
        seatUsage,
        `${family.seatCount} member${family.seatCount === 1 ? "" : "s"} active, ${pendingInviteCount} pending invite${pendingInviteCount === 1 ? "" : "s"}`,
      ],
      family.status === "active" ? "Active" : "Paused",
    ));
    const deliveries = Array.isArray(family.recentEmailDeliveries) ? family.recentEmailDeliveries : [];
    if (deliveries.length > 0) {
      const latest = deliveries[0];
      familySection.summaryListEl.appendChild(createFamilyCard(
        "Latest family email",
        [
          `${latest.subject || latest.templateKey} -> ${latest.to}`,
          `Status: ${latest.status}`,
        ],
        "Email",
      ));
    }
    familySection.summaryListEl.hidden = false;
  }

  function renderFamilySection() {
    const session = currentSession;
    const summary = familyState;
    const authenticated = Boolean(session?.isAuthenticated);
    const family = summary?.family || null;
    const isOwner = authenticated && family && family.ownerUserId === session?.userId;

    familySection.formEl.hidden = true;
    familySection.summaryListEl.hidden = true;
    familySection.membersListEl.hidden = true;
    familySection.invitesListEl.hidden = true;
    familySection.inviteBtn.hidden = true;
    familySection.emailInput.hidden = false;
    familySection.acceptBtn.hidden = !inviteToken;

    if (!authenticated) {
      setFamilyStatus(inviteToken
        ? "Sign in with Google to accept this family invite."
        : "Sign in with Google to manage family sharing or accept invites.");
      return;
    }

    if (!summary) {
      setFamilyStatus("Loading family details...");
      return;
    }

    renderFamilySummaryCards(summary);
    renderMemberCards(summary);
    renderInviteCards(summary);

    if (family) {
      if (family.status === "active" && isOwner) {
        setFamilyStatus(`You are sharing ${family.planId || "your family plan"} with ${family.seatCount} active members and ${family.pendingInviteCount || 0} pending invites. ${family.reservedSeatCount || family.seatCount}/${family.seatLimit} seats are reserved.`);
        familySection.formEl.hidden = false;
        familySection.inviteBtn.hidden = false;
      } else if (family.ownerUserId === session?.userId) {
        setFamilyStatus("Your family account is set up, but the family subscription is not active right now.", "warning");
      } else {
        const ownerName = family.ownerDisplayName || family.ownerEmail || "your organizer";
        setFamilyStatus(`You're currently covered by ${ownerName}'s family plan.`);
      }
    } else {
      setFamilyStatus("Activate a family plan on the plans page to invite up to four more family members.");
    }

    if (inviteToken) {
      familySection.formEl.hidden = false;
      familySection.acceptBtn.hidden = false;
      if (!isOwner) {
        familySection.inviteBtn.hidden = true;
        familySection.emailInput.hidden = true;
      }
      if (!family || family.ownerUserId !== session?.userId) {
        setFamilyStatus("Family invite ready. Accept it below to join the shared plan.");
      }
    }
  }

  async function refreshFamilySummary({ pendingMessage = "" } = {}) {
    if (!currentSession?.isAuthenticated) {
      familyState = null;
      renderBillingSection();
      renderFamilySection();
      return;
    }
    toggleFamilyLoading(true);
    toggleBillingLoading(true);
    if (pendingMessage) {
      setFamilyStatus(pendingMessage);
    }
    try {
      familyState = await fetchFamilyBillingSummary();
      renderBillingSection();
      renderFamilySection();
    } catch (error) {
      familyState = null;
      renderBillingSection();
      setBillingStatus(String(error?.message || error || "Could not load billing details."), "error");
      setFamilyStatus(String(error?.message || error || "Could not load family details."), "error");
    } finally {
      toggleFamilyLoading(false);
      toggleBillingLoading(false);
    }
  }

  function render(session, pendingMessage = "") {
    currentSession = session;
    renderPanel(panel, session, firebaseConfig, pendingMessage);
    if (triggerEl && mounted.kind === "modal") {
      triggerEl.textContent = session?.isAuthenticated
        ? `Account: ${getPreferredLabel(session).slice(0, 18)}`
        : "Account";
    }
    renderBillingSection();
    renderFamilySection();
  }

  panel.primaryBtn.addEventListener("click", async () => {
    panel.primaryBtn.disabled = true;
    panel.secondaryBtn.disabled = true;
    try {
      if (!currentSession?.isAuthenticated && firebaseConfig && firebaseConfig.enabled === false) {
        [firebaseConfig, billingConfig] = await Promise.all([
          getFirebaseWebConfig().catch(() => firebaseConfig),
          fetchBillingConfig({ force: true }).catch(() => billingConfig),
        ]);
        const session = await fetchAuthSession({ force: true });
        render(session);
        return;
      }

      render(currentSession, currentSession?.isAuthenticated ? "Refreshing account..." : "Opening Google sign-in...");
      billingConfig = await fetchBillingConfig({ force: true }).catch(() => billingConfig);
      const session = currentSession?.isAuthenticated
        ? await fetchAuthSession({ force: true })
        : await signInWithGoogle();
      render(session);
      await refreshFamilySummary();
    } catch (error) {
      render(currentSession, String(error?.message || error || "Google sign-in failed."));
      panel.statusEl.classList.add("error");
    } finally {
      panel.primaryBtn.disabled = false;
      panel.secondaryBtn.disabled = false;
    }
  });

  panel.secondaryBtn.addEventListener("click", async () => {
    panel.primaryBtn.disabled = true;
    panel.secondaryBtn.disabled = true;
    try {
      render(currentSession, "Signing out...");
      const session = await signOutFromApp();
      familyState = null;
      render(session);
    } catch (error) {
      render(currentSession, String(error?.message || error || "Could not sign out."));
      panel.statusEl.classList.add("error");
    } finally {
      panel.primaryBtn.disabled = false;
      panel.secondaryBtn.disabled = false;
    }
  });

  billingSection.manageBtn.addEventListener("click", async () => {
    if (!isStripeBillingEnabled(billingConfig)) return;
    toggleBillingLoading(true);
    try {
      setBillingStatus("Opening Stripe billing portal...");
      const billingEmail = familyState?.billing?.customerEmail || currentSession?.email || "";
      const portal = await createStripePortalSession({
        customerEmail: billingEmail,
        returnUrl: window.location.href,
      });
      window.location.assign(portal.url);
    } catch (error) {
      setBillingStatus(String(error?.message || error || "Could not open billing management."), "error");
    } finally {
      toggleBillingLoading(false);
    }
  });

  billingSection.plansBtn.addEventListener("click", () => {
    window.location.assign("/pricing.html");
  });

  familySection.inviteBtn.addEventListener("click", async () => {
    toggleFamilyLoading(true);
    try {
      setFamilyStatus("Sending family invite...");
      familyState = await sendFamilyInvite({ email: familySection.emailInput.value });
      familySection.emailInput.value = "";
      renderFamilySection();
    } catch (error) {
      setFamilyStatus(String(error?.message || error || "Could not send the family invite."), "error");
    } finally {
      toggleFamilyLoading(false);
    }
  });

  familySection.acceptBtn.addEventListener("click", async () => {
    toggleFamilyLoading(true);
    try {
      setFamilyStatus("Accepting family invite...");
      familyState = await acceptFamilyInvite({ token: inviteToken });
      clearFamilyInviteTokenFromUrl();
      inviteToken = "";
      renderFamilySection();
    } catch (error) {
      setFamilyStatus(String(error?.message || error || "Could not accept the family invite."), "error");
    } finally {
      toggleFamilyLoading(false);
    }
  });

  onAuthSessionChanged((session) => {
    render(session);
    if (session?.isAuthenticated) {
      refreshFamilySummary();
    }
  });

  Promise.all([
    getFirebaseWebConfig().catch(() => ({ enabled: false })),
    fetchBillingConfig().catch(() => null),
    fetchAuthSession(),
  ]).then(([config, nextBillingConfig, session]) => {
    firebaseConfig = config;
    billingConfig = nextBillingConfig;
    render(session);
    if (session?.isAuthenticated) {
      return refreshFamilySummary();
    }
    return null;
  }).catch((error) => {
    firebaseConfig = { enabled: false };
    render(currentSession, String(error?.message || error || "Account unavailable."));
  });
}
