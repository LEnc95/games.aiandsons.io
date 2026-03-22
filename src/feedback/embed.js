import { submitFeedback } from "./client.js";

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

export function mountGameFeedback({ gameSlug = "", gameName = "" } = {}) {
  if (!gameSlug || !gameName || document.getElementById(ROOT_ID)) return;
  injectStyles();

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.innerHTML = `
    <button type="button" class="cade-feedback-launcher" id="cadeFeedbackOpenBtn" aria-haspopup="dialog">
      Report Feedback
    </button>
    <div class="cade-feedback-backdrop" id="cadeFeedbackBackdrop" aria-hidden="true">
      <div class="cade-feedback-modal" role="dialog" aria-modal="true" aria-labelledby="cadeFeedbackTitle">
        <h2 id="cadeFeedbackTitle">Share feedback for ${gameName}</h2>
        <p>Tell us about bugs, rough spots, or ideas while the details are still fresh.</p>
        <form class="cade-feedback-form" id="cadeFeedbackForm">
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
          <div class="cade-feedback-status" id="cadeFeedbackStatus" aria-live="polite"></div>
          <div class="cade-feedback-actions">
            <button type="button" class="cade-feedback-btn" id="cadeFeedbackCancelBtn">Cancel</button>
            <button type="submit" class="cade-feedback-btn primary" id="cadeFeedbackSubmitBtn">Send Feedback</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const openBtn = document.getElementById("cadeFeedbackOpenBtn");
  const backdrop = document.getElementById("cadeFeedbackBackdrop");
  const form = document.getElementById("cadeFeedbackForm");
  const cancelBtn = document.getElementById("cadeFeedbackCancelBtn");
  const submitBtn = document.getElementById("cadeFeedbackSubmitBtn");
  const summaryInput = document.getElementById("cadeFeedbackSummary");
  const statusEl = document.getElementById("cadeFeedbackStatus");

  function setStatus(message, tone = "") {
    statusEl.textContent = message;
    statusEl.className = `cade-feedback-status${tone ? ` ${tone}` : ""}`;
  }

  function openModal() {
    backdrop.classList.add("active");
    backdrop.setAttribute("aria-hidden", "false");
    setStatus("");
    requestAnimationFrame(() => summaryInput?.focus());
  }

  function closeModal() {
    backdrop.classList.remove("active");
    backdrop.setAttribute("aria-hidden", "true");
    openBtn.focus();
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    setStatus("Sending feedback...");

    try {
      const formData = new FormData(form);
      const extraContext = await Promise.resolve(resolveExtraContext());
      const response = await submitFeedback({
        gameSlug,
        gameName,
        kind: formData.get("kind"),
        summary: formData.get("summary"),
        details: formData.get("details"),
        reproSteps: formData.get("reproSteps"),
        displayName: formData.get("displayName"),
        contactEmail: formData.get("contactEmail"),
        pageContext: {
          extraContext,
        },
      });
      setStatus(`Feedback sent. Reference: ${response.submissionId}`, "success");
      form.reset();
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
