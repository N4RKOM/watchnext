# WatchNext backlog

This backlog describes future work; it does not authorize implementation yet. The project is an academic web app using Next.js, TypeScript, and a local SQLite database, initially demonstrated at `http://localhost:3000`.

Each task is intended for one focused session and includes its own scope and completion criteria. Tasks are independently understandable, but some require existing project capabilities; use the current repository and `_docs/plan.md` as context, without needing to read other backlog tasks. Where a required capability is unavailable, use an isolated fixture or stub and document the expected interface rather than implementing another task's scope.

The first release uses invite-link access and selectable names with avatar colors, without separate accounts. Mixed watch sessions, embedded playback, and automatic playback tracking are excluded; unresolved behavior must be documented as a proposed decision before depending on it.

## 1. Set up an empty project with a passing test
Goal: Establish a runnable Next.js and TypeScript project with one meaningful passing test.
Description: Initialize the application in the repository root while preserving `_docs` and Git history, choose compatible package versions, and configure a test runner. Add a minimal landing page and a smoke test that verifies its heading renders; finish with the test passing and documented commands for starting the empty app and running the test.

## 2. Record the remaining first-release behavior decisions
Goal: Give implementers explicit rules for the product's unresolved edge cases.
Description: Review `_docs/plan.md` and propose defaults for mood vocabulary, genre handling, next-episode semantics, season boundaries, unknown progress, completion, feedback granularity, duplicate matching, picker ties and fallback limits. Include suggestion-cycle resets, missing playback links, and profile/group switching; record each as agreed or proposed so unapproved choices are visible rather than silently added to scope.

## 3. Investigate metadata provider feasibility
Goal: Document a usable integration path for YouTube and Кинопоиск before implementation.
Description: Check provider documentation for access methods, required credentials, available title/duration/cover fields, quotas, costs, and usage restrictions, clearly distinguishing official and third-party Кинопоиск services. Record source links, field mappings, and a small example response shape; if a requirement cannot be supported, identify the gap and retain manual entry rather than promising unsupported retrieval.

## 4. Define the SQLite schema and migrations
Goal: Represent shared titles and independent member history with database constraints.
Description: Choose and document a database access library, then define migrations for groups, invite credentials, members, titles, contributors, moods, progress, ratings, and notes. Include provider identifiers for deduplication, both episode-numbering styles, archive state, foreign keys, and appropriate uniqueness constraints; verify migrations against an isolated temporary database.

## 5. Configure local database persistence
Goal: Make application data survive server restarts without entering Git.
Description: Add a server-only SQLite connection and configuration using the repository's schema and migrations, with a configurable database path and clear initialization command. Ignore database files, journals, and local secrets in Git, and verify a record survives reopening the database; document that SQLite must reside on reliable local storage rather than a shared network drive.

## 6. Build the application shell
Goal: Provide consistent navigation and layouts for the main WatchNext screens.
Description: Create a responsive layout for group entry, watchlist, picker, and archive views using lightweight shared styling and accessible navigation. Use placeholder content where features are unavailable, and verify the shell works at phone and laptop widths without adding feature logic.

## 7. Create groups and invite links
Goal: Let a visitor create a group and obtain its invitation URL.
Description: Implement a group-name form and server operation that persists the group and generates an unguessable invitation credential without requiring signup. Show a copyable invite link based on the current application address and verify that separate groups receive different credentials; localhost links must be identified as usable only on the host computer.

## 8. Resolve invitations and enforce group access
Goal: Restrict group data operations to a valid invitation-based session.
Description: Resolve invitation URLs into group-scoped sessions and expose a reusable server check for reads and mutations, including rejection of invalid invitations and records belonging to other groups. Test cross-group access and direct requests, keeping invitation credentials out of routine logs; retain the documented trust model in which profile selection does not prove personal identity.

## 9. Create and select member profiles
Goal: Let group visitors identify themselves with a name and avatar color.
Description: Add profile creation, a group-member selector, and a way to change the selected member, with the active choice remembered in that browser session. Validate names and colors and check group membership on the server; use the documented policy for duplicate names and group switching and display the trust-based nature of profile selection.

