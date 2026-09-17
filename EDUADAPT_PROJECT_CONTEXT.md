# EDUADAPT — MASTER PROJECT HANDOFF & ENGINEERING CONTEXT

**Repository:** `meghamcr/EduAdapt-Core`  
**Primary working repository:** `~/Documents/GitHub/EduAdapt-Core`  
**Legacy repository used for selective migration:** `~/Documents/GitHub/EDUADAPT`  
**Primary backend path:** `EduAdapt-Core/backend`  
**Purpose of this file:** Give Codex / ChatGPT Work / Astra enough architectural, implementation, migration, database, curriculum, adaptive-learning, and Unity game-generation context to continue EduAdapt without relying on prior chat history.

> **IMPORTANT FOR ANY CODING AGENT**
>
> Read this file completely before changing EduAdapt. Inspect the current repository before editing code. Treat the repository as the source of truth for current implementation and this file as the source of truth for architectural intent, migration decisions, safety constraints, and work-in-progress context.
>
> Do not blindly recreate legacy code. The project is being selectively migrated and generalized.

---

# 1. PROJECT IDENTITY

## 1.1 Name

**EduAdapt — AI-Driven Role-Based Adaptive Learning Platform with Gamification and Learning Path Optimization**

EduAdapt is an educational platform intended to combine:

- curriculum-grounded learning,
- adaptive difficulty,
- learner modelling,
- AI-generated educational content,
- AI-generated educational games,
- Unity-based gameplay,
- gamification,
- knowledge-gap analysis,
- recommendations,
- role-based access,
- teacher/admin control,
- and learner analytics.

It is an academic Major Project-A project at Pillai College of Engineering (Autonomous), Mumbai University, AY 2025–26.

## 1.2 Team context

Known report team:

- Ritika S. Joshi — A622
- Megha Manoj — A632
- Krupa R. More — A635
- Janhavi Patil — A648

Supervisor: Dr. Soumya S. Mohapatra  
HOD: Dr. Sharvari Govilkar  
Principal: Dr. Sandeep M. Joshi

## 1.3 Core goal

EduAdapt should not simply display static lessons or static quizzes.

The intended loop is:

```text
Approved Curriculum
        ↓
Curriculum Hierarchy / Learning Objectives
        ↓
Teacher / System selects learning target
        ↓
Learner state + mastery + previous interactions
        ↓
Adaptive difficulty decision
        ↓
AI educational game/content generation
        ↓
Validation
        ↓
Unity-compatible Game Specification
        ↓
Student gameplay
        ↓
Interaction + performance telemetry
        ↓
Mistake / mastery / engagement analysis
        ↓
Updated learner model
        ↓
Recommendation / remediation / next learning target
        ↓
Next adaptive experience
```

---

# 2. USER ROLES AND PLATFORM SCOPE

EduAdapt uses role-based access.

Primary roles:

- STUDENT
- TEACHER
- ADMIN

Known platform pages / areas include:

- Landing
- Authentication / Login
- Student dashboard
- Teacher dashboard
- Admin dashboard

The curriculum system must support many grades/standards. Early work began with Grade 6, but the architecture must **not** be Grade-6-specific.

Current expansion work is adding Grade 4 curriculum, initially:

- Mathematics
- The World Around Us

These two subjects are **current ingestion targets only**. They are NOT architectural restrictions.

The platform must support arbitrary future combinations such as:

```text
Board
├── Grade 4
│   ├── Mathematics
│   ├── The World Around Us
│   ├── English
│   ├── Hindi
│   └── other subjects
├── Grade 5
│   └── any applicable subjects
├── Grade 6
│   ├── Mathematics
│   ├── Science
│   ├── Social Science
│   └── other subjects
└── higher/lower grades as configured
```

Do not create subject whitelists unless there is a deliberate product requirement later.

---

# 3. HIGH-LEVEL SYSTEM ARCHITECTURE

The conceptual architecture has four broad layers.

## 3.1 Presentation Layer

Interfaces for:

- students,
- teachers,
- administrators,
- curriculum navigation,
- game launch,
- progress,
- recommendations,
- analytics,
- gamification.

## 3.2 Application Layer

Responsible for:

- authentication,
- authorization,
- curriculum services,
- game-generation requests,
- game persistence,
- learner progression,
- recommendations,
- gameplay session handling,
- dashboards.

## 3.3 AI & Logic Layer

Major engines:

### Generative AI Engine
Generates educational content/game specifications based on approved curriculum and learner state.

### Adaptive Engine
Determines suitable difficulty and next learning experiences.

### Analytics / Learner Modelling
Uses interaction data such as:

- accuracy,
- response time,
- attempts,
- hints,
- mistakes,
- skips,
- completion,
- concepts mastered,
- concepts misunderstood,
- engagement.

### Recommendation / Learning Path Logic
Determines remediation, reinforcement, revision, or progression.

## 3.4 Infrastructure / Data Layer

Current primary database:

- PostgreSQL
- Supabase-hosted

ORM:

- Prisma 7

Unity is used for generated educational game execution/runtime.

---

# 4. ADAPTIVE LEARNING DESIGN

## 4.1 Cold start

For a new student, new topic, or new chapter, begin conservatively.

Known design:

- initial level can start at Easy,
- then adapt gradually based on observed learner behaviour.

The system should not pretend to know mastery before enough evidence exists.

## 4.2 Learner signals

Adaptive decisions may use:

- accuracy,
- score,
- response time,
- attempts,
- hints used,
- skips,
- mistakes,
- completion,
- abandonment,
- repeated misconceptions,
- prior topic mastery,
- prior subtopic mastery,
- engagement.

## 4.3 Difficulty philosophy

Difficulty should primarily change **how curriculum knowledge is used**, not silently introduce out-of-syllabus knowledge.

### Easy

Examples:

- direct recognition,
- direct calculation,
- strong scaffolding,
- more hints,
- familiar textbook-like situations,
- single-concept application.

### Medium

Examples:

- application,
- fewer hints,
- less direct wording,
- multi-step tasks,
- combining closely related concepts.

### Hard

Examples:

- deeper reasoning,
- multi-step problem solving,
- unfamiliar AI-generated scenarios,
- fewer hints,
- combining related concepts the learner has already encountered,
- applying curriculum knowledge in new contexts.

Hard difficulty must **not** simply mean teaching higher-grade material.

Example:

If the approved curriculum contains multiplication, addition, and money, a hard activity may combine them into a richer shopping/problem-solving scenario.

The scenario may be newly generated, but the knowledge required must remain within approved curriculum boundaries.

## 4.4 External enrichment

External enrichment may exist later as an explicitly controlled layer.

It must be clearly distinguished from authoritative curriculum.

A student's curriculum mastery must not decrease merely because they do not know an external fact that was never part of the prescribed curriculum.

## 4.5 Mastery philosophy

Curriculum is authoritative for **WHAT** is being learned.

AI controls transformations such as:

- question wording,
- stories,
- numbers,
- puzzles,
- game contexts,
- hints,
- remediation style,
- difficulty presentation.

It should not silently redefine curriculum scope.

---

# 5. CURRICULUM ARCHITECTURE

