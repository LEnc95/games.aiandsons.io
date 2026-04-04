## 2026-04-01 - [Fix XSS in File Upload]
**Vulnerability:** XSS vulnerability in feedback form file upload. The filename was interpolated into an HTML string and assigned via `.innerHTML`.
**Learning:** The application uses plain JavaScript (no framework like React or Vue that auto-escapes by default). This means developers must be extremely careful when handling user input like filenames to avoid DOM-based XSS.
**Prevention:** Use `document.createElement` and set `.textContent` to safely render user-controlled strings in the DOM, avoiding `innerHTML`.

# Sentinel Learnings
- **XSS Prevention in Vanilla JS**: The codebase uses extensive `innerHTML` manipulation in `index.html`. Discovered that `renderDailyMissions`, `renderWeeklyChallenges`, `renderPremiumTrack`, and `renderClassroomGameChecklist` all interpolating properties from data that could potentially be tampered with. It's critical to wrap dynamic template string values with an `escapeHtml` utility when assigning to `innerHTML`.
- **Safe HTML utility**: Added a robust regex-based `escapeHtml` to `index.html` to sanitize dynamically inserted content (replacing `&`, `<`, `>`, `"`, `'`).
## 2026-04-01 - [Fix XSS in Feedback Embed]
**Vulnerability**: In `src/feedback/embed.js`, dynamic text strings like `gameName` were being unsafely embedded into the UI using `innerHTML`. This allowed arbitrary strings containing malicious HTML/JS to be interpreted as code instead of raw text.
**Learning**: Whenever rendering dynamically provided values or input, avoid interpolating them directly into `innerHTML` strings. Instead, construct the element or use a placeholder, and then set the dynamic value using `textContent` on the specific DOM node. This ensures the browser treats the input strictly as display text, avoiding XSS and passing static analysis tools.
- Learned to explicitly write a simple `escapeHtml` utility function `str.replace(/[&<>"']/g, ...)` for interpolating Javascript object properties securely into DOM innerHTML to prevent XSS.
- Safely applied `escapeHtml` without breaking pre-existing structural elements like `&rarr;` which must be kept separate from the escaped content.
## 2026-04-03 - [Fix Session Secret Fallback Behavior]
**Vulnerability:** In `api/auth/_session.js`, the session signing secret mechanism fell back to a hardcoded dev secret ("cade-games-dev-session-secret") if `APP_SESSION_SECRET` or `STRIPE_SECRET_KEY` were not provided.
**Learning:** Hardcoded dev secrets can easily leak into production environments due to configuration drift or missing environment variables, resulting in session forgery risks.
**Prevention:** In production environments (`NODE_ENV === "production"`), the application must explicitly throw an error if the required session secrets are missing rather than quietly falling back to weak or known development defaults.
## 2026-04-04 - [Fix Host Header Trust in Return URLs]
**Vulnerability:** The application used request-derived origins (via `req.headers.host`) to build Stripe success/cancel return URLs when `APP_BASE_URL` was unset. This allowed Host Header Injection attacks where malicious redirects could be constructed during billing flows.
**Learning:** `APP_BASE_URL` must be strictly enforced in production to ensure sensitive billing return URLs are immutable and safely constructed. Falling back to the `host` header is only safe for local development, not edge/proxy ingress environments.
**Prevention:** In production environments (`NODE_ENV === "production"`), the application must explicitly throw an error if `APP_BASE_URL` is missing, preventing any fallback to request-derived origins.
