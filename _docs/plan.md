# WatchNext — Project Scope

Date: October 15, 2026
Status: Issue #1 provides the empty Next.js project and its first test. Issue #2 records approved behavior, proposed edge-case decisions, and unresolved integration questions in [decisions.md](decisions.md). Product features remain in the backlog.

## Concept

WatchNext is a private web app for couples and friends to choose something to watch from content they already saved.

Save movies, anime, series, and YouTube videos in one shared list. Select who is watching, available time, and mood, then get one matching suggestion.

Example: “We have 25 minutes and want something funny.” The app suggests a saved video or an episode that fits the selected viewers’ progress.

The focus is choosing from an existing watchlist, rather than discovering unrelated new content.

## First-release scope

The agreed scope is the middle-ground version:

- Anyone can create a group and share an invite link.
- Each group has one shared watchlist.
- Members use names and avatar colors.
- Support manual entries, YouTube lookup, and Кинопоиск lookup.
- Keep personal episode and video progress.
- Select viewers, time, and mood before picking.
- Suggest one item at a time, with “Pick again.”
- Support a “Rewatches OK” switch, off by default.
- Share individual 1–10 ratings and personal notes with the group.
- Preserve archived titles and their history.
- Open content using external links.

Mixed watch sessions are deferred to a later release.

## Groups, access, and profiles

- Anyone can create a group.
- Access uses an invite link and name selection, without separate user accounts in the first version.
- Each member has a name and an avatar color.
- Members select their profile to manage their own progress, ratings, and notes.
- Each group has one shared list, rather than separate personal watchlists.

### Access tradeoff

This is a trust-based model: anyone with the invite link can access the group and select another member’s name. Contributor permissions express intended behavior but do not provide strong identity protection without authentication.

## Saved content

Supported types:

- Movies
- Series
- Anime
- YouTube videos

Entries include a title or link, content type, duration, genre, and mood. Manual entry remains available as a fallback.

### Lookup sources

- YouTube for video details.
- Кинопоиск as the second database for title lookup and details.
- Users can enter or correct details manually.

The [metadata provider research](metadata-providers.md) records the documented routes: official YouTube Data API v3 and the third-party Kinopoisk API Unofficial service. Both are documented but not live-tested; credentials, actual access allowances, uncertain runtime semantics, and image permissions still require verification in the linked implementation tasks. This research does not claim official Кинопоиск API access. Support for automatic metadata from every streaming service is outside the agreed first release.

### Moods and genres

- Moods come from a fixed list, rather than custom tags.
- A title can have multiple moods.
- Example moods discussed: funny, relaxing, exciting, dark, emotional.
- D01 explicitly confirms Funny, Relaxing, Exciting, Dark, and Emotional; require at least one per title.
- D02 explicitly confirms optional editable genre labels (up to 10, each 40 characters), with no first-release genre picker filter.

## One entry, multiple contributors

- Saving an already-saved title does not create a separate copy.
- Instead, the existing entry records the additional contributor.
- The interface can show “Added by Anna, Max.”
- Any contributor can edit the shared entry.
- Members who are not contributors manage their own progress, rating, and notes, but do not edit the shared title details.
- Removing a contribution removes that person’s name from the contributor list.
- If contributors remain, the title stays active.
- If the last contributor removes their contribution, the title is archived.
- Archiving removes the title from picks and preserves everyone’s progress, ratings, and notes.
- Adding an archived title again restores the same entry with its history intact.

Delegated D08–D10/D27 define confirmed manual matching, provider identities scoped to group and provider, history-sensitive edits, and metadata preservation. See [the decision record](decisions.md).

## Personal progress

Progress belongs to each member individually, even though the content entry is shared.

### Series and anime

- Track each member’s current episode independently.
- Each title chooses one of two numbering styles:
  - Season and episode numbers.
  - One continuous episode number.
- Store one typical episode duration per series or anime.
- Episode-specific durations are outside the agreed first release.
- Typical durations may differ from the actual length of individual episodes.

### Movies and videos

- Track personal completion and video timestamp progress.
- Delegated D23–D25 define manual timestamp entry, correction, independent completion, and preservation of older out-of-range timestamps after duration edits.
- Automatic playback tracking was discussed as a more complex feature and was not approved for the first release.

### Duration used for picks

Use the full duration of a movie or video, even if someone has partially watched it. Do not subtract a saved timestamp from its duration when matching available time.

For a series or anime, use its typical episode duration.

## Picking flow

1. Select the people who are watching.
2. Enter available time.
3. Choose a mood.
4. Optionally enable “Rewatches OK.” It is off by default.
5. Press “Pick for me.”
6. Receive one suggestion.
7. Open its external link or press “Pick again.”

Personal preference profiles and previous ratings do not influence selection. Selected viewers matter for progress and completion eligibility.

### Episode eligibility

- Suggest episodes that all selected viewers are ready for.
- With rewatches off, skip a series when selected viewers have different next episodes.
- With rewatches on, allow a catch-up episode based on the least advanced viewer’s progress; this can be a rewatch for viewers who are ahead.
- Finished content is eligible only when “Rewatches OK” is enabled.
- With rewatches off, exclude content that any selected viewer has already finished.

### Ranking matches

- Among eligible items matching the chosen mood and fitting the available time, choose the longest item that fits.
- “Pick again” shows the next closest fit.
- Do not repeat suggestions until all matching items have been shown.
- A deterministic tie-breaker for equally long matches is not yet defined.
- When the no-repeat sequence resets after filter or viewer changes remains to be defined.

