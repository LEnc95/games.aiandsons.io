import { submitFeedback } from "./client.js";
import {
  fetchAuthSession,
  onAuthSessionChanged,
  signInWithGoogle,
  signOutFromApp,
} from "../auth/client.js";

const ROOT_ID = "cadeFeedbackRoot";
const STYLE_ID = "cadeFeedbackStyles";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .cade-feedback-launcher {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 12px);
      right: calc(env(safe-area-inset-right, 0px) + 12px);
      z-index: 10001;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 40px;
      padding: 10px 14px;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 999px;
      background: rgba(6, 12, 24, 0.82);
      color: #eef5ff;
      font: 600 14px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(0,0,0,0.28);
      backdrop-filter: blur(10px) saturate(140%);
    }
    .cade-feedback-launcher:hover {
      background: rgba(10, 20, 38, 0.92);
    }
    .cade-feedback-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10002;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(3, 7, 15, 0.72);
      backdrop-filter: blur(10px);
    }
    .cade-feedback-backdrop.active {
      display: flex;
    }
    .cade-feedback-modal {
      width: min(640px, 100%);
      max-height: min(90dvh, 820px);
      overflow: auto;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.12);
      background: linear-gradient(180deg, rgba(14,26,51,0.98) 0%, rgba(7,15,31,0.98) 100%);
      color: #eef5ff;
      padding: 20px;
      box-shadow: 0 24px 48px rgba(0,0,0,0.34);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    .cade-feedback-modal h2 {
      margin: 0 0 8px 0;
      font-size: 24px;
    }
    .cade-feedback-modal p {
      margin: 0;
      color: #bdd0ee;
      line-height: 1.5;
    }
    .cade-feedback-form {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }
    .cade-feedback-field {
      display: grid;
      gap: 6px;
    }
    .cade-feedback-field label {
      font-size: 13px;
      font-weight: 700;
      color: #dce9ff;
    }
    .cade-feedback-field input,
    .cade-feedback-field select,
    .cade-feedback-field textarea {
      width: 100%;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.06);
      color: #f5f9ff;
      padding: 11px 12px;
      font: 500 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    .cade-feedback-field textarea {
      min-height: 110px;
      resize: vertical;
    }
    .cade-feedback-file-copy {
      font-size: 12px;
      color: #bdd0ee;
      line-height: 1.5;
    }
    .cade-feedback-file-list {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .cade-feedback-file-list li {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.04);
      font-size: 12px;
      color: #d7e6ff;
    }
    .cade-feedback-inline {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .cade-feedback-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 4px;
    }
    .cade-feedback-account {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.04);
    }
    .cade-feedback-account-copy {
      display: grid;
      gap: 4px;
    }
    .cade-feedback-account-copy strong {
      font-size: 13px;
      color: #eef5ff;
    }
    .cade-feedback-account-copy span {
      font-size: 12px;
      color: #bdd0ee;
    }
    .cade-feedback-account-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .cade-feedback-btn {
      min-height: 42px;
      padding: 11px 16px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.08);
      color: #eef5ff;
      font: 700 14px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      cursor: pointer;
    }
    .cade-feedback-btn.primary {
      background: linear-gradient(135deg, #67cbff 0%, #8bf4da 100%);
      border-color: rgba(255,255,255,0.34);
      color: #08111f;
    }
    .cade-feedback-status {
      min-height: 20px;
      margin-top: 6px;
      font-size: 13px;
      color: #b9d4fb;
    }
    .cade-feedback-status.error {
      color: #ffb8c3;
    }
    .cade-feedback-status.success {
      color: #baf7d3;
    }
    @media (max-width: 640px) {
      .cade-feedback-inline {
        grid-template-columns: 1fr;
      }
      .cade-feedback-launcher {
        min-height: 38px;
        padding: 9px 12px;
        font-size: 13px;
      }
      .cade-feedback-modal {
        padding: 16px;
      }
    }
  `;
  document.head.appendChild(style);
}

function resolveExtraContext() {
  try {
    if (typeof window.__CADE_FEEDBACK_CONTEXT__ === "function") {
      return window.__CADE_FEEDBACK_CONTEXT__() || {};
    }
    if (window.__CADE_FEEDBACK_CONTEXT__ && typeof window.__CADE_FEEDBACK_CONTEXT__ === "object") {
      return window.__CADE_FEEDBACK_CONTEXT__;
    }
  } catch {
    return {};
  }
  return {};
}

function formatAttachmentSize(size) {
  const bytes = Math.max(0, Number(size) || 0);
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 102.4) / 10)} KB`;
  }
  return `${bytes} B`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file?.name || "attachment"}.`));
    reader.readAsDataURL(file);
  });
}

export function mountGameFeedback({ gameSlug = "", gameName = "" } = {}) {
  if (!gameSlug || !gameName || document.getElementById(ROOT_ID)) return;
  injectStyles();

  const root = document.createElement("div");
  root.id = ROOT_ID;

  const htmlTemplate = `
    <button type="button" class="cade-feedback-launcher" id="cadeFeedbackOpenBtn" aria-haspopup="dialog">
      Report Feedback
    </button>
    <div class="cade-feedback-backdrop" id="cadeFeedbackBackdrop" aria-hidden="true">
      <div class="cade-feedback-modal" role="dialog" aria-modal="true" aria-labelledby="cadeFeedbackTitle">
        <h2 id="cadeFeedbackTitle"></h2>
        <p>Tell us about bugs, rough spots, or ideas while the details are still fresh.</p>
        <form class="cade-feedback-form" id="cadeFeedbackForm">
          <div class="cade-feedback-account" id="cadeFeedbackAccount">
            <div class="cade-feedback-account-copy">
              <strong id="cadeFeedbackAccountTitle">Checking account...</strong>
              <span id="cadeFeedbackAccountSubtitle">Sign in with Google if you want your reports tied to your arcade account.</span>
            </div>
            <div class="cade-feedback-account-actions">
              <button type="button" class="cade-feedback-btn primary" id="cadeFeedbackSignInBtn">Sign in with Google</button>
              <button type="button" class="cade-feedback-btn" id="cadeFeedbackSignOutBtn" hidden>Sign out</button>
            </div>
          </div>
          <div class="cade-feedback-field">
            <label for="cadeFeedbackKind">Feedback Type</label>
            <select id="cadeFeedbackKind" name="kind" required>
              <option value="bug">Bug report</option>
              <option value="feature">Idea or feature</option>
              <option value="general">General feedback</option>
            </select>
          </div>
          <div class="cade-feedback-field">
            <label for="cadeFeedbackSummary">Short Summary</label>
            <input id="cadeFeedbackSummary" name="summary" type="text" maxlength="140" required placeholder="What happened or what should change?" />
          </div>
          <div class="cade-feedback-field">
            <label for="cadeFeedbackDetails">Details</label>
            <textarea id="cadeFeedbackDetails" name="details" required placeholder="What did you see, expect, or want?"></textarea>
          </div>
          <div class="cade-feedback-field">
            <label for="cadeFeedbackRepro">Repro Steps (Optional)</label>
            <textarea id="cadeFeedbackRepro" name="reproSteps" placeholder="How can we reproduce it?"></textarea>
          </div>
          <div class="cade-feedback-inline">
            <div class="cade-feedback-field">
              <label for="cadeFeedbackName">Name (Optional)</label>
              <input id="cadeFeedbackName" name="displayName" type="text" maxlength="80" placeholder="How should we refer to you?" />
            </div>
            <div class="cade-feedback-field">
              <label for="cadeFeedbackEmail">Email (Optional)</label>
              <input id="cadeFeedbackEmail" name="contactEmail" type="email" maxlength="160" placeholder="you@example.com" />
            </div>
          </div>
          <div class="cade-feedback-field">
            <label for="cadeFeedbackAttachmentInput">Attachments (Optional)</label>
            <input id="cadeFeedbackAttachmentInput" name="attachments" type="file" accept="image/png,image/jpeg,image/webp,image/gif,text/plain,application/json,application/pdf,.txt,.log,.json,.pdf" multiple />
            <div class="cade-feedback-file-copy">Add up to 2 files. Screenshots, logs, JSON, and PDFs work best. Keep each file under 900 KB.</div>
            <ul class="cade-feedback-file-list" id="cadeFeedbackFileList"></ul>
          </div>
          <div class="cade-feedback-status" id="cadeFeedbackStatus" aria-live="polite"></div>
          <div class="cade-feedback-actions">
            <button type="button" class="cade-feedback-btn" id="cadeFeedbackCancelBtn">Cancel</button>
            <button type="submit" class="cade-feedback-btn primary" id="cadeFeedbackSubmitBtn">Send Feedback</button>
          </div>
        </form>
      </div>
    </div>
  `;

  root.insertAdjacentHTML("beforeend", htmlTemplate);
  document.body.appendChild(root);

  const titleEl = document.getElementById("cadeFeedbackTitle");
  if (titleEl) {
    titleEl.textContent = `Share feedback for ${gameName}`;
  }

  const openBtn = document.getElementById("cadeFeedbackOpenBtn");
  const backdrop = document.getElementById("cadeFeedbackBackdrop");
  const form = document.getElementById("cadeFeedbackForm");
  const cancelBtn = document.getElementById("cadeFeedbackCancelBtn");
  const submitBtn = document.getElementById("cadeFeedbackSubmitBtn");
  const summaryInput = document.getElementById("cadeFeedbackSummary");
  const displayNameInput = document.getElementById("cadeFeedbackName");
  const emailInput = document.getElementById("cadeFeedbackEmail");
  const attachmentInput = document.getElementById("cadeFeedbackAttachmentInput");
  const fileList = document.getElementById("cadeFeedbackFileList");
  const statusEl = document.getElementById("cadeFeedbackStatus");
  const accountTitleEl = document.getElementById("cadeFeedbackAccountTitle");
  const accountSubtitleEl = document.getElementById("cadeFeedbackAccountSubtitle");
  const signInBtn = document.getElementById("cadeFeedbackSignInBtn");
  const signOutBtn = document.getElementById("cadeFeedbackSignOutBtn");

  let currentSession = null;
  let lastFocusedElement = null;

  function setStatus(message, tone = "") {
    statusEl.textContent = message;
    statusEl.className = `cade-feedback-status${tone ? ` ${tone}` : ""}`;
  }

  function buildSuccessMessage(response = {}) {
    const issueIdentifier = String(response.linearIssueIdentifier || "").trim();
    const baselineLabel = String(
      response.linearParentIssueIdentifier
      || response.linearParentIssueTitle
      || "",
    ).trim();

    if (response.syncStatus === "synced" && issueIdentifier) {
      return baselineLabel
        ? `Feedback sent. Linear issue ${issueIdentifier} is linked under ${baselineLabel}.`
        : `Feedback sent. Linear issue ${issueIdentifier} is ready for triage.`;
    }

    if (response.syncStatus === "pending") {
      return `Feedback saved. Linear sync is pending. Reference: ${response.submissionId}`;
    }

    return `Feedback sent. Reference: ${response.submissionId}`;
  }

  function renderAccountState(session) {
    currentSession = session;
    const isAuthenticated = Boolean(session?.isAuthenticated);
    const isStubbed = Boolean(session?.stubbed);
    if (isAuthenticated) {
      accountTitleEl.textContent = session.displayName || session.email || "Google account connected";
      accountSubtitleEl.textContent = session.email || "Reports from this browser will be tied to your account session.";
      signInBtn.textContent = "Refresh session";
      signInBtn.disabled = false;
      signOutBtn.hidden = false;
      if (displayNameInput && !displayNameInput.value && session.displayName) {
        displayNameInput.value = session.displayName;
      }
      if (emailInput && !emailInput.value && session.email) {
        emailInput.value = session.email;
      }
      return;
    }

    accountTitleEl.textContent = isStubbed ? "Local static mode" : "Guest session";
    accountSubtitleEl.textContent = isStubbed
      ? "Auth APIs are muted on localhost. Add ?authApiProbe=1 to test the live Google sign-in flow."
      : "Sign in with Google if you want your reports tied to your arcade account.";
    signInBtn.textContent = isStubbed ? "Local mode" : "Sign in with Google";
    signInBtn.disabled = isStubbed;
    signOutBtn.hidden = true;
  }

  function openModal() {
    lastFocusedElement = document.activeElement;
    backdrop.classList.add("active");
    backdrop.setAttribute("aria-hidden", "false");
    setStatus("");
    requestAnimationFrame(() => summaryInput?.focus());
  }

  function closeModal() {
    backdrop.classList.remove("active");
    backdrop.setAttribute("aria-hidden", "true");
    if (lastFocusedElement) {
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  }

  function renderSelectedFiles() {
    const files = Array.from(attachmentInput?.files || []);
    if (!fileList) return;

    // Clear the list before appending
    fileList.innerHTML = "";
    if (!files.length) {
      return;
    }

    // Security enhancement: Use textContent instead of innerHTML to prevent XSS
    // from malicious file names containing HTML/JS tags
    for (const file of files) {
      const li = document.createElement("li");
      li.textContent = `${file.name} (${formatAttachmentSize(file.size)})`;
      fileList.appendChild(li);
    }
  }

  openBtn.addEventListener("click", openModal);
  cancelBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && backdrop.classList.contains("active")) {
      closeModal();
    }
  });
  attachmentInput?.addEventListener("change", renderSelectedFiles);
  signInBtn?.addEventListener("click", async () => {
    signInBtn.disabled = true;
    signOutBtn.disabled = true;
    setStatus("Opening Google sign-in...");
    try {
      const session = currentSession?.isAuthenticated
        ? await fetchAuthSession({ force: true })
        : await signInWithGoogle();
      renderAccountState(session);
      setStatus(session?.isAuthenticated ? "Google account connected." : "Session refreshed.", "success");
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), "error");
    } finally {
      signInBtn.disabled = false;
      signOutBtn.disabled = false;
    }
  });
  signOutBtn?.addEventListener("click", async () => {
    signInBtn.disabled = true;
    signOutBtn.disabled = true;
    setStatus("Signing out...");
    try {
      const session = await signOutFromApp();
      renderAccountState(session);
      setStatus("Signed out. Reports from this browser will use the guest session.", "success");
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), "error");
    } finally {
      signInBtn.disabled = false;
      signOutBtn.disabled = false;
    }
  });

  onAuthSessionChanged(renderAccountState);
  fetchAuthSession().then(renderAccountState).catch(() => {
    renderAccountState(null);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    setStatus("Sending feedback...");

    try {
      const formData = new FormData(form);
      const extraContext = await Promise.resolve(resolveExtraContext());
      const attachments = await Promise.all(
        Array.from(attachmentInput?.files || []).map(async (file) => ({
          name: file.name,
          contentType: file.type || "application/octet-stream",
          size: Number(file.size || 0),
          dataUrl: await readFileAsDataUrl(file),
        })),
      );
      const response = await submitFeedback({
        gameSlug,
        gameName,
        kind: formData.get("kind"),
        summary: formData.get("summary"),
        details: formData.get("details"),
        reproSteps: formData.get("reproSteps"),
        displayName: formData.get("displayName"),
        contactEmail: formData.get("contactEmail"),
        attachments,
        pageContext: {
          extraContext,
        },
      });
      setStatus(buildSuccessMessage(response), "success");
      form.reset();
      renderSelectedFiles();
      setTimeout(() => {
        if (backdrop.classList.contains("active")) closeModal();
      }, 900);
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), "error");
    } finally {
      submitBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });
}