## 10. Add titles manually
Goal: Save movies, series, anime, and YouTube videos without a metadata service.
Description: Build a form for title, type, optional link, positive duration, genre, and multiple fixed moods, including typical episode duration and numbering style for series or anime. Persist the selected member as a contributor using the shared title-save interface, validate inputs on the server, and verify an invalid entry cannot create partial records.

## 11. Display the active shared watchlist
Goal: Give members a readable view of their group's saved content.
Description: Render active group titles with type, duration, moods, and every contributor's name and avatar color, using a placeholder when cover art is absent. Support opening an item and provide clear empty and loading states; ensure archived items and other groups' titles are excluded.

## 12. Display title details and external watch links
Goal: Let viewers inspect an entry and open its saved viewing destination.
Description: Build a detail view showing shared metadata and available member history, with a clearly labeled external watch action for supported HTTP or HTTPS links. Follow the documented behavior for missing links and series-level destinations, reject unsafe URL schemes, and avoid implying automatic playback or timestamp synchronization.

## 13. Merge duplicate saves into contributor records
Goal: Preserve one group entry per title while recording everyone who saved it.
Description: Implement a shared save operation that matches provider identifiers or the documented manual-entry duplicate rule and adds the selected member to the existing entry instead of creating a copy. Make repeated saves by the same member idempotent and use a transaction plus database constraints where possible; verify different groups remain separate and ambiguous manual matches follow the documented policy.

## 14. Allow contributors to edit title metadata
Goal: Permit shared title edits only from a contributing profile.
Description: Add an edit form and server mutation for metadata, duration, moods, and numbering style, checking both group access and the selected member's contribution. Validate changes, handle duplicate-identity collisions and numbering changes using the documented rules, and verify a noncontributor cannot edit through a direct request; do not add account authentication.

## 15. Remove contributions, archive, and restore titles
Goal: Remove unwanted items from picks without losing member history.
Description: Implement contribution removal so an entry stays active while contributors remain and becomes archived when the last contributor leaves, then expose a simple archive view. Make saving the same archived title restore its existing entry and add the contributor; verify progress, ratings, and notes survive both operations and all state changes are transactional.

## 16. Define the metadata lookup interface
Goal: Give provider integrations one predictable server-side contract.
Description: Define a normalized lookup result covering source identifier, title, content type, duration, genres, optional cover, and source link, with explicit handling of unavailable fields. Add a provider interface and fixtures for success, missing metadata, and failures; keep credentials server-only and document that remote metadata never supplies personal mood tags automatically.

## 17. Implement YouTube video lookup
Goal: Retrieve supported saved-video metadata from YouTube links.
Description: Using the documented provider contract and verified API method, parse supported YouTube URLs and retrieve the canonical identifier, title, duration, and available thumbnail. Handle missing credentials, invalid links, inaccessible videos, and quota errors with readable outcomes and mocked provider tests; do not add playback embedding or automatic progress tracking.

## 18. Implement Кинопоиск title lookup
Goal: Retrieve movie, series, and anime metadata through the verified Кинопоиск integration path.
Description: Implement title search and result-detail retrieval through the provider selected in the feasibility document, normalizing identifiers, type, genre, available duration, cover, and source link. Handle missing credentials, unavailable fields, ambiguous search results, and provider failures using mocked responses, and label any third-party provider accurately; do not invent episode lengths when the source lacks them.

## 19. Connect lookup results to the add-title form
Goal: Let members review imported metadata before saving a title.
Description: Add YouTube link lookup and Кинопоиск search/result selection to the add-title experience, filling editable fields from the normalized provider response. Require missing duration and mood choices before saving through the same contribution-aware operation as manual entry, and keep manual entry usable when either provider fails or internet access is unavailable.

## 20. Track personal series and anime progress
Goal: Record each member's next episode independently in either numbering style.
Description: Add manual progress controls for season-and-episode or continuous numbering, using the recorded interpretation of next/current episode and completion rules. Persist changes only for the selected member within the active group, support correcting earlier input, and verify two members can retain different positions on the same title without overwriting one another.