## 5.1 Critical principle: dynamic hierarchy

Do NOT assume:

```text
1 chapter = 1 topic
```

Do NOT assume a fixed hierarchy such as:

```text
Chapter → Topic → Subtopic → Concept
```

The actual textbook structure determines hierarchy.

Possible valid structures include:

```text
Chapter
└── Topic
    └── Concept
```

or:

```text
Chapter
└── Topic
    └── Subtopic
        └── Concept
```

or:

```text
Chapter
└── Topic
    └── Subtopic
        └── Concept
            └── Deeper Concept
                └── Activity
```

or another meaningful structure supported by the source.

Hierarchy depth is recursive/unlimited at the model level through `CurriculumNode.parentId`.

## 5.2 Meaningful node boundaries

Do not convert every paragraph into a node.

Identify educational boundaries using:

- headings,
- subheadings,
- concept changes,
- definitions,
- classifications,
- processes,
- activities,
- experiments,
- observations,
- worked examples,
- important examples,
- teaching stories,
- applications,
- meaningful exercises,
- problem-solving sections.

## 5.3 Node fields

Every meaningful curriculum node should contain:

- `id`
- `parent_id`
- `title`
- `type`
- `description`
- `content`
- `order`

`description` is a short semantic description.

`content` is the substantial educational material needed to understand/teach/use the node.

`content` is NOT intended to be a tiny summary.

## 5.4 Preserve educational detail

When present in the textbook, preserve:

- explanations,
- definitions,
- important facts,
- conceptual reasoning,
- procedures,
- methods,
- steps,
- examples,
- worked examples,
- calculations,
- textbook real-life examples,
- activities,
- experiments,
- observations,
- comparisons,
- classifications,
- relationships,
- tables represented meaningfully,
- important notes,
- teaching stories/context,
- teaching questions,
- problem-solving approaches.

Do not intentionally compress detailed textbook explanations into one or two generic sentences.

## 5.5 Examples and activities

Examples are important.

Normal examples can remain inside the content of the concept they explain.

A substantial worked example can become its own child node when independently useful.

Activities/experiments/observations can become child nodes when educationally meaningful.

Do NOT create a separate node for every tiny example or every isolated question.

## 5.6 Parent/child content

Parent nodes contain material directly relevant to the parent.

Child nodes contain material specifically belonging to the child.

Do not copy the entire chapter into every node.

Do not remove essential context merely to avoid duplication.

## 5.7 Learning objectives

Learning objectives must be derived from the actual chapter.

Do not fabricate objectives unrelated to the supplied source.

## 5.8 Ordering

Sibling nodes preserve textbook/educational order using `order`.

Database field is `orderIndex`.

---

# 6. SOURCE-GROUNDING POLICY

The curriculum database is intended to be the authoritative source-grounded educational representation.

During curriculum ingestion:

- use only information supported by the supplied textbook,
- do not invent missing textbook content,
- do not silently add external syllabus knowledge,
- preserve useful educational material,
- remove only extraction noise.

Examples of removable extraction noise:

- page numbers,
- repeated running headers,
- repeated running footers,
- reprint information,
- printing metadata,
- copyright boilerplate,
- duplicated extraction artifacts.

Be conservative: useful textbook content must not be mistaken for noise.

---

# 7. CURRENT CURRICULUM INGESTION PIPELINE

Current intended pipeline:

```text
Source PDF
    ↓
pdfExtractor.js
    ↓
Extracted chapter text
    ↓
curriculumParser.js
    ↓
AI-generated source-grounded hierarchical curriculum JSON
    ↓
curriculumValidator.js
    ↓
Validated processed curriculum JSON
    ↓
importCurriculumToDatabase.js
    ↓
Supabase / Prisma
```

The four core files were selectively migrated from the legacy repository into:

```text
backend/src/services/curriculumIngestion/
├── curriculumParser.js
├── curriculumValidator.js
├── importCurriculumToDatabase.js
└── pdfExtractor.js
```

and:

```text
backend/src/prismaClient.js
```

All four core ingestion files were edited/generalized during the current migration and passed `node --check` syntax validation at the time of handoff.

**IMPORTANT:** Inspect the actual files in the repository before assuming the latest local edits have been committed/pushed. Some changes may exist only in the user's local working tree.

---

# 8. PDF EXTRACTOR — INTENDED BEHAVIOUR

`pdfExtractor.js` uses `pdf-parse`.

The extractor should perform conservative cleaning.

Do NOT aggressively remove or collapse textbook formatting because this can destroy:

- worked calculations,
- lists,
- table-like text,
- structured examples,
- activities.

Current intended improvements include:

- verify path exists,
- verify `.pdf`,
- reject empty files,
- extract text,
- normalize line endings,
- remove null characters,
- normalize non-breaking spaces,
- remove trailing whitespace,
- reduce extreme blank-line blocks while preserving paragraph boundaries,
- return extraction statistics,
- warn when suspiciously little text is extracted.

Useful extraction statistics:

- file size,
- raw character count,
- cleaned character count,
- estimated words,
- estimated paragraphs,
- page count.

If a textbook PDF is image-only or extraction is poor, do not assume empty/garbled text represents the textbook correctly.

---

# 9. CURRICULUM PARSER — INTENDED BEHAVIOUR

`curriculumParser.js` currently uses Gemini through the Google Generative Language API.

Known implementation pattern:

- reads `GEMINI_API_KEY`,
- sends extracted chapter text,
- asks for JSON,
- low temperature,
- converts temporary hierarchy IDs into deterministic curriculum node IDs.

The parser prompt has been strengthened to require:

- source grounding,
- dynamic hierarchy,
- detailed content preservation,
- example preservation,
- activity/experiment preservation,
- learning-objective derivation,
- recursive parent relationships,
- textbook sibling order,
- no invented external curriculum.

Known node type examples:

- chapter
- topic
- subtopic
- concept
- activity
- experiment
- observation
- process
- classification
- application
- example
- worked_example
- exercise
- story
- case
- fact

This list is semantic, not a required hierarchy.

## 9.1 Known ID behaviour

Current parser ID design has used a pattern similar to:

```text
ncert-g{grade}-{subject-slug}-ch{chapterNumber}-node-{index}
```

Potential future concern:

If multiple books under the same board/grade/subject share chapter numbers, IDs based only on grade + subject + chapter + index can collide.

Before scaling to multiple books per subject, consider including `bookId` or `chapterId` in deterministic node IDs.

Do not casually change existing IDs if data already depends on them; inspect DB/references first.

## 9.2 Gemini model caution

Legacy/current code referenced a model string similar to:

```text
gemini-3.6-flash
```

Do not assume this model identifier will remain valid.

If an API call returns model-not-found or compatibility errors, verify current Gemini model/API documentation before changing it.

Never expose or commit `GEMINI_API_KEY`.

## 9.3 Large chapter caution

A one-shot full-chapter prompt may eventually hit:

- model input limits,
- output limits,
- truncation,
- incomplete hierarchy generation.

If long chapters become unreliable, design a controlled multi-stage/chunked ingestion method that preserves hierarchy and source fidelity.

Do not silently truncate textbook content.

---

