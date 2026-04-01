## 2026-04-01 - [Fix XSS in File Upload]
**Vulnerability:** XSS vulnerability in feedback form file upload. The filename was interpolated into an HTML string and assigned via `.innerHTML`.
**Learning:** The application uses plain JavaScript (no framework like React or Vue that auto-escapes by default). This means developers must be extremely careful when handling user input like filenames to avoid DOM-based XSS.
**Prevention:** Use `document.createElement` and set `.textContent` to safely render user-controlled strings in the DOM, avoiding `innerHTML`.
- Learned to explicitly write a simple `escapeHtml` utility function `str.replace(/[&<>"']/g, ...)` for interpolating Javascript object properties securely into DOM innerHTML to prevent XSS.
- Safely applied `escapeHtml` without breaking pre-existing structural elements like `&rarr;` which must be kept separate from the escaped content.
