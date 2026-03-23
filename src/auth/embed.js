import {
  fetchAuthSession,
  onAuthSessionChanged,
  signInWithGoogle,
  signOutFromApp,
} from "./client.js";

const ROOT_ID = "cadeAuthRoot";
const STYLE_ID = "cadeAuthStyles";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .cade-auth-widget {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 12px);
      left: calc(env(safe-area-inset-left, 0px) + 12px);
      z-index: 10001;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 10px 14px;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 999px;
      background: rgba(6, 12, 24, 0.84);
      color: #eef5ff;
      box-shadow: 0 12px 28px rgba(0,0,0,0.28);
      backdrop-filter: blur(10px) saturate(140%);
      font: 600 13px/1.1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    .cade-auth-widget[data-auth-state="authenticated"] {
      background: rgba(8, 20, 36, 0.9);
    }
    .cade-auth-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.08);
      display: none;
    }
    .cade-auth-widget[data-auth-state="authenticated"] .cade-auth-avatar.has-photo {
      display: block;
    }
    .cade-auth-copy {
      display: grid;
      gap: 2px;
    }
    .cade-auth-copy strong {
      font-size: 12px;
      color: #f8fbff;
    }
    .cade-auth-copy span {
      font-size: 11px;
      color: #bdd0ee;
    }
    .cade-auth-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .cade-auth-btn {
      min-height: 34px;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.08);
      color: #eef5ff;
      font: 700 12px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      cursor: pointer;
    }
    .cade-auth-btn.primary {
      background: linear-gradient(135deg, #67cbff 0%, #8bf4da 100%);
      border-color: rgba(255,255,255,0.3);
      color: #07121f;
    }
    @media (max-width: 680px) {
      .cade-auth-widget {
        left: 10px;
        right: 10px;
        justify-content: space-between;
      }
      .cade-auth-copy span {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function getPreferredLabel(session) {
  return session.displayName || session.email || session.userId || "Signed in";
}

export function mountAccountWidget() {
  if (document.getElementById(ROOT_ID)) return;
  injectStyles();

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "cade-auth-widget";
  root.dataset.authState = "loading";
  root.innerHTML = `
    <img class="cade-auth-avatar" alt="" />
    <div class="cade-auth-copy">
      <strong id="cadeAuthTitle">Checking account...</strong>
      <span id="cadeAuthSubtitle">Use Google to keep your arcade profile consistent.</span>
    </div>
    <div class="cade-auth-actions">
      <button type="button" class="cade-auth-btn primary" id="cadeAuthPrimaryBtn">Sign in</button>
      <button type="button" class="cade-auth-btn" id="cadeAuthSecondaryBtn" hidden>Sign out</button>
    </div>
  `;
  document.body.appendChild(root);

  const avatarEl = root.querySelector(".cade-auth-avatar");
  const titleEl = document.getElementById("cadeAuthTitle");
  const subtitleEl = document.getElementById("cadeAuthSubtitle");
  const primaryBtn = document.getElementById("cadeAuthPrimaryBtn");
  const secondaryBtn = document.getElementById("cadeAuthSecondaryBtn");

  let currentSession = null;

  function render(session) {
    currentSession = session;
    const authenticated = Boolean(session?.isAuthenticated);
    const stubbed = Boolean(session?.stubbed);
    root.dataset.authState = authenticated ? "authenticated" : "anonymous";

    if (authenticated) {
      titleEl.textContent = getPreferredLabel(session);
      subtitleEl.textContent = session.email || "Google account connected";
      primaryBtn.textContent = "Refresh";
      secondaryBtn.hidden = false;
      if (session.photoURL) {
        avatarEl.src = session.photoURL;
        avatarEl.classList.add("has-photo");
      } else {
        avatarEl.removeAttribute("src");
        avatarEl.classList.remove("has-photo");
      }
      return;
    }

    titleEl.textContent = stubbed ? "Local static mode" : "Guest session";
    subtitleEl.textContent = stubbed
      ? "Auth APIs are muted on localhost. Add ?authApiProbe=1 to exercise the live backend."
      : "Sign in with Google to sync your account across devices.";
    primaryBtn.textContent = stubbed ? "Refresh" : "Sign in with Google";
    primaryBtn.disabled = stubbed;
    secondaryBtn.hidden = true;
    avatarEl.removeAttribute("src");
    avatarEl.classList.remove("has-photo");
  }

  primaryBtn.addEventListener("click", async () => {
    primaryBtn.disabled = true;
    secondaryBtn.disabled = true;
    titleEl.textContent = currentSession?.isAuthenticated ? "Refreshing session..." : "Opening Google sign-in...";
    try {
      const session = currentSession?.isAuthenticated
        ? await fetchAuthSession({ force: true })
        : await signInWithGoogle();
      render(session);
    } catch (error) {
      titleEl.textContent = String(error?.message || error || "Google sign-in failed.");
    } finally {
      primaryBtn.disabled = false;
      secondaryBtn.disabled = false;
    }
  });

  secondaryBtn.addEventListener("click", async () => {
    primaryBtn.disabled = true;
    secondaryBtn.disabled = true;
    titleEl.textContent = "Signing out...";
    try {
      const session = await signOutFromApp();
      render(session);
    } catch (error) {
      titleEl.textContent = String(error?.message || error || "Could not sign out.");
    } finally {
      primaryBtn.disabled = false;
      secondaryBtn.disabled = false;
    }
  });

  onAuthSessionChanged(render);
  fetchAuthSession().then(render).catch((error) => {
    titleEl.textContent = String(error?.message || error || "Account unavailable.");
    subtitleEl.textContent = "The account service could not be reached.";
  });
}