# 10. CURRICULUM VALIDATOR — INTENDED BEHAVIOUR

The validator should protect Supabase from malformed AI output.

It currently/intentionally checks concepts such as:

- curriculum object exists,
- board exists,
- grade is valid,
- subject exists,
- book ID exists,
- book title exists,
- chapter ID exists,
- chapter number valid,
- chapter title exists,
- learning objectives are an array,
- nodes array exists,
- node IDs are unique,
- titles exist,
- types exist,
- descriptions are checked,
- content exists,
- ordering is valid,
- exactly one root,
- root type is `chapter`,
- parent references exist,
- self-parenting is rejected,
- circular hierarchy is rejected,
- all nodes are reachable from root,
- repeated titles are warned,
- duplicate substantial content is warned,
- sibling order conflicts are warned,
- unusually deep hierarchy is warned,
- suspiciously shallow hierarchy is warned,
- educational node-type statistics are produced.

Current grade validation was generalized away from the old Grade 6–10-only assumption.

Important philosophy:

- structural corruption should be an error,
- educational suspiciousness can often be a warning,
- do not reject a legitimate short fact/activity merely because of an arbitrary character threshold,
- do not force a minimum number of topics/depth levels.

---

# 11. GENERIC DATABASE IMPORTER — INTENDED BEHAVIOUR

The old importer was Grade-6-specific.

The new design must be independent of:

- grade,
- subject,
- book,
- chapter count,
- source folder.

It should read curriculum identity from the processed JSON itself:

```text
board
grade
subject
book_id
book
chapter_id
chapter_number
chapter
learning_objectives
nodes
```

The generic importer should:

1. read a supplied processed JSON file,
2. validate it before DB modification,
3. sort nodes parent-first,
4. upsert `CurriculumBook`,
5. upsert `CurriculumChapter`,
6. replace nodes only for the target chapter,
7. insert the complete recursive hierarchy,
8. verify stored node count,
9. use a transaction so partial chapter writes roll back.

Root `parent_id: ""` should map to Prisma `parentId: null`.

Do not create assumptions such as:

```text
Grade 6 only
Science only
Mathematics only
2 books
22 chapters
```

---

# 12. LEGACY GRADE 6 BATCH RUNNER

Legacy file:

```text
EDUADAPT/backend/src/services/curriculumIngestion/batchIngestGrade6.js
```

The old script was useful but hard-coded.

It included:

- `OUTPUT_ROOT` pointing to `ncert_processed/class6`,
- hard-coded Grade 6 Science / Mathematics book configuration,
- hard-coded source directories,
- hard-coded filename prefixes,
- hard-coded chapter counts,
- retry logic,
- retry backoff,
- chapter delay,
- resume/skip logic,
- existing JSON validation,
- PDF extraction,
- Gemini parsing,
- validation,
- processed JSON saving,
- result summary.

## 12.1 Preserve these useful behaviours

The future generic runner should preserve/generalize:

- retry on temporary Gemini failures,
- exponential-ish backoff,
- rate-limit handling,
- timeout handling,
- resume existing valid chapter,
- regenerate invalid/unreadable processed JSON,
- verify existing JSON identity before skipping,
- extraction statistics,
- parser invocation,
- validator invocation,
- warnings,
- processed JSON output,
- per-chapter status,
- final ingestion summary.

Temporary error detection historically included:

- HTTP 503,
- HTTP 429,
- `UNAVAILABLE`,
- `RESOURCE_EXHAUSTED`,
- high-demand messages,
- timeouts.

## 12.2 Remove these assumptions

Do NOT preserve:

- `class6`,
- fixed Grade 6 metadata,
- fixed Science/Mathematics list,
- fixed book count,
- fixed chapter count,
- fixed NCERT filename conventions as universal rules,
- summary hard-coded to Grade 6.

---

# 13. NEXT CURRICULUM ENGINEERING TASK

Build **one generic curriculum ingestion runner**, rather than scripts such as:

```text
batchIngestGrade4.js
batchIngestGrade5.js
batchIngestGrade6.js
```

The runner should accept configuration describing the actual ingestion target.

Conceptually:

```text
Configuration
├── board
├── grade
├── subject
├── bookId
├── book title
├── edition (optional)
├── source PDF(s)
├── chapter number / mapping
└── output location
        ↓
Generic Runner
        ↓
Extract
        ↓
Parse
        ↓
Validate
        ↓
Save processed JSON
        ↓
Optional explicit DB import
```

Prefer separating **generation/validation** from **database import** so curriculum can be inspected before it is committed to the authoritative database.

For initial validation of the new pipeline:

1. use ONE Grade 4 Mathematics chapter,
2. extract it,
3. parse it,
4. validate it,
5. inspect generated hierarchy/content manually,
6. only then import it,
7. verify Supabase,
8. then scale to the rest of Grade 4 Mathematics and The World Around Us.

Do not immediately bulk-ingest all books before validating quality.

---

# 14. DATABASE / PRISMA

## 14.1 Database

Database engine:

- PostgreSQL

Hosting:

- Supabase

## 14.2 Prisma

Current Prisma version during migration:

- Prisma CLI 7.10.0
- `@prisma/client` 7.10.0

Prisma Client generation succeeded.

## 14.3 Prisma 7 datasource configuration

Prisma 7 no longer accepts the old connection URL setup directly in the schema in the same way the old project used it.

Current schema datasource should be conceptually:

```prisma
datasource db {
  provider = "postgresql"
}
```

Connection configuration is handled through:

```text
backend/prisma7.config.ts
```

