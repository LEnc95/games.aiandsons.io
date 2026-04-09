## 2025-02-14 - Modal Keyboard Accessibility
**Learning:** The custom modal implementations in this design system lacked built-in support for the `Escape` key to dismiss them. This is a crucial WCAG keyboard accessibility standard (SC 2.1.1) to allow keyboard-only and screen reader users an intuitive way to back out of a dialog layer.
**Action:** Implemented a global `keydown` listener to catch `Escape` and remove the `.active` class from any active `.modal-backdrop`. In the future, this interaction pattern should be built into any shared modal utility function/component natively rather than patched globally.
## 2025-04-09 - Actionable Empty States for Search Filters
**Learning:** Empty states caused by search/filter inputs can act as dead-ends for users, requiring them to manually back out of inputs to recover. This is especially tedious on mobile or for keyboard users.
**Action:** Added a "Clear Filters" call-to-action button directly inside the empty state message. This provides a one-click recovery path, improving task success rates and reducing friction when exploring games or shop items.
