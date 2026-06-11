# iOS Launch Sprint Plan

## Goal
Ship the existing arcade as a compliant iPhone and iPad experience without weakening the school-safe, privacy-first web launch baseline.

## Current Baseline
- The product is a static browser arcade with serverless API routes for auth, billing, feedback, and admin operations.
- Core QA coverage exists through Playwright smoke tests and Node integration tests.
- The site already includes classroom controls, family/school monetization, accessibility settings, policy gates, and Stripe reconcile tooling.
- There is not yet a committed iOS app shell, Apple entitlement mapping, App Store metadata pack, or TestFlight validation checklist in this checkout.

## Launch Approach
Use a thin native iOS wrapper around the existing web app unless a spike proves that App Store review, payment policy, or offline behavior requires deeper native surfaces.

Recommended default:
- Capacitor or an equivalent minimal WebView shell for the first device build.
- Keep game logic and catalog routing in the web codebase.
- Add native-only adapters only for platform concerns such as safe-area handling, external links, share sheets, and future push or sign-in capabilities.

## Definition of Done
- iPhone and iPad builds run the launcher, shop, classroom, pricing, and at least five representative games without layout breakage.
- Touch controls are usable across portrait and landscape where each game supports them.
- Apple account, privacy, and payment decisions are documented before TestFlight submission.
- App Store metadata, screenshots, age rating inputs, privacy nutrition labels, and review notes are ready.
- TestFlight smoke results are recorded with device/OS coverage and known limitations.

## Sprint 9 Backlog

### CG-901 iOS Shell Decision + Prototype
- Decide between Capacitor-style WebView packaging and a native SwiftUI wrapper.
- Commit the chosen shell scaffolding or a spike summary if packaging is deferred.
- Verify the app can load the local/static arcade entry point on iPhone and iPad simulator.

### CG-902 iPhone/iPad Gameplay Readiness Audit
- Select representative games covering canvas, keyboard-heavy, touch-heavy, audio, and progression flows.
- Audit safe areas, viewport scaling, scrolling, orientation behavior, and touch target sizing.
- File or fix blocking mobile-control issues before TestFlight.

### CG-903 Apple Auth, Payments, and Policy Mapping
- Decide whether Sign in with Apple is required alongside Google sign-in.
- Map family premium and school licensing flows to Apple in-app purchase or external-link policy constraints.
- Update release and policy docs for any iOS-specific data, auth, or payment differences.

### CG-904 App Store Metadata Pack
- Draft app name, subtitle, promotional text, description, keywords, support URL, marketing URL, review notes, age rating notes, and privacy label source notes.
- Capture required iPhone and iPad screenshots from a stable build.
- Keep child-directed, classroom, and monetization language consistent with the existing policy pages.

### CG-905 TestFlight Launch Gate
- Add an iOS smoke checklist that covers install, first launch, login/session behavior, core game launch, classroom lock, shop gating, pricing path, and feedback path.
- Record supported OS/device matrix and known issues.
- Require passing web QA plus iOS device smoke before App Review submission.

## Risks
- Apple payment policy may require product changes for family premium purchases.
- Google sign-in may require Sign in with Apple parity depending on final auth presentation.
- Some legacy games may still assume keyboard-first input and need touch fallback polish.
- WebView audio, fullscreen, orientation, and storage behavior may differ from desktop browsers.
- App Store child-safety review may require tighter language around school and child-directed use.

## Immediate Next Actions
1. Create the iOS shell decision spike and record the packaging choice.
2. Pick the first five representative games for device testing.
3. Run the current launch-readiness smoke suite before mobile-specific work begins.
4. Draft the Apple policy decision table for auth, payments, privacy, and review notes.