Known configuration:

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
```

Local `.env` contains connection variables including:

- `DATABASE_URL`
- `DIRECT_URL`

Never commit or print these secrets.

`.env.example` contains blank placeholders only.

---

# 15. CRITICAL PRISMA / MIGRATION WARNING

Known migrations:

```text
20260820231000_adaptive_learning
20260820231100_add_level_table
```

At the time of migration work, Prisma reported two migration directories and indicated that `20260820231000_adaptive_learning` was not applied according to migration history.

However, safe database introspection showed that the live Supabase schema already contains the relevant models.

Therefore there is a migration-history/schema-state mismatch risk.

### DO NOT RUN casually:

```bash
npx prisma migrate dev
npx prisma migrate deploy
npx prisma db push
```

Do not reset Supabase.

Do not attempt to “fix” migration history without first:

1. inspecting the live schema,
2. inspecting `_prisma_migrations`,
3. understanding how the schema reached its current state,
4. assessing data-loss risk,
5. making an explicit migration reconciliation plan.

The live database may contain important project data.

---

# 16. IMPORTANT PRISMA MODELS

The schema includes or has included the following models:

- School
- SchoolClass
- User
- Course
- Subject
- Chapter
- Topic
- Subtopic
- LearningObjective
- Lesson
- Enrollment
- Game
- GameAsset
- Question
- GameSession
- StudentProgress
- Badge
- UserBadge
- Leaderboard
- Notification
- EngagementLog
- Recommendation
- StudentInteraction
- StudentMistake
- StudentTopicMastery
- StudentSubtopicMastery
- XPTransaction
- Level
- CurriculumBook
- CurriculumChapter
- CurriculumNode
- GameSpec
- GamePlaySession

Relevant enums have included:

- Role
- RecommendationType
- GameType
- GameStatus
- Difficulty
- AssetType
- SessionStatus
- InteractionType

Inspect the current schema before coding because this list is context, not a substitute for the repository.

---

# 17. CURRICULUM PRISMA MODELS

## 17.1 CurriculumBook

Conceptually:

```prisma
model CurriculumBook {
  id         String   @id
  board      String   @default("NCERT")
  grade      String
  subject    String
  title      String
  edition    String?
  sourceFile String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  chapters CurriculumChapter[]

  @@unique([board, grade, subject, title])
  @@index([board, grade, subject])
}
```

Important:

- grade is stored as a string,
- subject is not restricted to Mathematics/Science,
- multiple books can exist,
- board should remain data-driven where possible.

## 17.2 CurriculumChapter

Conceptually:

```prisma
model CurriculumChapter {
  id                 String   @id
  bookId             String
  chapterNumber      Int
  title              String
  learningObjectives Json
  sourceFile         String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  book  CurriculumBook @relation(
    fields: [bookId],
    references: [id],
    onDelete: Cascade
  )

  nodes CurriculumNode[]

  @@unique([bookId, chapterNumber])
  @@index([bookId])
}
```

## 17.3 CurriculumNode

This model enables recursive hierarchy.

Conceptually:

```prisma
model CurriculumNode {
  id          String   @id
  chapterId   String
  parentId    String?
  title       String
  type        String
  description String?
  content     String
  orderIndex  Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  chapter CurriculumChapter @relation(
    fields: [chapterId],
    references: [id],
    onDelete: Cascade
  )

  parent CurriculumNode? @relation(
    "CurriculumNodeHierarchy",
    fields: [parentId],
    references: [id],
    onDelete: Cascade
  )

  children CurriculumNode[]
    @relation("CurriculumNodeHierarchy")

  @@index([chapterId])
  @@index([parentId])
  @@index([chapterId, orderIndex])
}
```

Do not replace this recursive structure with a fixed Topic/Subtopic/Concept schema for the new curriculum ingestion system.

---

# 18. EXISTING / LEGACY ACADEMIC CONTENT MODELS

EduAdapt also has more conventional educational entities such as:

- Course
- Subject
- Chapter
- Topic
- Subtopic
- LearningObjective
- Lesson

Do not assume `CurriculumNode` automatically replaces all of these everywhere.

The curriculum ingestion hierarchy is the source-grounded representation used for generation/adaptation. Existing application models may still serve product/domain purposes.

Before consolidating or deleting models, trace actual code usage and relations.

---

# 19. GAME GENERATION — CORE PURPOSE

The Unity Game Generator is a central EduAdapt feature.

It should generate a game from an approved learning target while respecting:

- curriculum,
- learning objectives,
- student mastery,
- difficulty,
- age/grade appropriateness,
- educational validity,
- technical Unity requirements.

Conceptual flow:

```text
Selected Curriculum Node
        +
Chapter / Book / Grade / Subject context
        +
Related curriculum context
        +
Student learner state
        +
Requested/adaptive difficulty
        ↓
Game Generation Orchestrator
        ↓
Educational Game Design
        ↓
Visual Specification
        ↓
Unity Specification
        ↓
Validation
        ↓
Persist GameSpec / Game
        ↓
Unity runtime loads specification
        ↓
Student plays
        ↓
GamePlaySession + interaction telemetry
```

---

# 20. GAME GENERATION ORCHESTRATOR

A known orchestrator function from the previous implementation is conceptually:

```javascript
async function saveGeneratedGame({
  selectedNodeId,
  curriculum,
  selectedNode,
  result
}) {
  // validate selected node and generated game
  // derive slug/game_id
  // derive title
  // normalize difficulty
  // determine rendering mode
  // construct persisted spec
  // save generated game/spec with Prisma
}
```

Known behaviour included:

- require `selectedNodeId`,
- require generated game data,
- derive slug from `game.game_id` or `game.slug`,
- reject missing game ID,
- derive title from `title`, `game_title`, or slug,
- normalize difficulty to uppercase,
- derive rendering mode from game/result visual specification,
- default rendering mode around `2.5D`,
- persist game,
- persist visual specification,
- persist validation data.

Inspect the actual `gameOrchestrator.js` before editing because migration may not yet have moved the newest implementation into `EduAdapt-Core`.

Legacy paths included:

```text
src/services/gameGeneration/gameOrchestrator.js
src/services/gameGeneration/gameSpecService.js
src/services/gameGenerationService.js
src/controllers/gameGenerationController.js
src/routes/gameGenerationRoutes.js
```

---

# 21. GAME SPECIFICATION REQUIREMENTS

A previous master generation specification included fields/concepts such as:

- `game_id`
- `topic_id`
- `chapter_id`
- `subtopics`
- `learning_objectives`
- initial difficulty
- difficulty reasons
- difficulty conditions
- gameplay phases
- reinforcement
- pixel-art direction
- Unity specification
- adaptive system
- fallback behaviour
- database mapping
- validation

The exact schema should be taken from current code if present.

Do not invent incompatible fields without tracing consumers.

## 21.1 Educational generation principles

The game must be educationally grounded in the selected curriculum.

AI may generate:

- scenarios,
- narratives,
- puzzles,
- visual metaphors,
- numbers,
- interaction patterns,
- questions,
- hints,
- dialogue.

But required knowledge should remain within the approved curriculum unless explicitly marked enrichment.

## 21.2 Fallbacks

Game generation has previously considered fallbacks such as:

- quiz,
- riddle,
- video/lesson-like fallback.

If a full interactive game cannot be safely/validly generated, the system should fail gracefully rather than output unusable Unity content.

---

# 22. GAME REUSE / GENERATION LOGIC

A previous requirement was:

- check whether a suitable game already exists for the learning target,
- reuse where appropriate,
- otherwise generate.

Avoid generating duplicate games unnecessarily.

However, reuse decisions may eventually need to account for:

- curriculum version,
- game version,
- difficulty,
- learner context,
- generation model/version,
- rendering mode.

Inspect existing implementation before changing caching/reuse semantics.

---

# 23. GAME SPEC DATABASE MODEL

`GameSpec` exists in the database.

Known conceptual fields include:

- UUID `id`
- unique `slug`
- `title`
- `subject`
- `topic`
- `grade`
- `curriculumNodeId`
- `renderingMode`
- `difficulty`
- `status`
- `spec` JSON
- `version`
- timestamps

Table mapping has been:

```text
game_spec
```

Known defaults have included:

- rendering mode: `2.5D`
- difficulty: `EASY`

Treat the Prisma schema as authoritative for exact current field names/types.

---

# 24. GAMEPLAY SESSION MODEL

`GamePlaySession` is intended to store adaptive gameplay outcomes.

Known conceptual fields:

- `gameSlug`
- `playerKey`
- optional `studentId`
- difficulty
- score
- accuracy
- time taken in seconds
- attempts
- hints used
- mistakes JSON
- concepts mastered JSON
- concepts misunderstood JSON
- completion
- abandoned
- timestamps

Table mapping has been:

```text
game_play_session
```

This data is important for adaptive decisions.

Do not reduce gameplay telemetry to only score.

---

# 25. DETAILED LEARNER DATA / ADAPTIVE MODELS

Relevant models include:

### StudentInteraction

Useful for recording fine-grained interactions.

Potential signals:

- action type,
- correctness,
- timing,
- attempts,
- context,
- selected answer/action.

### StudentMistake

Used to persist meaningful mistakes/misconceptions.

### StudentTopicMastery

Stores topic-level learner mastery.

### StudentSubtopicMastery

Stores more granular mastery.

### StudentProgress

General progression data.

### EngagementLog

Tracks engagement behaviour.

### Recommendation

Stores generated/derived recommendations.

### XPTransaction / Level / Badge / UserBadge / Leaderboard

Gamification and progression infrastructure.

When implementing adaptation, inspect existing fields rather than creating parallel duplicate state.

---

# 26. GAMIFICATION

EduAdapt includes:

- points / XP,
- badges,
- levels,
- leaderboards,
- achievements/rewards.

Gamification should reinforce learning rather than replace educational objectives.

Known student-level concept in earlier planning:

- A / B / C levels were considered as learner grouping/progression concepts.

Do not confuse such learner level concepts with game difficulty enums unless current code explicitly maps them.

---

# 27. UNITY GAME RUNTIME

The generated specification must ultimately be consumable by Unity.

Important Unity/C# runtime components previously identified for migration/search include:

- GameDataLoader
- GameManager
- PlayerSystem
- InteractionSystem
- MissionSystem
- SimulationSystem
- AssetResolver
- Scene generation logic
- JSON parsing/loading logic

Before changing JSON contracts, locate these `.cs` files and inspect what Unity actually expects.

A previous terminal workflow was intended to list their paths into `path.txt`.

Do not modify generator output contracts independently of Unity runtime consumers.

---

# 28. UNITY GAME CONCEPT / SAMPLE CONTENT

A sample learning context used during design:

**Chemistry — Chapter 1: What is Matter**

Concepts included:

- states of matter,
- properties,
- classification.

This was used as a design example, not as a restriction on the platform.

Earlier Unity/React game planning included:

- player,
- companion character Nova,
- atoms,
- molecule-building,
- quests,
- inventory,
- XP,
- achievements,
- audio,
- save state.

Example asset concepts:

```text
audio/
  ambience
  click
  collect
  success
  dialogue

