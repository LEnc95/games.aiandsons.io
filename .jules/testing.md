## 2026-04-17 - Added testing coverage for missions progress updates
**Learning:** `src/core/state.js` relies heavily on local storage and requires mocking at the top level when running Node test environments directly.
**Action:** When adding missing coverage for related modules using local storage, mock it immediately before test runner imports.
