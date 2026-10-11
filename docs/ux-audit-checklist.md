# SavedTube UX Audit Checklist

## Purpose

Use this checklist to evaluate SavedTube as a calm, coherent learning-path product. The audit follows the complete user journey:

> Discover SavedTube → understand the learning loop → watch a lesson → practice an interval → continue through the path → create and manage a personal path.

Record each item as **Pass**, **Issue**, **Blocked**, or **Unverified**. Attach the route, exact steps, observed result, expected result, severity, and evidence for every issue.

## 1. Audit setup

- [ ] Record the commit, deployment URL, browser, viewport, operating system, and test date.
- [ ] Confirm whether the audit uses a public demo, a configured staging deployment, or a production session.
- [ ] Use a disposable test account and test path for authenticated mutations.
- [ ] Record the test path identifier and clean up or restore test data after the audit.
- [ ] Open browser console and network diagnostics before starting.
- [ ] Capture screenshots for blockers, errors, confusing states, and important transitions.
- [ ] Define the target persona and learning goal for the audit.
- [ ] Mark environment/setup evidence separately from product behavior.

## 2. Landing page and first impression

- [ ] The page communicates SavedTube’s value within 20 seconds.
- [ ] The headline explains that SavedTube turns videos into a structured learning path.
- [ ] The visual hierarchy establishes one clear first-session action.
- [ ] `Watch the demo` and `Build your own path` explain their different purposes.
- [ ] Navigation labels use consistent product terminology.
- [ ] The page presents a calm, architectural, warm-modern visual character.
- [ ] Typography, contrast, spacing, and imagery support comfortable reading.
- [ ] The page renders correctly at desktop, tablet, and mobile widths.
- [ ] The page provides visible loading and error states for dynamic content.
- [ ] The page title, landmarks, headings, and meta description support orientation and discovery.

## 3. Public demo learning loop

- [ ] The demo loads with a useful example path.
- [ ] The selected lesson is visually clear in the map and sequence.
- [ ] The player, lesson title, channel, stage objective, and lesson position remain aligned.
- [ ] Selecting a lesson updates the player and surrounding context.
- [ ] `Previous` is disabled or unavailable at the first lesson.
- [ ] `Next` is disabled or unavailable at the final lesson.
- [ ] `Next` and `Previous` preserve a clear sense of progress.
- [ ] The interface explains what the user should do after watching a lesson.
- [ ] The demo shows or previews how watching becomes practice.
- [ ] YouTube loading, unavailable-video, consent, and playback errors receive useful recovery guidance.
- [ ] Keyboard users can reach the player-adjacent controls in a logical order.
- [ ] Focus states remain visible on map nodes, sequence items, and navigation controls.
- [ ] Screen readers receive meaningful labels for lesson selection and navigation.
- [ ] Browser console and network requests remain free from actionable errors.

## 4. Authentication and conversion

- [ ] The primary CTA communicates the sign-in or account-creation transition.
- [ ] Sign-in shows a visible loading state while authentication starts.
- [ ] Successful sign-in returns the user to a useful destination.
- [ ] Authentication failure explains the next action in product language.
- [ ] Missing provider configuration produces an actionable operator/user message.
- [ ] The signed-in landing route and signed-out landing route each provide an appropriate next step.
- [ ] Returning users can reach their existing paths quickly.
- [ ] Account and privacy messaging match the actual data behavior.

## 5. Dashboard and path creation

- [ ] `/paths` loads existing user-owned paths.
- [ ] An empty dashboard explains how to create the first path.
- [ ] Each path card exposes its goal, progress, status, and last activity.
- [ ] `Create new path` is easy to find and has a clear label.
- [ ] The creation form explains the required goal and optional background context.
- [ ] Validation identifies incomplete or invalid input beside the relevant field.
- [ ] Submission shows progress such as `Researching videos...`.
- [ ] The user can understand whether research is queued, running, succeeded, or failed.
- [ ] Failure states explain recovery, retry, and whether a saved path shell remains available.
- [ ] Successful creation navigates to the resulting path.
- [ ] Refreshing or revisiting the dashboard preserves the created path.
- [ ] Duplicate submissions do not create duplicate paths or duplicate research jobs.
- [ ] The dashboard remains usable during loading and refresh operations.

## 6. Path detail and learning structure

- [ ] The path objective is visible and easy to understand.
- [ ] Stage names describe a meaningful learning progression.
- [ ] Stage order and video order communicate sequence clearly.
- [ ] The mind map and list represent the same active path.
- [ ] The current lesson and current stage are visually distinct.
- [ ] Progress is expressed in human-readable terms.
- [ ] Empty stages and stale positions are handled gracefully.
- [ ] Map, list, watch navigation, Continue, and progress use the same path state.
- [ ] A user can resume from the correct lesson after leaving and reopening the path.
- [ ] Loading, partial-data, and research-failure states preserve orientation.

## 7. Watch experience

