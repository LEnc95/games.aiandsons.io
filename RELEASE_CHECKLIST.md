# Release Checklist

## Policy Review Gate (Required Before Tagging)

- Confirm policy references are current:
  - `privacy.html`
  - `school-privacy.html`
- Confirm whether tracking/ads dependencies were added or changed in this release.
- Update `release/policy-signoff.json` with reviewer name, date, and approval status.
- Run `npm run test:policy-gate`.
- Do not create or push a release tag until the policy gate passes.

## Optional Release Notes Inputs

- Summary of user-visible changes.
- QA commands executed and results.
- Rollback notes.
