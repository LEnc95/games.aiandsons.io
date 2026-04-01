## 2026-04-01 - [Fix XSS in File Upload]
**Vulnerability:** XSS vulnerability in feedback form file upload. The filename was interpolated into an HTML string and assigned via `.innerHTML`.
**Learning:** The application uses plain JavaScript (no framework like React or Vue that auto-escapes by default). This means developers must be extremely careful when handling user input like filenames to avoid DOM-based XSS.
**Prevention:** Use `document.createElement` and set `.textContent` to safely render user-controlled strings in the DOM, avoiding `innerHTML`.

## 2026-04-01 - [Fix XSS in Feedback Embed]
**Vulnerability**: In `src/feedback/embed.js`, dynamic text strings like `gameName` were being unsafely embedded into the UI using `innerHTML`. This allowed arbitrary strings containing malicious HTML/JS to be interpreted as code instead of raw text.
**Learning**: Whenever rendering dynamically provided values or input, avoid interpolating them directly into `innerHTML` strings. Instead, construct the element or use a placeholder, and then set the dynamic value using `textContent` on the specific DOM node. This ensures the browser treats the input strictly as display text, avoiding XSS and passing static analysis tools.
- Learned to explicitly write a simple `escapeHtml` utility function `str.replace(/[&<>"']/g, ...)` for interpolating Javascript object properties securely into DOM innerHTML to prevent XSS.
- Safely applied `escapeHtml` without breaking pre-existing structural elements like `&rarr;` which must be kept separate from the escaped content.
