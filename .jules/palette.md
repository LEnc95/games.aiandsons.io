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
