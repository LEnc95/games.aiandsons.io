## 2025-02-14 - Modal Keyboard Accessibility
**Learning:** The custom modal implementations in this design system lacked built-in support for the `Escape` key to dismiss them. This is a crucial WCAG keyboard accessibility standard (SC 2.1.1) to allow keyboard-only and screen reader users an intuitive way to back out of a dialog layer.
**Action:** Implemented a global `keydown` listener to catch `Escape` and remove the `.active` class from any active `.modal-backdrop`. In the future, this interaction pattern should be built into any shared modal utility function/component natively rather than patched globally.
## 2025-04-09 - Actionable Empty States for Search Filters
**Learning:** Empty states caused by search/filter inputs can act as dead-ends for users, requiring them to manually back out of inputs to recover. This is especially tedious on mobile or for keyboard users.
**Action:** Added a "Clear Filters" call-to-action button directly inside the empty state message. This provides a one-click recovery path, improving task success rates and reducing friction when exploring games or shop items.
## 2026-04-11 - Modal Focus Restoration
**Learning:** Custom modals must restore focus to the previously focused element when closed to maintain keyboard accessibility and prevent users from losing their place in the tab order.
**Action:** When creating or modifying custom modals, ensure `document.activeElement` is saved before opening, and explicitly focus it upon closure.
## 2026-04-12 - [Feedback Widget Coverage]
**Learning:** To satisfy `tests/feedback-coverage.integration.test.mjs`, every game page (`index.html`) must explicitly import and call `mountGameFeedback` from `src/feedback/embed.js`.
**Action:** Always ensure new games have the feedback widget mounted.
## 2026-04-14 - Decorative Icons Accessibility
**Learning:** Decorative icons and emojis in UI components (like `.game-icon`, `.recent-icon`, or `.shop-item-preview`) can cause screen readers to read out literal emoji Unicode names (e.g., "grinning face with sweat") redundantly alongside the adjacent title text.
**Action:** Always add `aria-hidden="true"` to purely decorative icons or emojis when the adjacent text already provides the context or description.
## 2026-04-15 - Global Custom Modal Keyboard Accessibility Focus Restoration
**Learning:** All custom modals (even those scattered across different files like `src/auth/embed.js` or `teacher/index.html`) must strictly capture `document.activeElement` when opened and restore focus back to it when closed to comply with WCAG standards and prevent users from losing their place in the DOM tab order.
**Action:** When implementing or modifying *any* modal in the codebase, always verify that `document.activeElement` is saved to a scoped variable on open, and that variable `.focus()` is called on close.
## 2026-04-17 - Global Event Listener Teardown in Component Lifecycle
**Learning:** When adding global event listeners (like `window.addEventListener('keydown', ...)`) inside vanilla JavaScript class components to satisfy accessibility requirements (like listening for the `Escape` key), failing to implement a `destroy()` or teardown method will lead to memory leaks and duplicate event executions if the component is ever unmounted or recreated.
## 2026-04-26 - Add keyboard shortcut hint to search placeholders
**Learning:** Undocumented keyboard shortcuts (like `/` to focus search) remain unused by the majority of users. A subtle text hint in the input's placeholder is an invisible UX enhancement that provides discoverability without cluttering the UI. Furthermore, adding `aria-keyshortcuts="/"` makes it accessible to screen readers.
**Action:** Always document search keyboard shortcuts directly in the input placeholder or via a small floating icon within the search bar, and ensure `aria-keyshortcuts` is used to expose them properly.