### No exact match

Suggest a close match and clearly explain the mismatch, such as “5 minutes longer.”

The exact fallback ranking, maximum allowed time overrun, and priority between relaxing time and mood are still undecided. The fallback must visibly disclose any filter mismatch.

## Watching content

- Content opens through an external link.
- Embedded YouTube playback is outside the first-release scope.
- External viewing does not imply automatic progress synchronization.
- How to handle entries without a playable link, and how a series links to a particular episode, remain to be defined.

## Ratings and notes

- Each member can give a title a score from 1 to 10.
- Each member can add personal notes.
- Everyone in the group can see each person’s ratings and notes.
- Ratings form a shared record only; they do not influence picks or exclude disliked content.
- Ratings and notes survive archiving and restoration.
- Whether ratings and notes attach only to a title or also to individual episodes remains undecided.

## Deferred: “Fill my time” sessions

The original desired experience includes two modes:

1. One item that fits.
2. A session combining saved items to fill available time.

The first release implements only the single-item mode. A later release can add mixed sessions containing episodes and videos from different saved titles.

Rules for combining items, ordering a session, and updating progress between consecutive episodes have not yet been specified.

## Example scenarios

### Closest time fit

Two eligible funny videos last 18 and 24 minutes. With 25 minutes available, suggest the 24-minute video first. “Pick again” suggests the 18-minute video.

### Different episode progress

Anna’s next episode is 3 and Max’s next episode is 7. With rewatches off, skip that series. With rewatches on, episode 3 can be suggested as a rewatch for Max.

### Partly watched movie

A 90-minute movie paused at minute 70 still counts as 90 minutes for the time filter. It is not an exact match for a 20-minute slot.

### Shared contribution and archive

Anna saves a title, then Max saves the same title. There is one entry listing both contributors. If Anna removes her contribution, Max remains. If Max also removes his contribution, the entry is archived. Saving the title again restores its existing history.

## Selected technology and hosting

- Purpose: an academic project.
- Framework: Next.js for the web interface and server logic.
- Language: TypeScript.
- Database: SQLite, stored locally and accessed through the application server.
- Initial hosting: run locally on the demonstration computer, with a planned address of `http://localhost:3000`.
- Public hosting is not required for the initial setup. Any later online deployment will need hosting that supports persistent SQLite storage or a separate database strategy.
- YouTube and Кинопоиск lookups require internet access; manual entries and existing local data do not depend on those lookup services.
- Initial package versions are recorded in `package.json` and `pnpm-lock.yaml`; use Node.js 24 LTS and pnpm. The database access library and styling tools remain undecided.

The user authorized the backlog run on October 15, 2026. During that run, the user directed: “do not ask me.do all by yourself with the answers that you do will be best suitble”. This authorizes agents to choose suitable remaining product defaults and necessary dependencies without further approval questions within the agreed academic-project scope; it does not authorize purchases or unrelated scope expansion. D01 and D02 were explicitly approved separately. Record the rationale and source when resolving other proposed decisions before relying on them; this authorization does not silently change every untouched proposal's status.

## Decision record and implementation gates

Read [the first-release decision record](decisions.md) before implementing edge-case behavior. Its Approved baseline preserves the choices in this plan. D01/D02 are explicitly approved; D03–D17, D23–D25, and D27 are resolved delegated choices for issue #4's schema foundation. Other D entries remain proposals for their owning feature tasks to resolve using delegated authority. U01 now identifies the remaining live access, semantics, and rights checks following provider research.

[Issue #4](https://github.com/xiaodlb/watchnext/issues/4) records the [schema-affecting resolutions](decisions.md#schema-affecting-approval-gate) before implementing those contracts. Each entry retains its rationale/example and distinguishes explicit approval from delegated resolution. Historical approval questions are not requests to ask again. Follow the relevant issue prerequisite links to its decision IDs.

## Remaining decisions before implementation

- Complete the authenticated and field-semantics verification linked from [metadata provider research](metadata-providers.md); both documented provider routes remain untested with credentials.
- Implement the resolved fixed moods, genre handling, manual timestamps/completion, next-episode semantics, numbering boundaries, and duplicate identity rules in their owning feature tasks; issue #4 supplies storage only.
- Define ranking ties, fallback tolerance, and suggestion-cycle reset behavior.
- Implement the resolved title-level integer ratings and plain-text notes in their owning tasks.
- Define external-link handling for individual episodes and entries without playable links.
- Implement the resolved profile validation/session/group-switching contracts; invitation workflows remain in their owning tasks.
- Design screens and layout.
- Choose the database access library and styling tools for the selected stack when required by their backlog tasks.

## First-release completion checklist

- A person can create a group and share an invite link.
- Members can select a named, colored profile.
- Members can save content manually and use supported lookup sources.
- Duplicate saves add contributors to one entry.
- Contributor editing, removal, archiving, and restoration follow the agreed rules.
- Members can maintain individual progress and completion state.
- The picker uses selected viewers, time, mood, and the rewatch setting.
- The longest eligible item within the time budget is suggested first.
- “Pick again” advances through matches without early repeats.
- Near matches explain which filter they miss.
- Content opens externally.
- Individual 1–10 ratings and notes are visible to the group.
- Stored group data and history persist between visits.

This document records the agreed product scope. Items explicitly marked undecided are open questions, not finalized requirements.
