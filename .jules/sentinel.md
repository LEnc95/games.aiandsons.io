## 2026-04-01 - [Fix XSS in File Upload]
**Vulnerability:** XSS vulnerability in feedback form file upload. The filename was interpolated into an HTML string and assigned via `.innerHTML`.
**Learning:** The application uses plain JavaScript (no framework like React or Vue that auto-escapes by default). This means developers must be extremely careful when handling user input like filenames to avoid DOM-based XSS.
**Prevention:** Use `document.createElement` and set `.textContent` to safely render user-controlled strings in the DOM, avoiding `innerHTML`.

# Sentinel Learnings
- **XSS Prevention in Vanilla JS**: The codebase uses extensive `innerHTML` manipulation in `index.html`. Discovered that `renderDailyMissions`, `renderWeeklyChallenges`, `renderPremiumTrack`, and `renderClassroomGameChecklist` all interpolating properties from data that could potentially be tampered with. It's critical to wrap dynamic template string values with an `escapeHtml` utility when assigning to `innerHTML`.
- **Safe HTML utility**: Added a robust regex-based `escapeHtml` to `index.html` to sanitize dynamically inserted content (replacing `&`, `<`, `>`, `"`, `'`).