## 2026-05-01 - Search Landmark Roles on Control Wrappers
**Learning:** The application uses custom wrapper classes like `.search-controls` and `.shop-controls` for its primary search inputs. Without the `role="search"` landmark on these specific wrapper elements, screen reader users cannot quickly navigate to the main search areas using landmark shortcuts.
**Action:** Always ensure that any container wrapping a global or primary search input (typically featuring the `.search-controls` or similar classes) explicitly includes the `role="search"` attribute to provide a standard navigation landmark.
## $(date +%Y-%m-%d) - WCAG 2.5.3 (Label in Name) Adherence
**Learning:** When assigning `aria-label`s to elements that already have visible text, failing to include that exact visible text breaks WCAG 2.5.3, which can cause severe navigation issues for users relying on voice control software.
**Action:** Always ensure the text inside `aria-label` exactly matches or contains the visible text of the button.
## 2026-05-21 - Add explicit required field indicators to forms
**Learning:** Native `required` attributes on inputs are great for validation and screen readers, but sighted users lack visual cues until they attempt to submit the form and hit a validation error.
**Action:** Always add a clear visual indicator, such as `<span aria-hidden="true" title="Required">*</span>`, to the label of required fields. Ensure `aria-hidden="true"` is used to prevent redundant screen reader announcements, since the `required` attribute on the input already handles the semantic announcement.
## 2026-05-22 - Screen Reader Handling of Live Balances
**Learning:** Decorative emojis in live balance displays (like a coin counter) can cause screen readers to announce literal emoji names redundantly (e.g., "coin emoji zero"). Furthermore, dynamic numerical updates to these balances are completely invisible to screen reader users unless the container announces them.
**Action:** Always add `aria-hidden="true"` to purely decorative icons/emojis in balance displays. Wrap the entire display in an element with `role="status"` and a descriptive `aria-label` (e.g., "Coins balance") to ensure dynamic updates are politely announced to assistive technology without user interaction.
## 2026-05-27 - ARIA Labels and Native Enter Form Submission on non-form inputs
**Learning:** Inputs nested in non-form wrapper containers (like the `cade-family-input`) miss out on native `Enter` key form submission and screen reader visibility if they lack a `<label>`.
**Action:** Always ensure non-form inputs have an `aria-label` and a `keydown` event listener attached that natively simulates submission by listening for `Enter` and clicking the target button. This restores native form behavior and ensures WCAG compliance.
## 2026-05-28 - ARIA Labels and Native Enter Form Submission on Classroom mode inputs\n**Learning:** The inputs within the classroom settings modal (Teacher PIN and Session duration) lacked native \`Enter\` key form submission. This violates keyboard accessibility standard since users should be able to submit settings efficiently.\n**Action:** Always ensure all settings modal inputs have a \`keydown\` event listener attached that natively simulates submission by listening for \`Enter\` and triggering the save function.
## 2026-06-03 - Explicit Labels for Accessible Form Inputs
**Learning:** Depending entirely on `placeholder` attributes or hidden `aria-label`s for form field identification creates an accessibility failure and poor UX for sighted users. The WCAG requires visible `<label>` elements explicitly linked to their inputs via `for` and `id` attributes.
**Action:** Always provide a clear, visible `<label>` paired with every `<input>`. Do not rely solely on placeholders or `aria-label` when a visible label can be provided. Make sure to visually mark required fields.
## 2026-06-07 - Native Enter Form Submission on Ops Billing Inputs
**Learning:** In internal tools or standalone pages like `ops/billing/index.html`, fields are often constructed outside of standard `<form>` tags. This breaks the native browser behavior of pressing `Enter` to submit, causing friction for power users and keyboard-only navigators who expect standard form mechanics.
**Action:** Always bind a `keydown` event listener to standalone inputs that lack a wrapping `<form>` element. Check for `event.key === "Enter"` to programmatically trigger the primary action button (e.g., `submitBtn.click()`), restoring native-like accessibility and speed.

## 2026-06-15 - Enter-key submission and aria-labels for standalone inputs
**Learning:** Ad-hoc admin inputs outside native forms often miss keyboard submit handlers and explicit labels, which slows keyboard workflows and weakens accessibility.
**Action:** For standalone configuration inputs and modal fields, wire Enter to the primary action and ensure unlabeled inputs expose an explicit `aria-label` or label text.

## 2026-06-25 - Enter key submission for school license billing input
**Learning:** The billing email input in the school license checkout lacked native Enter key form submission. This violates keyboard accessibility standards since users should be able to submit settings efficiently.
**Action:** Always ensure all settings and standalone inputs have a `keydown` event listener attached that natively simulates submission by listening for `Enter` and triggering the primary action.