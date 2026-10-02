# Release Checklist

[Repository overview](README.md) · [Deployment](DEPLOYMENT.md) · [Weekly release runbook](docs/MAINTAINER_GUIDE.md#weekly-release-automation-runbook)

## Normal Weekly Release

The [weekly release workflow](.github/workflows/weekly-release.yml) runs on Sunday and supports manual dispatch. It prepares and validates a release PR before merging the synchronized release files.

1. Keep user-visible changes in the `CHANGELOG.md` Unreleased section.
2. Let `npm run release:prepare-weekly` generate the next minor version and publish the Unreleased content. Run it intentionally: it edits release files and exits without changes when the current ISO week is already prepared.
3. Review the complete generated file set:

   - `CHANGELOG.md`
   - `TECHNICAL_CHANGELOG.md`
   - `package.json`
   - `package-lock.json` (including its root-package version)
   - `version.json`
   - `release/weekly-state.json`

4. Keep the release PR limited to that file set; the workflow and release audit enforce it. Product changes belong in their own PRs.
5. The workflow runs preflight, policy, telemetry, shop, social, feedback, and launch-readiness checks before the guarded merge. After merge, confirm Main QA and production verification succeed.

For reruns and existing release-branch recovery, use the [weekly release runbook](docs/MAINTAINER_GUIDE.md#weekly-release-automation-runbook). A documentation or UI refinement does not itself require manually preparing a new weekly release.

## Policy Review Gate (Required Before Tagging)

- Confirm policy references are current:
  - `privacy.html`
  - `school-privacy.html`
- Confirm whether tracking/ads dependencies were added or changed in this release.
- Update `release/policy-signoff.json` with reviewer name, date, and approval status.
- Run `npm run test:policy-gate`.
- Do not create or push a release tag until the policy gate passes.

The gate also checks the `Risk Register` and `Rollback Plan` sections in [RELEASE_NOTES.md](RELEASE_NOTES.md). Review those for the release being tagged; historical launch notes and an older signoff do not establish a new release-specific review. The tagged workflow runs for `v*` and `release-*` tags.

## Optional Release Notes Inputs

- Summary of user-visible changes.
- QA commands executed and results.
- Rollback notes.