fonts/
  Pixel.ttf

sprites/
  player idle/walk/jump
  nova idle/fly
  atoms H/O/C/N

ui/
  buttons
  xp bar
  inventory

backgrounds/
  chemistry_world
  mountains
  clouds
  trees
  grass
```

Previous implementation milestones:

1. world + menu
2. player + camera + Nova + dialogue
3. atoms + molecules + gameplay
4. quests + inventory + XP + achievements
5. audio + effects + save

These are historical design details. Do not assume all are implemented in current repo.

---

# 29. VISUAL DIRECTION

Pixel-art styling has been an explicit requirement in prior game/UI design work.

Generated game specifications may need to communicate visual style consistently.

However, game-generation logic should separate:

- educational semantics,
- gameplay mechanics,
- visual specification,
- runtime/asset specification.

Do not make educational validity depend on a particular visual style.

---

# 30. GAME VALIDATION

Generated games should be validated before persistence/runtime use.

Validation should eventually cover at least:

- required identifiers,
- curriculum target consistency,
- learning objective coverage,
- grade appropriateness,
- difficulty consistency,
- required game phases,
- technical Unity fields,
- references to assets/entities,
- no impossible/undefined dependencies,
- fallback validity,
- source/curriculum boundary compliance.

Do not treat syntactically valid JSON as automatically educationally valid.

---

# 31. CURRICULUM → GAME CONTEXT SELECTION

A game should not necessarily receive only one isolated sentence from one node.

Generation may need:

- selected node,
- parent context,
- relevant children,
- chapter objectives,
- related mastered concepts,
- prerequisite curriculum,
- learner mastery.

But context expansion must remain controlled.

For hard difficulty, combining previously learned approved curriculum is acceptable.

Do not indiscriminately dump the entire curriculum database into every generation call.

---

# 32. DATABASE SAFETY DURING CURRICULUM REBUILD

The existing Grade 6 curriculum may have been generated using an older, less detailed parser.

The current direction is likely to rebuild curriculum with the richer ingestion system.

However:

**DO NOT DELETE CURRENT CURRICULUM YET.**

First:

1. finish generic pipeline,
2. test one Grade 4 Mathematics chapter,
3. inspect quality,
4. validate DB import,
5. design controlled cleanup/rebuild.

Do not reset the entire database.

If cleanup is needed, target only the relevant curriculum records.

Be aware of cascade relations.

Never delete:

- users,
- student progress,
- badges,
- gameplay sessions,
- generated games,
- adaptive data,

unless there is an explicit reviewed migration plan.

---

# 33. RLS / SUPABASE NOTE

Database introspection previously warned that Row Level Security existed on at least some generated-game/session tables such as:

- GameSpec
- GamePlaySession

Do not assume backend runtime access will work merely because Prisma schema generation succeeds.

When runtime database operations are tested, verify:

- connection role,
- RLS policies,
- Supabase permissions,
- service/backend access.

Do not disable RLS casually.

---

# 34. REPOSITORY MIGRATION STATUS

Current active repo:

```text
EduAdapt-Core
```

Legacy repo:

```text
EDUADAPT
```

Migration philosophy:

**selectively migrate actual required code**, not the entire old backend.

Avoid migrating:

- `__pycache__`,
- generated caches,
- `node_modules`,
- old processed curriculum data unless intentionally needed,
- NCERT source directories unless intentionally added,
- temporary output,
- unrelated legacy backend files.

The old curriculum ingestion files were selectively copied into the new backend and then generalized.

---

# 35. GIT / GITHUB STATE

Repository:

```text
https://github.com/meghamcr/EduAdapt-Core
```

Default branch:

```text
main
```

Known initial backend/database setup commit:

```text
4a40b74
Set up EduAdapt backend database and Prisma
```

GitHub CLI push succeeded previously.

Do not assume every curriculum edit after that commit is already pushed.

Before Codex/Work changes anything, run/check:

```bash
git status
git log --oneline -n 10
```

and inspect diff.

Do not overwrite uncommitted user changes.

---

# 36. GITIGNORE / SECRET RULES

Backend ignore rules include concepts such as:

```gitignore
node_modules/

.env
.env.local
.env.*.local

/generated/prisma/

.agents/
.claude/
.windsurf/
skills-lock.json

.DS_Store

