# Teacher Pilot Kit

Use this kit to test whether teachers repeatedly use and will pay for the current classroom arcade. It is a research aid, not a claim that the product is a curriculum-aligned learning platform.

## Pilot hypothesis

Elementary teachers who need a quick classroom activity or brain break will use a teacher-controlled browser arcade if they can start it easily, constrain game choices, and use it without ad targeting or requiring student profiles. Some will pay for a single-classroom license if the workflow is reliable and saves them time.

## Recruitment note (draft only)

> Hi [Name] — I’m testing a browser-based arcade for teachers who need a quick, school-safe activity or brain break. It has classroom controls for choosing games and setting a session timer. I’m looking for a few elementary teachers to walk through how they handle this today and, if it seems relevant, try the current workflow. Would you have 20 minutes for a short conversation? I’m looking for candid feedback, not an endorsement.

Do not claim curriculum alignment, school-wide reporting, student-level assessment, or multi-teacher provisioning unless those capabilities have been verified. Do not send this message until you choose the recipients and authorize outreach.

## 20-minute discovery interview

Ask these before showing the product. Prefer concrete recent behavior over opinions about a hypothetical product.

1. Think about the last time you needed a short game, brain break, indoor recess, or early-finisher activity. What did you use?
2. How did you find and set it up? How long did it take?
3. What went wrong or took extra attention?
4. How often does this situation come up in a normal week?
5. What rules do you follow about ads, student accounts, device use, and approved sites?
6. Who decides whether a tool is allowed? Who would pay for it, and how does that purchase happen?
7. Have you paid for a similar tool or asked your school to pay? What happened?
8. What would have to be true for you to switch from what you use now?

Then show the current product and ask the teacher to complete one normal task on a typical school device: open the teacher workflow, configure a session or game whitelist, and start a game. Observe silently. Ask what they expected at each step and what would stop them using it again.

Close with: “The current single-classroom price shown is $49.99 per month. What would you do at that price?” If they say they would pay, ask what they would do next and when. Record behavior or a concrete next step, not just a positive reaction.

## Pilot structure

- Recruit 5–10 teachers who currently run games or short activities in class.
- Start with one teacher and one classroom per pilot. Do not describe it as school-wide coverage.
- Ask the teacher to use the product in their normal workflow for two weeks, if that is operationally feasible. Make clear that the pilot period is a research arrangement and does not imply a built-in subscription trial.
- Schedule a 10-minute setup observation and one follow-up near the end of the pilot.
- At follow-up, ask whether they want to continue at the stated price. Capture the decision and the reason.
- Never ask for student names, student-level results, or screenshots containing identifiable student information. Do not record a classroom session.

## Research log template

Use participant codes such as T01 and T02. Keep any adult contact details separately and only when the teacher agrees to follow-up. Do not put student or classroom-level personal data in this log.

| Field | Entry |
|---|---|
| Participant code | |
| Role / grade band | |
| Current alternative | |
| Last real use case | |
| Frequency | |
| Current setup time / friction | |
| Purchase decision-maker | |
| Observed setup completion | |
| Time to first classroom session | |
| Returned in a later week? | |
| Feature used more than once | |
| Response to $49.99/month | |
| Purchase or concrete next step | |
| Main reason for decline / blocker | |
| Follow-up consent | |

## Suggested decision gates

These are early learning thresholds, not industry benchmarks. Decide whether to adjust them before seeing results; do not move them after the fact just to call the pilot successful.

- **Problem evidence:** At least 3 of 10 teachers describe the same recurring job and a meaningful problem with their current alternative.
- **Pilot usability:** At least 7 of 10 can complete the agreed classroom setup without the founder taking over. Track whether any failure comes from the product or school-device/network restrictions.
- **Repeat use:** At least half of pilot teachers use it in a later week without a reminder from the founder.
- **Payment signal:** At least 3 pilot teachers either purchase at the stated price or take a specific, verifiable purchasing step. Verbal interest alone does not count.
- **Repeatable onboarding:** Two teachers outside the first hands-on cohort can reach their first session without founder-led setup.

If repeat use is weak, improve the use case or stop. If repeat use is strong but payment is weak, test payer, procurement, packaging, and price before adding features. If payment depends on capabilities that do not exist, document the gap and secure a real buyer commitment before building them.

## Billing verification checklist

The public billing configuration currently reports live Stripe mode and all four plan IDs supported. Before accepting a pilot payment, verify through an authorized controlled purchase and billing records:

- Displayed plan amount and billing interval match the Stripe price ID.
- Checkout shows the intended merchant and terms.
- A paid subscription activates the expected account entitlement.
- Subscription status and renewal date appear correctly after return to the site.
- Customer portal opens for the subscriber and supports cancellation.
- Cancellation and renewal events update entitlement state correctly.
- Local/demo checkout cannot be mistaken for a real purchase.

Do not count a local demo entitlement, checkout start, or successful redirect as paid conversion. Count an active Stripe subscription after billing confirmation.