- [ ] Opening a lesson shows the correct video, title, stage, and path position.
- [ ] The player has a clear loading state and an understandable unavailable-video state.
- [ ] `Previous` and `Next` navigate to the correct lessons.
- [ ] First and final lesson boundaries provide clear affordance states.
- [ ] The current lesson remains synchronized with the path map and sequence.
- [ ] The user can mark a lesson as practiced with one clear action.
- [ ] The practiced state persists after navigation and reload.
- [ ] Progress updates immediately after marking a lesson practiced.
- [ ] The watch page explains the next useful action after practice.
- [ ] Back navigation returns to a useful path context.
- [ ] Deep links to a lesson preserve the path and lesson context.
- [ ] The watch route remains usable on narrow screens.

## 8. Practice intervals and looping

Test each state separately and record observed player events where possible.

- [ ] A lesson with no intervals behaves as ordinary playback.
- [ ] The interval creation control is discoverable beside the player.
- [ ] Start and end times accept valid values and explain invalid values.
- [ ] An interval displays its start, end, name, and duration.
- [ ] The user can rename, edit, and remove an interval.
- [ ] Interval state persists after navigation and reload.
- [ ] Loop disabled allows ordinary playback through the interval.
- [ ] Loop enabled returns playback to the interval start after the interval ends.
- [ ] Looping works for one interval and multiple intervals.
- [ ] Interval ordering remains chronological after edits.
- [ ] Playback does not seek unexpectedly when loop mode is disabled.
- [ ] Playback does not enter a rapid seek/pause loop at an interval boundary.
- [ ] The final interval behaves consistently with earlier intervals.
- [ ] Manual seeking, pause/resume, reload, and navigation produce predictable results.
- [ ] YouTube player events and application state remain synchronized.

## 9. Exclusion, review, and restore

- [ ] The exclusion action is visible at the point where the user evaluates a lesson.
- [ ] The action label describes the durable behavior, such as `Exclude from path`.
- [ ] The confirmation step explains what changes and how restoration works.
- [ ] A reason can be selected without ambiguity.
- [ ] Confirming exclusion removes the lesson from the active sequence.
- [ ] Active lesson count and progress denominator update immediately.
- [ ] Stage and video positions compact after exclusion.
- [ ] Empty stages are removed or represented intentionally.
- [ ] Map, list, watch navigation, Continue, and progress reflect the same exclusion.
- [ ] Excluded content remains available in a review or recovery surface.
- [ ] The review surface displays the recorded reason and useful context.
- [ ] Restoring a lesson returns it to the active path and restores relevant progress.
- [ ] Excluded lessons remain excluded from future path rebuilding where the product contract requires it.
- [ ] Manual additions and replacements apply the same exclusion policy.

## 10. Accessibility and inclusive interaction

- [ ] Every interactive control has an accessible name.
- [ ] Heading hierarchy reflects the page structure.
- [ ] Keyboard users can complete the critical journey.
- [ ] Focus remains visible and moves predictably after state changes.
- [ ] Dialogs trap focus appropriately and return focus to the invoking control.
- [ ] Status messages announce research, save, practice, exclusion, restore, and error states.
- [ ] Color carries supporting information through text, iconography, or structure.
- [ ] Text and controls meet practical contrast requirements.
- [ ] Touch targets have comfortable spacing on mobile.
- [ ] Motion and autoplay behavior respect user preferences where supported.
- [ ] YouTube iframe controls remain usable with keyboard and assistive technology.

## 11. Performance and resilience

- [ ] The landing page becomes useful before all secondary content loads.
- [ ] The demo remains responsive during player initialization.
- [ ] Dashboard and path loading states prevent accidental duplicate actions.
- [ ] Slow research and network failures show progress or recovery guidance.
- [ ] Retry actions preserve submitted context.
- [ ] Refreshing during a state transition produces a coherent result.
- [ ] Browser console contains no actionable errors on the critical journey.
- [ ] Failed API calls expose a useful user-facing state and a diagnosable log entry.
- [ ] YouTube availability issues leave the path and progress state intact.

## 12. Evidence and finding record

For every finding, record:

```text
ID:
Title:
Severity: P0 blocker / P1 critical / P2 significant / P3 polish
Class: functional / UX clarity / accessibility / performance / data integrity / instrumentation / environment
Route or surface:
Persona and journey:
Preconditions:
Steps to reproduce:
Observed result:
Expected result:
User impact:
Evidence: screenshot, URL, console output, network request, or source reference
Likely cause:
Fix direction:
Regression check:
Status: open / fixed / retested / accepted
```

## 13. Exit criteria

- [ ] The public discovery, demo, authentication, creation, watch, practice, exclusion, restore, and resume journeys have an explicit status.
- [ ] Every blocked journey names the exact environment or credential prerequisite.
- [ ] Every issue has reproduction steps and evidence.
- [ ] P0 and P1 findings have an owner and regression check.
- [ ] Authenticated mutations have been restored or cleaned up.
- [ ] Browser console and network results have been reviewed.
- [ ] The audit distinguishes observed behavior, static source evidence, setup blockers, and hypotheses.
- [ ] The final report lists verified behavior, open findings, blocked areas, and the next audit slice.
- [ ] Each accepted fix has been retested in the browser on the relevant route.