*.log
npm-debug.log*
```

Root also ignores `.DS_Store`.

Never commit:

- Supabase DB passwords,
- `DATABASE_URL`,
- `DIRECT_URL`,
- Gemini keys,
- GitHub tokens,
- other credentials.

Use `.env.example` with blank placeholders.

---

# 37. TEAM DATABASE ACCESS

Supabase invites were sent to teammates.

The actual database lives in Supabase; GitHub contains schema/code, not the database itself.

A teammate typically needs:

```text
clone/pull repository
npm install
local .env
npx prisma generate
```

Do not tell teammates to run migrations casually given the current migration-history mismatch.

---

# 38. BACKEND / PRISMA CLIENT

A centralized Prisma client exists at:

```text
backend/src/prismaClient.js
```

Prefer using the project client rather than repeatedly instantiating unrelated `new PrismaClient()` objects across services, unless architecture requires otherwise.

Inspect its actual implementation before use.

---

# 39. CURRENT CURRICULUM WORK STATUS

At the point this handoff was created:

### Completed conceptually / syntax-checked locally

- Prisma/Supabase schema setup migrated to EduAdapt-Core.
- Prisma 7 configuration established.
- Prisma validate/generate succeeded.
- `curriculumParser.js` upgraded for rich source-grounded dynamic hierarchy.
- `curriculumValidator.js` generalized and strengthened.
- `pdfExtractor.js` made conservative/structure-preserving.
- `importCurriculumToDatabase.js` redesigned as generic grade/subject/book-independent importer.
- Syntax checks produced no errors for these edited ingestion files according to the interactive migration session.

### Not yet completed

- Generic curriculum ingestion runner.
- Grade 4 source-PDF integration.
- First Grade 4 Mathematics chapter end-to-end test.
- Manual curriculum-quality inspection.
- Grade 4 DB import verification.
- Full Grade 4 Mathematics ingestion.
- Full The World Around Us ingestion.
- Controlled Grade 6 rebuild.
- Complete migration of game-generation services into EduAdapt-Core.
- Complete migration/verification of Unity runtime contracts.

---

# 40. GENERIC RUNNER REQUIREMENTS — NEXT IMPLEMENTATION

The next coding task should be a generic runner.

Suggested naming:

```text
backend/src/services/curriculumIngestion/ingestCurriculum.js
```

or another clear generic name.

Do not call it `batchIngestGrade4.js`.

## 40.1 Configuration-driven design

A configuration should be able to describe:

```json
{
  "board": "NCERT",
  "grade": "4",
  "subject": "Mathematics",
  "bookId": "...",
  "book": "...",
  "edition": "...",
  "chapters": [
    {
      "chapterNumber": 1,
      "pdfPath": "..."
    }
  ]
}
```

This is illustrative, not a frozen contract.

The design should also accommodate:

- arbitrary subject names,
- multiple books per subject,
- nonstandard PDF filenames,
- chapter-level source mapping,
- future boards if required.

## 40.2 Runner stages

Per chapter:

```text
Resolve source
    ↓
Check existing processed output
    ↓
If valid + identity matches → optionally skip
    ↓
Extract PDF
    ↓
Check extraction quality
    ↓
Parse with retry
    ↓
Validate
    ↓
Save processed JSON
    ↓
Record summary
```

Database import should be an explicit stage/action, not an accidental side effect of merely parsing a PDF.

## 40.3 Resume behaviour

If processed JSON exists:

- parse it,
- validate it,
- verify board/grade/subject/book/chapter identity,
- skip only if valid and intended,
- regenerate if unreadable/invalid/mismatched.

Provide a force/regenerate mechanism eventually.

## 40.4 Retry behaviour

Retain robust handling for temporary AI/API failures.

Do not retry permanent validation errors indefinitely.

## 40.5 Summary

Produce a summary containing:

- generation timestamp,
- target configuration,
- successful chapters,
- skipped chapters,
- failed chapters,
- node counts,
- warnings,
- output paths,
- errors.

No summary field should be hard-coded to Grade 6.

---

# 41. INITIAL GRADE 4 PLAN

Current requested subjects:

- Mathematics
- The World Around Us

Before ingesting, confirm exact official:

- book titles,
- editions,
- chapter counts,
- PDF source mapping,
- chapter filenames.

Do not infer book metadata from old Grade 6 conventions.

The Grade 4 configuration is data for the generic runner, not new hard-coded application logic.

---

# 42. NCERT SOURCE / PROCESSED DATA POLICY

Legacy directories included:

```text
backend/ncert_source/class6/...
backend/ncert_processed/class6/...
```

These were intentionally not blindly migrated.

The new system should establish a scalable organization if local source/processed data is retained.

For example, conceptually:

```text
curriculum_source/
  ncert/
    grade-4/
      mathematics/
      the-world-around-us/

curriculum_processed/
  ncert/
    grade-4/
      mathematics/
      the-world-around-us/
```

Exact naming can be decided during implementation.

Avoid embedding filesystem layout assumptions deep inside core parsing/import logic.

---

# 43. QUALITY CONTROL FOR FIRST INGESTION

For the first new chapter, manually inspect:

### Identity
- correct board,
- grade,
- subject,
- book,
- chapter number,
- exact chapter title.

### Hierarchy
- multiple topics when actually present,
- correct parent-child relationships,
- no artificial hierarchy,
- no collapsed entire chapter.

### Content
- definitions preserved,
- explanations preserved,
- examples preserved,
- worked examples preserved,
- activities preserved,
- observations preserved,
- calculations preserved,
- important tables represented,
- no obvious truncation.

### Source grounding
- no invented outside concepts,
- no unexplained higher-grade knowledge.

### Game usefulness
Ask whether a game generator could use each important node without having to invent what the textbook teaches.

Only after this inspection should bulk ingestion begin.

---

# 44. ADAPTIVE GAME GENERATION — DATA FLOW

A future generation request should conceptually resolve:

```text
Student
  ↓
Current curriculum node
  ↓
Chapter + objectives
  ↓
Mastery state
  ↓
Mistakes / misconceptions
  ↓
Recent gameplay history
  ↓
Difficulty decision
  ↓
Generation constraints
  ↓
Game Orchestrator
  ↓
GameSpec
```

After play:

```text
Unity Game
  ↓
GamePlaySession
  ↓
StudentInteraction
  ↓
StudentMistake
  ↓
Mastery update
  ↓
XP / gamification
  ↓
Recommendation
  ↓
