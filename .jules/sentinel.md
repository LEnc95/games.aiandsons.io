## 2026-04-01 - [Fix XSS in File Upload]
**Vulnerability:** XSS vulnerability in feedback form file upload. The filename was interpolated into an HTML string and assigned via `.innerHTML`.
**Learning:** The application uses plain JavaScript (no framework like React or Vue that auto-escapes by default). This means developers must be extremely careful when handling user input like filenames to avoid DOM-based XSS.
**Prevention:** Use `document.createElement` and set `.textContent` to safely render user-controlled strings in the DOM, avoiding `innerHTML`.

## 2026-04-01 - [Fix XSS in Feedback Embed]
**Vulnerability**: In `src/feedback/embed.js`, dynamic text strings like `gameName` were being unsafely embedded into the UI using `innerHTML`. This allowed arbitrary strings containing malicious HTML/JS to be interpreted as code instead of raw text.
**Learning**: Whenever using `innerHTML` to render dynamically provided values or input, strictly wrap strings with an `escapeHtml` utility function that escapes basic markup characters (`&`, `<`, `>`, `"`, `'`). This ensures the browser treats them strictly as display text.