## 21. Track personal movie and video progress
Goal: Preserve manual timestamps and completion without changing picker duration.
Description: Add timestamp entry and completion controls for movies and videos, with readable formatting, range validation, and correction or clearing according to the recorded behavior. Store progress per member, verify it persists, and ensure a 90-minute movie paused at minute 70 still supplies 90 minutes to the picker.

## 22. Add shared individual ratings
Goal: Let members record and view personal scores from 1 to 10.
Description: Provide controls to save, update, and clear the selected member's rating at the documented title or episode scope, and show other members' scores with attribution. Validate scores on the server, preserve independent records and archived history, and ensure ratings are not used as picker preferences or exclusion rules.

## 23. Add shared personal notes
Goal: Let members keep attributed notes visible to their group.
Description: Add creation, editing, and deletion of the selected member's plain-text note at the documented feedback scope, with a defined length limit and safe rendering. Display notes with member attribution, enforce group and selected-profile checks, and verify other members' notes and archived history remain intact.

## 24. Implement viewer and episode eligibility rules
Goal: Determine which items all selected viewers can watch under the rewatch setting.
Description: Build a testable eligibility function that accepts group titles, selected viewers, their progress, and a rewatch flag, excluding archived titles and applying documented unknown-progress behavior. With rewatches off, reject items finished by any selected viewer and series with different next episodes; with rewatches on, permit finished content and use the least advanced viewer's next episode for catch-up, verifying both numbering styles with fixtures.

## 25. Implement time ranking and near-match fallback
Goal: Order eligible content by fit and explain suggestions outside the requested filters.
Description: Build a testable ranking function using available time, requested mood, full movie/video duration, and typical episode duration, with exact matches ordered longest-first within the time budget. Apply the documented deterministic tie-breaker and bounded time/mood fallback policy without relaxing viewer eligibility, and return explicit mismatch reasons or a no-match result; verify the 24-minute-versus-18-minute example for a 25-minute slot.

## 26. Build the single-item picker screen
Goal: Turn viewer, time, mood, and rewatch selections into one visible recommendation.
Description: Add viewer selection, a positive available-time input, one mood choice, and a “Rewatches OK” switch that defaults to off, then connect the form to the existing eligibility and ranking interfaces. Show one result with duration, episode where applicable, rewatch or mismatch explanations, and the external watch action; handle no viewers, no saved titles, loading, and no suitable results without adding mixed sessions.

## 27. Implement Pick again without early repeats
Goal: Cycle through ranked matches consistently within a picking session.
Description: Add a “Pick again” action that advances through the existing ordered candidate list without repeating until every candidate has been shown. Implement the documented exhaustion and reset behavior when viewers, filters, rewatch settings, or underlying progress change, and test that stale or newly ineligible items are not returned.

## 28. Prepare repeatable academic demo data
Goal: Demonstrate the core behavior without depending on live metadata providers.
Description: Add an explicit seed command for a separate demo database with a group, colored members, all content types, multiple contributors, different episode positions, timestamps, feedback, and archived history. Include fixtures for exact time fit, rewatches, near matches, and archive restoration, and ensure rerunning the demo setup cannot overwrite a user's normal database or require live API credentials.

## 29. Verify the complete local user journey
Goal: Catch integration failures across the first-release workflows.
Description: Add a small end-to-end suite against an isolated database covering group invitation and profile selection, duplicate contributions, personal progress, picker ordering and repeats, feedback, and archive restoration. Include cross-group rejection and unavailable-provider/manual-entry fallback, using mocked remote APIs and separate browser contexts where needed; record and fix integration failures within these flows without expanding product scope.

## 30. Document local setup, backup, and demonstration
Goal: Let a lecturer or new contributor run and evaluate WatchNext from a fresh checkout.
Description: Update the README with prerequisites, installation, database initialization, optional provider credentials, demo data, test commands, and local development and production start commands. Include a short demonstration script, a safe SQLite backup/restore procedure, and the limits of localhost sharing, trust-based profiles, and network-dependent lookups; verify the instructions using a clean temporary checkout and never commit credentials or database contents.
