# Applied — context handoff

Paste the block below into Claude Code when you open it inside this folder.

---

I'm a full-stack engineer in Tunisia, one year out of my computer science engineering degree. My stack is Laravel/PHP and Next.js, and I know NestJS from a previous project. I have not worked since graduating, so I have a one-year employment gap and my portfolio is mostly CRUD apps from internships whose code I can't publish (company-owned). I'm building this project to fix both problems at once.

**What this project is:** "Applied" — a job application tracker that reads my Gmail and figures out the state of every application automatically. I applied to a lot of jobs this year and completely lost track of which ones rejected me, which went silent, and which I should follow up on. That's a real problem I have, and it's the story I'll tell recruiters — it turns my gap year into the reason the project exists.

**Why it's built this way:** I deliberately chose a project with hard backend parts instead of another CRUD app, because CRUD is exactly what my portfolio already has too much of. The parts that matter to me are: OAuth, background sync with a cursor, parsing messy real-world email, fuzzy-matching emails back to applications, a status state machine, and derived state (detecting "ghosted"). Those are the things I want to be able to discuss in an interview.

**Hard constraints:**
- **Zero budget.** Everything must run on free tiers: Neon (Postgres), local Docker Redis, Upstash free tier if Redis is needed in production, Render free web service for the API, Vercel free for the frontend. Never suggest anything with a credit card.
- **I must understand every line.** This is going in my portfolio and I will be interviewed on it. Explain your reasoning as you go, especially for the classification/matching logic and the state machine — that logic is the part that's mine. If I ask you to write something, tell me what it does and why before moving on. Prefer clear code over clever code.
- **Real commit history.** Small, meaningful commits as we go, not one giant dump.

**Stack (already decided, don't re-litigate):**
- `api/` — NestJS + TypeScript, Prisma, BullMQ (Redis), googleapis
- `web/` — Next.js (App Router, Tailwind, TypeScript)
- Postgres on Neon, Redis via local `docker-compose.yml`

**Already done:**
- Repo initialised, `api/` and `web/` scaffolded, `docker-compose.yml` with Redis
- `api/prisma/schema.prisma` written with models: User, Application, EmailMessage, StatusEvent, and an ApplicationStatus enum

Four schema decisions I should be able to defend:
1. `EmailMessage.gmailId @unique` — the idempotency key, so re-running a sync can't create duplicates
2. `User.lastHistoryId` — incremental sync cursor, so the second sync asks Gmail "what changed since X" instead of refetching everything
3. `Application.companyKey` — normalized company name, so `careers@acme.com`, `Acme Inc.` and `ACME` all match one application
4. `StatusEvent` — stores the history of transitions, not just current status. `GHOSTED` is derived by us, never received in an email

**Build plan:**
- *Night 1 (vertical slice):* Neon connected + migration run → Google OAuth flow → fetch last 90 days of mail → parse/classify (rejection / interview / auto-ack) → store applications → basic list UI. Goal is something that works end to end on my real inbox.
- *Later:* BullMQ background sync, incremental sync with cursors, ghosting detection after N days, full status state machine, WebSocket live progress, deploy, and two blog posts (one on the sync/queue design, one on what broke first).

**Where I'm stuck / next step:** I need to create a Neon database and Google OAuth credentials (Gmail API enabled, my own email added as a test user, redirect URI `http://localhost:3000/auth/google/callback`). Walk me through anything I got wrong there, then help me wire up `.env`, run the first Prisma migration, and get the OAuth flow working.

Please start by reading the repo to see what's actually there, confirm the state, then tell me the next concrete step and how to run things. Don't write large amounts of code before checking with me.