Next learning/game target
```

---

# 45. ADAPTATION MUST BE EXPLAINABLE

Where practical, store or derive reasons for difficulty changes.

Example:

```text
Difficulty changed EASY → MEDIUM because:
- high recent accuracy,
- low hint usage,
- acceptable response time,
- repeated successful attempts.
```

Or:

```text
MEDIUM → EASY/remediation because:
- repeated misconception,
- low accuracy,
- high hint usage,
- incomplete objective mastery.
```

Avoid opaque random difficulty changes.

---

# 46. GAME GENERATION INPUT VALIDATION

Before generation:

- selected curriculum node must exist,
- chapter/book context must exist,
- node must contain usable educational content,
- learner ID/context should be validated if supplied,
- requested difficulty must be valid,
- generation should know whether this is cold-start or personalized,
- prerequisites/related concepts must be selected intentionally.

Do not send malformed/missing curriculum to the model and hope it recovers.

---

# 47. GAME GENERATION OUTPUT PERSISTENCE

When saving generated games:

- ensure `game_id`/slug exists,
- ensure stable unique identifier,
- normalize difficulty,
- normalize rendering mode,
- persist raw/normalized spec as needed,
- persist visual specification,
- persist validation results,
- associate with curriculum target,
- version generated specs when appropriate.

Do not overwrite an existing game blindly if versioning/reuse semantics matter.

---

# 48. UNITY JSON CONTRACT SAFETY

Before changing the generated JSON:

1. inspect generator schema,
2. inspect Unity `GameDataLoader`,
3. inspect JSON DTO/classes,
4. inspect scene generation,
5. inspect `GameManager`,
6. inspect systems consuming each field.

A backend-only “cleanup” can break Unity even when the backend tests pass.

Maintain backward compatibility or coordinate a versioned schema migration.

---

# 49. GAME SYSTEM COMPONENT RESPONSIBILITIES — CONCEPTUAL

These names have been used in the Unity architecture.

### GameDataLoader
Loads generated game JSON/specification.

### GameManager
Coordinates overall game lifecycle/state.

### PlayerSystem
Controls player state/movement/actions as applicable.

### InteractionSystem
Handles interactable objects and educational interactions.

### MissionSystem
Tracks goals/tasks/quests.

### SimulationSystem
Runs game-specific simulations/educational systems.

### AssetResolver
Maps specification asset references to actual Unity resources/assets.

### Scene Generation
Constructs/configures runtime scene from specification.

Actual responsibilities must be confirmed from code.

---

# 50. GAME ASSET / VISUAL GENERATION

The system has considered AI-generated or specified visual assets.

Asset handling should be deterministic enough for Unity:

- stable identifiers,
- type,
- source/path,
- fallback,
- dimensions/usage where needed.

Avoid a spec that references assets Unity cannot resolve.

`GameAsset` exists as a data model; inspect current relationships before implementing asset persistence.

---

# 51. TEACHER FLOW — INTENDED

Teacher functionality has included the idea that a teacher can provide/select:

- curriculum topic/node,
- difficulty or desired learning target,
- game/content generation request.

The AI then generates content/game material.

Teacher controls should not bypass curriculum validity silently.

Future teacher review/approval may be useful for generated content.

---

# 52. STUDENT FLOW — INTENDED

Student:

1. enters learning experience,
2. receives suitable content/game,
3. plays/answers,
4. system records behaviour,
5. weak concepts are identified,
6. mastery is updated,
7. recommendation/remediation is generated,
8. gamification is updated,
9. next experience adapts.

---

# 53. ADMIN FLOW — INTENDED

Admin functionality can include:

- user/school management,
- curriculum oversight,
- platform monitoring,
- analytics,
- generated content/game oversight.

Do not assume every admin feature is implemented.

---

# 54. ANALYTICS / RESEARCH EVALUATION

Academic project objectives include evaluating recommendation/adaptive performance using metrics such as:

- precision,
- recall,

and potentially other suitable evaluation metrics.

Important research rule:

Do not invent performance numbers.

Earlier paper planning explicitly required actual evaluation data, e.g.:

```text
Collect results
→ calculate metrics
→ create graphs
→ report actual measured numbers
```

Claims such as “94% accuracy” must come from a documented evaluation dataset/procedure, not generated prose.

---

# 55. RESEARCH POSITIONING

The project research argument has been framed around integrating gaps across:

- adaptive learning,
- gamification,
- LLM educational content generation,
- recommendation systems,
- learner modelling,
- game generation.

General research gap direction:

Existing adaptive learning can personalize but may not dynamically generate rich games.

Existing gamification can improve engagement but is often static.

LLMs scale content generation but introduce hallucination/validation risks.

Recommendation systems personalize paths but require learner data.

EduAdapt aims to integrate:

- curriculum grounding,
- learner modelling,
- adaptive difficulty,
- generated educational games/content,
- validation,
- gamification,
- recommendations.

---

# 56. SECURITY / PRIVACY ENGINEERING PRINCIPLES

Student educational data can be sensitive.

Follow:

- least privilege,
- role-based access,
- avoid logging secrets,
- avoid exposing raw credentials,
- minimize unnecessary learner data in AI prompts,
- separate public curriculum from private learner context,
- validate authorization before accessing student records.

Do not send personally identifying student information to generation models unless necessary and explicitly designed.

---

# 57. ERROR HANDLING PRINCIPLES

For AI generation:

- distinguish temporary API errors from permanent errors,
- retry temporary failures,
- do not retry malformed local configuration forever,
- preserve useful error context without leaking secrets.

For curriculum import:

- validate before write,
- transactionally update a chapter,
- rollback partial failures.

For Unity generation:

- validate before save/launch,
- use fallbacks where appropriate,
- do not produce silent partial specs.

---

# 58. TESTING PRIORITIES

## Curriculum

Tests should cover:

- PDF extraction,
- parser output normalization,
- validator,
- parent references,
- cycle detection,
- root detection,
- duplicate IDs,
- sibling order,
- generic grades/subjects,
- multiple books,
- importer transaction behaviour,
- re-import behaviour.

Legacy repo contained tests for:

- curriculum parser,
- curriculum validator,
- PDF extractor.

Consider selectively migrating/adapting tests.

## Game generation

Tests should eventually cover:

- missing selected node,
- missing game ID,
- difficulty normalization,
- rendering mode,
- valid persisted spec,
- invalid generation rejection,
- curriculum association,
- reuse/version behaviour.

## Adaptive logic

Tests should cover deterministic scenarios:

- cold start,
- high mastery,
- struggling learner,
- repeated misconception,
- excessive hints,
- abandonment,
- progression,
- remediation.

---

# 59. DO NOT HARD-CODE THESE

Avoid hard-coding:

- Grade 4,
- Grade 6,
- grade range unless product policy explicitly defines one,
- Mathematics,
- Science,
- The World Around Us,
- one book per subject,
- fixed chapter counts,
- fixed topic counts,
- fixed hierarchy depth,
- fixed NCERT PDF filename prefixes,
- fixed source directory structures,
- exactly two books,
- exactly 22 chapters.

Configuration and source data should drive these values.

---

# 60. DO NOT DO THESE WITHOUT EXPLICIT REVIEW

- Do not run destructive Prisma commands.
- Do not reset Supabase.
- Do not delete curriculum before the new pipeline is validated.
- Do not delete student/game/progress data as part of curriculum cleanup.
- Do not commit `.env`.
- Do not expose API keys.
- Do not copy the entire legacy backend into the new repo.
- Do not replace recursive curriculum hierarchy with a rigid schema.
- Do not silently add external knowledge to authoritative curriculum.
- Do not change Unity JSON contracts without inspecting Unity consumers.
- Do not invent academic evaluation metrics.
- Do not assume local edits are already pushed.

---

# 61. SAFE STARTUP CHECKLIST FOR CODEX / WORK / ASTRA

Before making changes:

```bash
cd ~/Documents/GitHub/EduAdapt-Core

