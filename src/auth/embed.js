import {
  fetchAuthSession,
  getFirebaseWebConfig,
  onAuthSessionChanged,
  signInWithGoogle,
  signOutFromApp,
} from "./client.js";

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
      width: min(420px, 100%);
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
    @media (max-width: 680px) {
      .cade-account-actions {
        flex-direction: column;
      }
      .cade-account-btn,
      .cade-account-btn.close {
        width: 100%;
        margin-left: 0;
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
    return {
      tone: "error",
      message: "Google sign-in is not enabled on this deployment yet. The Firebase web config endpoint is still incomplete.",
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

  const closeModal = () => backdropEl.classList.remove("active");
  triggerEl.addEventListener("click", () => backdropEl.classList.add("active"));
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
  const triggerEl = mounted.triggerEl;
  let currentSession = null;
  let firebaseConfig = null;

  function render(session, pendingMessage = "") {
    currentSession = session;
    renderPanel(panel, session, firebaseConfig, pendingMessage);
    if (triggerEl && mounted.kind === "modal") {
      triggerEl.textContent = session?.isAuthenticated
        ? `Account: ${getPreferredLabel(session).slice(0, 18)}`
        : "Account";
    }
  }

  panel.primaryBtn.addEventListener("click", async () => {
    panel.primaryBtn.disabled = true;
    panel.secondaryBtn.disabled = true;
    try {
      if (!currentSession?.isAuthenticated && firebaseConfig && firebaseConfig.enabled === false) {
        firebaseConfig = await getFirebaseWebConfig().catch(() => firebaseConfig);
        const session = await fetchAuthSession({ force: true });
        render(session);
        return;
      }

      render(currentSession, currentSession?.isAuthenticated ? "Refreshing account..." : "Opening Google sign-in...");
      const session = currentSession?.isAuthenticated
        ? await fetchAuthSession({ force: true })
        : await signInWithGoogle();
      render(session);
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
      render(session);
    } catch (error) {
      render(currentSession, String(error?.message || error || "Could not sign out."));
      panel.statusEl.classList.add("error");
    } finally {
      panel.primaryBtn.disabled = false;
      panel.secondaryBtn.disabled = false;
    }
  });

  onAuthSessionChanged((session) => render(session));

  Promise.all([
    getFirebaseWebConfig().catch(() => ({ enabled: false })),
    fetchAuthSession(),
  ]).then(([config, session]) => {
    firebaseConfig = config;
    render(session);
  }).catch((error) => {
    firebaseConfig = { enabled: false };
    render(currentSession, String(error?.message || error || "Account unavailable."));
  });
}
