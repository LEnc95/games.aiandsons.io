# Business Validation Roadmap

**Prepared:** September 26, 2026
**Purpose:** Turn the current product and monetization foundation into a testable path to repeatable revenue. This is a business hypothesis and validation plan, not evidence that product-market fit or revenue has been achieved.

## Executive decision

For the next 90 days, test a teacher-led, single-classroom offer first. The strongest current buyer value is teacher control and a privacy-conscious place to run short games in class. Keep family billing available, but defer significant investment in family premium until its paid benefits are stronger than the free experience.

Do not sell the school-site plan as a proven multi-teacher solution until access, coverage, reporting, and support have been confirmed for multiple teachers. Defer iOS investment until the web offer shows repeat use and paid demand.

## What is known and unknown

### Known from the current product

- The public product is a free browser arcade with roughly 60 games, classroom controls, a teacher dashboard, assignments, reports, accessibility options, and privacy pages.
- Family pricing is $4.99 monthly or $39 annually. The page describes premium cosmetic packs and premium challenge tracks when available.
- The shop catalog currently lists 28 premium cosmetic items. The family page also promises premium challenge tracks “when available”; the free product already avoids ads, so ad removal is not a unique paid benefit.
- School pricing is $49.99 monthly for one classroom or $499.99 annually for a school-site option.
- Stripe checkout, subscription webhooks, entitlement persistence, and reconciliation code exist.
- On September 26, 2026, the public billing-config endpoint reported Stripe enabled in live mode, customer portal enabled, webhook configured, and all four family/school plan IDs supported. This confirms deployment configuration, not that checkout, displayed pricing, purchase completion, or renewal was end-to-end verified.
- Classroom assignment/report history is described in the teacher interface as local browser data. The core entitlement model exposes family-premium and school-license flags.
- Client KPI events are stored locally. Aggregate telemetry is disabled pending a release-specific privacy review. The checked-in KPI snapshot is stale, has a missing input file, and contains no events.

### Unknown and requiring evidence

- Current visitors, acquisition sources, returning users, teacher activations, paid subscribers, revenue, cancellations, and renewals.
- Whether the Stripe price IDs match the prices displayed on the site and whether a completed purchase activates the right entitlement.
- Whether teachers will pay, who controls their budget, and whether the current classroom experience solves an urgent enough problem.
- Whether family subscribers value the premium benefits enough to renew.
- Whether a school-site buyer can provision the promised access to all covered teachers and receive useful shared reports.

Do not use zero values in the checked-in KPI export as a claim of zero traffic or revenue; it only shows that this local export had no source data.

## Initial customer and offer hypothesis

**Initial segment:** Individual elementary teachers who need a quick, school-safe activity or brain break and want a simple way to limit game choices during class.

**Offer hypothesis:** A teacher can start a curated game session quickly, set a whitelist and timer, and use the arcade without ad targeting or a required student profile. The initial sale is one teacher/classroom. The product should be described as a teacher-controlled arcade unless specific curriculum outcomes are validated.

**Pricing hypothesis:** Test the listed single-classroom price only after interviews establish budget fit. Be ready to test a simpler annual teacher price or paid pilot. Do not infer willingness to pay from positive feedback or free pilot participation.

**Why this is the first test:** The teacher workflow has a more concrete buyer benefit than the family plan’s current cosmetics and intermittent challenge benefits. A single-teacher pilot also avoids promising district-wide provisioning before it is verified.

## Price and scale arithmetic

These examples show the number of continuously paying accounts implied by current list prices. They are gross revenue illustrations, not forecasts or targets; they exclude payment fees, tax, refunds, churn, support, and acquisition costs.

| Current offer | Gross annual value per payer | Payers for about $10k/year | Payers for about $50k/year |
|---|---:|---:|---:|
| Family annual | $39.00 | 257 | 1,283 |
| Classroom monthly, annualized | $599.88 | 17 | 84 |
| School-site annual | $499.99 | 21 | 101 |

The school-site price is lower than one classroom paid monthly for a full year, despite being described as whole-school coverage. That may be reasonable if site coverage has tightly bounded seats or usage, but the current offer needs explicit coverage, teacher access, support, and renewal terms. Until those are defined and provisioned, do not treat “school-site” as a scalable unit of sale.

At the family price, recurring revenue requires many more paying households than school accounts. That makes parent acquisition economics and retention central to family-plan viability. Do not favor a channel based on price alone; validate conversion, renewal, and support effort in the pilot.

## 90-day plan

### Days 1–14: Establish the baseline and interview buyers

1. The public config currently reports live Stripe mode and all four plans supported. Confirm in Stripe that each configured price ID matches the displayed price, then verify purchase, portal, cancellation, renewal, and entitlement lifecycle with an authorized controlled transaction.
2. Review the production family checkout fallback. It explicitly labels the non-Stripe path as a local demo that can activate premium locally; keep that path clearly non-production and confirm buyers cannot mistake it for a payment.
3. Conduct 10–15 short interviews with teachers in the proposed segment. Ask about their current workflow, what they use instead, setup friction, procurement authority, and what result would justify payment. Do not pitch before understanding their current behavior.
4. Ask interviewees to commit to a pilot or a specific follow-up, not only to say whether the idea sounds good.
5. Record a baseline for actual Stripe active subscriptions and revenue from billing records. Keep business reporting separate from student gameplay histories.

