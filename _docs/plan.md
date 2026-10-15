# WatchNext — Project Scope

Date: October 15, 2026
Status: Implementation started with issue #1, the empty Next.js project and its first test. Product features remain in the backlog.

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

The exact integration methods, accessible fields, cover retrieval, API availability, and any costs or restrictions have not been verified. These require investigation before implementation. Support for automatic metadata from every streaming service is outside the agreed first release.

### Moods and genres

- Moods come from a fixed list, rather than custom tags.
- A title can have multiple moods.
- Example moods discussed: funny, relaxing, exciting, dark, emotional.
- The final mood list remains to be confirmed.
- Genre is part of the saved metadata; its vocabulary and whether it appears as a picker filter remain undecided.

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

The exact method for recognizing duplicate titles is still to be defined.

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
- The mechanism for updating timestamps remains undecided.
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

The user authorized implementation of issue #1 and approved its setup dependencies. That task does not authorize implementation of other backlog features.

## Remaining decisions before implementation

- Confirm integration feasibility and metadata fields for YouTube and Кинопоиск.
- Define the final mood list and genre handling.
- Define manual timestamp and completion controls.
- Define whether “current episode” means next to watch or currently in progress.
- Define episode completion, season boundaries, and series completion behavior.
- Define duplicate detection for imported and manually entered titles.
- Define ranking ties, fallback tolerance, and suggestion-cycle reset behavior.
- Define title-level versus episode-level ratings and notes.
- Define external-link handling for individual episodes and entries without playable links.
- Define profile creation, returning-member selection, and invite-link management.
- Define whether one person can belong to multiple groups and how they switch groups.
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
