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