git status
git log --oneline -n 10
```

Then inspect:

```text
backend/package.json
backend/prisma/schema.prisma
backend/prisma7.config.ts
backend/src/prismaClient.js
backend/src/services/curriculumIngestion/
backend/src/services/gameGeneration/   (if present)
```

Search for Unity/game-generation contracts and related code.

Do not modify files based only on this handoff when current code gives more precise implementation detail.

---

# 62. RECOMMENDED IMMEDIATE WORK SEQUENCE

## Phase A — Protect current work

1. inspect `git status`,
2. inspect diffs of curriculum ingestion files,
3. ensure no secrets are staged,
4. commit the generalized ingestion changes on an appropriate branch/commit.

## Phase B — Generic curriculum runner

5. design configuration schema,
6. implement generic runner,
7. preserve retry/resume logic from old Grade 6 runner,
8. keep DB import explicit,
9. add tests.

## Phase C — Grade 4 proof

10. obtain/locate official source PDFs,
11. configure one Grade 4 Mathematics chapter,
12. extract,
13. parse,
14. validate,
15. manually inspect processed JSON,
16. import one chapter,
17. verify Supabase.

## Phase D — Scale curriculum

18. ingest remaining Grade 4 Mathematics,
19. ingest The World Around Us,
20. inspect summaries/warnings,
21. decide controlled Grade 6 regeneration.

## Phase E — Game generator migration

22. inventory legacy game-generation files,
23. migrate only required services,
24. inspect Prisma GameSpec/GamePlaySession usage,
25. inspect Unity contracts,
26. reconnect curriculum-node selection to game generation,
27. test one end-to-end generated game.

## Phase F — Adaptive loop

28. record gameplay session,
29. update learner model,
30. calculate next difficulty,
31. generate/reuse next game,
32. verify full loop.

---

# 63. LEGACY FILES WORTH INSPECTING

Known legacy backend files include:

```text
src/controllers/curriculumController.js
src/controllers/gameGenerationController.js

src/routes/curriculumRoutes.js
src/routes/gameGenerationRoutes.js

src/services/curriculumService.js

src/services/curriculumIngestion/
  batchIngestGrade6.js
  curriculumParser.js
  curriculumValidator.js
  importCurriculumToDatabase.js
  pdfExtractor.js

src/services/gameGeneration/
  gameOrchestrator.js
  gameSpecService.js

src/services/gameGenerationService.js

src/prismaClient.js
```

Do not assume every legacy file should be copied.

Inspect dependencies and current equivalents first.

---

# 64. CURRENT SOURCE TREE SEARCH NEED

When migrating Unity code, locate `.cs` files associated with:

```text
GameDataLoader
GameManager
PlayerSystem
InteractionSystem
MissionSystem
SimulationSystem
AssetResolver
Scene generation
JSON parsing/loading
```

The user previously wanted only actual code paths and excluded caches/non-code/NCERT processed/source files from tree outputs.

Maintain that preference when generating repository inventories.

---

# 65. FILE / DIRECTORY CLEANLINESS

When generating code-tree listings, exclude:

- `__pycache__`
- caches
- `node_modules`
- generated binary/non-code clutter
- NCERT processed/source data when the goal is code architecture
- unrelated build outputs

This helps focus migration on actual implementation.

---

# 66. IMPORTANT DESIGN DISTINCTION: AUTHORITATIVE VS GENERATED

Maintain this conceptual separation:

```text
AUTHORITATIVE
Textbook / approved curriculum
        ↓
CurriculumBook
CurriculumChapter
CurriculumNode

GENERATED
        ↓
Lessons
Questions
Hints
Scenarios
Games
Visual specifications

OBSERVED
        ↓
Gameplay sessions
Interactions
Mistakes
Mastery
Engagement

DERIVED
        ↓
Difficulty
Recommendations
Learning path
```

Do not write AI-generated scenarios back into authoritative curriculum as though they came from the textbook.

---

# 67. VERSIONING CONSIDERATIONS

As EduAdapt matures, consider versioning for:

- curriculum edition/source,
- parser version,
- generated GameSpec version,
- game generation prompt/schema version,
- Unity runtime contract version,
- adaptive algorithm version.

Do not introduce unnecessary versioning complexity immediately, but avoid designs that make future versioning impossible.

---

# 68. CONTENT PROVENANCE — FUTURE IMPROVEMENT

Current curriculum models do not necessarily store detailed page/span provenance for every node.

For academic defensibility and validation, future work may benefit from storing:

- source file,
- source page range,
- source section,
- extraction/parser version.

Do not alter schema solely based on this suggestion without reviewing current requirements and migration risk.

---

# 69. GAME GENERATION AND CURRICULUM BOUNDARY EXAMPLE

Suppose the curriculum teaches:

```text
Multiplication
Addition
Money
```

Allowed hard game:

> A multi-step shop scenario where the learner calculates several item quantities, totals costs, and reasons about remaining money.

The scenario can be AI-generated.

Not acceptable:

> Requiring algebraic concepts from a later grade that are not part of the approved curriculum, then lowering the learner's mastery for failing them.

This distinction is central to EduAdapt.

---

# 70. FINAL SOURCE-OF-TRUTH ORDER

When information conflicts, use this order:

1. **Current checked-out repository code and schema** for exact implementation.
2. **Live database introspection** for actual database state.
3. **This handoff** for architectural intent, constraints, migration context, and decisions.
4. **Legacy EDUADAPT repo** for code to inspect/reuse selectively.
5. Old generated/processed curriculum only as historical data, not as automatically authoritative new output.

Do not let stale legacy code override current architecture.

---

# 71. HANDOFF SUMMARY

EduAdapt is not merely a curriculum parser and not merely a Unity game.

It is intended to be a closed adaptive-learning loop:

```text
SOURCE-GROUNDED CURRICULUM
        ↓
DYNAMIC CURRICULUM HIERARCHY
        ↓
LEARNER STATE
        ↓
ADAPTIVE DIFFICULTY
        ↓
AI GAME GENERATION
        ↓
VALIDATED UNITY GAME SPEC
        ↓
GAMEPLAY
        ↓
TELEMETRY + MISTAKES + MASTERY
        ↓
RECOMMENDATION / REMEDIATION
        ↓
NEXT ADAPTIVE EXPERIENCE
```

The current engineering priority is to finish a scalable, configuration-driven curriculum ingestion pipeline without reintroducing Grade-6/subject-specific assumptions.

After curriculum ingestion is proven on one Grade 4 chapter, continue the selective migration and verification of the game-generation/Unity pipeline and reconnect it to learner adaptation.

---

# 72. INSTRUCTION TO THE NEXT CODING AGENT

**Do not immediately code after reading only the final section.**

First:

1. read this complete handoff,
2. inspect the repository,
3. inspect uncommitted changes,
4. inspect the Prisma schema,
5. inspect the current ingestion files,
6. compare legacy code only where needed,
7. state the exact files you intend to change and why,
8. make small verifiable changes,
9. run syntax/tests after each logical step,
10. avoid destructive database operations.

The next concrete task is:

> **Implement a generic, configuration-driven, resumable curriculum ingestion runner that preserves the useful retry/resume/summary behaviour of the old `batchIngestGrade6.js` without hard-coding grade, subject, book, chapter count, source directory, or PDF filename conventions. Keep database import explicit so the first Grade 4 Mathematics chapter can be manually inspected before being written to Supabase.**

After that is validated, continue toward the full curriculum → adaptive game generation → Unity gameplay → learner-model feedback loop described in this document.
