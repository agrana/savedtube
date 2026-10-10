# SavedTube Product Brief and Roadmap

## Product direction

SavedTube is a calm learning studio that turns a learning goal into a structured path through carefully selected YouTube videos.

The experience combines:

- A clear learning goal and optional learner background
- AI-assisted research for relevant YouTube videos
- An ordered progression from foundations to practical mastery
- A visual map of the learning path
- Focused watching, practice loops, and progress tracking
- Reflection and spaced-recall reviews that support retention

SavedTube uses YouTube as the content source while providing the structure, sequencing, practice, and recall layer around the videos.

## Current product model

The current primary object is a **learning path**.

A path contains:

1. A learner-owned goal
2. Optional background information
3. One or more ordered stages
4. YouTube videos assigned to each stage
5. A researched or manually edited revision
6. Progress through stages and videos
7. Reflections and follow-up prompts
8. Spaced-recall quiz cards and review attempts

Traditional YouTube playlists, playlist editing, watch progress, and practice intervals remain supporting capabilities.

## Implemented capabilities

### Path creation and research

- Create a path from a learning goal and optional background
- Save the path before research begins
- Research a bounded sequence of YouTube videos
- Persist research jobs and their status
- Handle retries, timeouts, quota errors, missing candidates, and partial coverage
- Protect research requests with idempotency keys and budget controls
- Preserve the saved path when research fails

### Path presentation

- List the learner's paths
- Display path stages and videos on a path detail page
- Show the learning progression as a visual path map
- Display the active revision and available draft revision
- Provide explicit research status and error feedback

### Path editing

- Add a YouTube video to a stage
- Replace a video in a stage
- Apply path edits as a new revision
- Activate a researched or edited revision
- Delete an owned path while preserving shared video practice loops

### Learning and retention

- Track path and stage progress
- Watch videos through the focused YouTube player
- Save and use practice intervals
- Generate and display stage follow-ups
- Write stage reflections
- Generate due spaced-recall quiz cards
- Reveal quiz answers
- Rate reviews as remembered or again
- Schedule subsequent reviews from the rating

### Existing playlist capabilities

- Browse and search YouTube playlists
- Hide and show playlists on the dashboard
- Reorder playlist videos
- Soft-remove playlist items
- Add videos by URL
- Track watched and unwatched progress
- Import practice intervals from YouTube chapters

## Current technical architecture

- **Frontend:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4
- **Authentication:** NextAuth.js with Google OAuth and JWT sessions
- **Content source:** YouTube Data API v3 and the YouTube IFrame Player API
- **Research:** Configurable server-side research model with YouTube candidate search
- **Database:** Supabase Postgres with versioned migrations
- **Validation:** Zod schemas and route-level validation
- **Deployment:** Vercel
- **Authorization:** NextAuth session checks and explicit ownership checks in the application layer; selected newer path, research, and quiz tables also use database security policies

## Important domain objects

The path system is represented by these concepts:

- `paths` — the learner-owned learning goal
- `path_revisions` — a versioned researched or edited version of a path
- `path_stages` — ordered learning stages within a revision
- Path videos — YouTube videos assigned to stages
- Path progress — completion state for the learner's path and stages
- Research jobs — asynchronous or long-running path research state
- Stage follow-ups — prompts generated from completed learning stages
- Quiz cards — spaced-recall prompts associated with path stages
- Quiz review attempts — immutable records of review ratings and schedule changes

## Product principles

### Structure over accumulation

SavedTube should help learners understand what to watch next and why it belongs in the path. A large collection of videos is less useful than a coherent progression.

### Progression before polish

The path should move from prerequisites and core concepts toward application, integration, and mastery. The ordering should remain understandable to the learner.

### Human control

Research proposes a path. The learner can inspect, edit, replace, reorder, and activate the version that feels right.

### Practice and recall

Watching is one part of learning. Practice loops, reflection, and spaced recall should turn passive viewing into durable understanding.

### Calm presentation

The interface should feel spacious, architectural, warm, and quietly premium. Video remains the content focus; the surrounding UI provides orientation and momentum.

## Planned improvements

These items describe future work rather than current implementation:

- Improve path-generation quality with clearer prerequisite and mastery heuristics
- Make stage purpose, expected outcome, and estimated effort more explicit
- Improve the visual path map with richer relationships and navigation
- Add stronger learner controls for stage ordering and video selection
- Add progress summaries and a daily learning queue
- Improve research observability and user-facing explanations
- Add broader automated coverage for path routes and end-to-end learning flows
- Evaluate sharing or collaboration only after the individual learning loop is strong

## Development workflow

Feature work should be divided into small, independently verifiable slices.

For each slice:

1. Inspect the current implementation and relevant migrations.
2. Define the exact files and behavior in scope.
3. Implement the smallest coherent change.
4. Run focused tests and type checking.
5. Run the broader quality checks when the slice is complete.
6. Review the diff for accidental changes.

The repository uses feature branches and pull requests. Keep unrelated files, local configuration, and secrets out of feature changes.

## Related documentation

- [README.md](README.md) — setup, architecture, routes, schema, and deployment
- [supabase/README.md](supabase/README.md) — migration and database workflow
- [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) — deployment and security verification
- [NEXTJS_SECURITY_IMPROVEMENTS.md](NEXTJS_SECURITY_IMPROVEMENTS.md) — application security architecture
- [LOCAL_ERROR_CHECKING.md](LOCAL_ERROR_CHECKING.md) — local quality checks