**Gate to pilot:** At least five teachers agree to try the workflow in a real classroom, and at least three identify the same recurring job or pain. These are proposed learning thresholds, not market benchmarks.

### Days 15–45: Run a small, hands-on pilot

1. Onboard five to ten teachers personally; record setup time, where they need help, and whether the class session works on their school devices.
2. Observe whether teachers use the controls, whitelist, assignments, and reports more than once. Ask which feature they would miss if removed.
3. Do not add games speculatively. Fix only repeated onboarding, reliability, accessibility, and classroom-use problems that block pilot use.
4. At the end of the pilot, present an explicit paid offer and ask for a purchase or a concrete reason for declining.

**Gate to paid test:** At least half of pilot teachers return for a second or later week, and at least three are willing to consider the stated paid offer. If return use is low, investigate product value before discounting.

### Days 46–75: Test payment and repeatability

1. Convert interested pilots using Stripe and the single-classroom plan. Track actual paid subscriptions, not local demo entitlements.
2. Ask each buyer how they found the product and what event triggered purchase. Ask non-buyers what blocked purchase.
3. Measure the time and human support required to move one teacher from first visit to first classroom session and from pilot to paid.
4. Fix the largest repeated obstacle. Keep family-plan changes limited to clearly resolving a buyer objection discovered in research.

**Gate to repeat sales:** At least three pilot teachers pay at the tested price or a price they explicitly accepted, and two or more new teachers can be onboarded without the founder doing the classroom setup for them. Treat a miss as a reason to revise the offer or workflow, not to add more features automatically.

### Days 76–90: Make a go, revise, or stop decision

- **Go:** Repeat usage and paid conversion exist, and there is a credible source of the next ten teacher leads. Invest in the top onboarding or classroom gap and run another cohort.
- **Revise:** Teachers use the product but do not pay. Revisit who pays, price, procurement route, and what is included before building a broader school plan.
- **Stop or change segment:** Teachers do not return or cannot name a meaningful job solved. Interview parents or another segment before committing to more development.

## Privacy-safe measurement plan

Use two evidence sources:

1. **Billing truth:** Monthly Stripe counts for active subscriptions, new paid subscriptions, cancellations, renewals, plan mix, and gross revenue. Reconcile against subscription records; never count a local demo entitlement as revenue.
2. **Aggregate product funnel:** After the required privacy review, collect daily counts for launcher views, teacher-guide opens, pricing views, checkout starts, and verified checkout completions. Do not store student names, player identifiers, IPs, cookies, raw play histories, or free-form event details. Keep plan and event labels bounded and documented.

For early pilots, founder-maintained interview and onboarding notes can explain why counts move. Keep these notes about adult participants and business interactions, not individual children’s gameplay.

## First business dashboard

Review monthly, with a weekly operational check during the pilot:

- Qualified teacher conversations and pilot commitments.
- Pilot teachers who return in a later week.
- Time from first contact to first successful classroom session.
- Paid conversions from completed pilots.
- Active paid classroom subscriptions, cancellations, renewals, and gross revenue by plan.
- Support minutes required per activated and paid teacher.
- Acquisition source for each qualified teacher lead.

Do not use launch counts, number of games shipped, page views, or checkout starts as substitutes for repeat use and collected revenue.

## Product and roadmap priorities

### Do now

- Verify production billing configuration and test the full lifecycle with a controlled subscription.
- Recruit the teacher pilot cohort and document their current alternatives.
- Clarify the single-classroom offer: who can use it, what devices it covers, what support is included, and what happens at renewal.
- Review classroom reports against the promised use: reports are currently local-browser summaries, not evidence of school-wide reporting.
- Update the sprint board’s business dates and add an owner, target, and decision gate for each experiment.

### Do after evidence

- Build shared staff access, school-wide administration, or expanded reporting only if multiple teacher pilots require it and a school buyer will pay for it.
- Rework family premium around benefits parents explicitly value and renew for. The existing free no-ad experience means “no ads” should not carry the paid offer by itself.
- Invest in iOS after web repeat use and paid demand justify the added build, review, payment, and support burden.

### Pause as a growth proxy

- Adding games on a fixed cadence without evidence that the new games attract or retain the chosen buyer.
- Treating completed engineering infrastructure, smoke tests, or a generated KPI file as proof of customer demand.
- Marketing the school-site plan as multi-teacher or district-ready before access and reporting work across a school.

## Risks and assumptions

- The teacher-first segment is a hypothesis. If interviews show no budget owner or repeat need, revise it.
- Suggested pilot thresholds are decision aids for a small experiment, not validated industry benchmarks.
- No production Stripe records, analytics account, customer interviews, or revenue reports were available in this repository audit, so business performance remains unverified.
- Keep child privacy and school-data commitments intact while testing demand; use aggregate metrics and direct adult feedback rather than behavioral tracking of children.
