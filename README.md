# SupportAI

AI-powered multi-product support platform with product-scoped RAG, auto-escalation, and a full admin control center. Built with Next.js, Supabase, n8n, and pgvector.

## Architecture

```
User Message → Next.js Frontend → n8n Webhook → PII Redaction → Query Classification
    → pgvector Similarity Search (product-scoped) → GPT-4o-mini Response
    → Confidence Scoring → Auto-Escalation (if low) → Response + Audit Log
```

Three portals with strict RBAC:

- **Public** — Landing page chatbot, no login required
- **Client** — Authenticated, product-scoped RAG chat
- **Admin** — Full control center with tickets, KB, analytics, workflow errors

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript |
| Auth | Supabase Auth (email/password, JWT) |
| Database | Supabase PostgreSQL + pgvector |
| AI/Workflows | n8n (PII redaction, classification, RAG, GPT-4o-mini) |
| Embeddings | OpenAI text-embedding-3-small (via n8n) |
| PDF Parsing | pdfjs-dist (client-side) |

## Features

### Landing Page (`/`)
- Marketing page with hero, features, how-it-works flow, portal comparison
- Live public chatbot with markdown rendering
- Anonymous session tracking

### Login (`/login`)
- Tabbed Sign In / Create Account
- Auto-redirect: admins → `/admin`, clients → `/client`

### Admin Dashboard (`/admin`) — 8 Views
1. **Dashboard** — Stat cards (conversations, open tickets, avg confidence, escalation rate), category chart, SVG confidence gauge, recent activity table
2. **Audit Logs** — PII-redacted interaction history with user enrichment
3. **Tickets** — Filter by status, modal for team assignment and resolution
4. **Escalations** — Escalation records with reason, trigger, and team routing
5. **Products** — Create, activate/deactivate products
6. **KB Ingestion** — Upload documents (URL, text, PDF, DOCX) to product knowledge bases via n8n
7. **Client Users** — Manage user-product assignments
8. **Workflow Errors** — AI-diagnosed n8n failures with suggested fixes, auto-refreshes every 30s

### Client Portal (`/client`)
- **Chat** — Product-scoped AI chat with confidence %, category badges, escalation warnings
- **Session History** — Past conversations with message previews
- **Feedback** — Thumbs up/down ratings and correction submissions

## Database Tables

`users`, `products`, `tickets`, `escalations`, `audit_logs`, `public_sessions`, `public_messages`, `feedback`, `knowledge_documents`, `workflow_errors`, `workflows`, `product_workflows`

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_N8N_BASE=your_n8n_webhook_url
```

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment (Vercel)

```bash
# Initialize git
git init
git add .
git commit -m "Initial commit"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

On Vercel:
1. Import the GitHub repo
2. Add environment variables in project settings
3. Deploy

**Note:** Set your Supabase project's Site URL to your Vercel domain (Supabase Dashboard → Authentication → URL Configuration).

## Project Structure

```
app/
├── (landing)/page.tsx        # Public landing page + chatbot
├── login/page.tsx             # Auth page
├── (auth)/
│   ├── admin/
│   │   ├── page.tsx           # Admin dashboard (8 views)
│   │   ├── products/          # Product management
│   │   ├── workflows/         # n8n workflow sync
│   │   └── errors/            # Workflow error viewer
│   └── client/page.tsx        # Client portal (chat, history, feedback)
├── api/
│   ├── auth/                  # Signup + admin setup
│   └── products/              # Product CRUD
components/
├── Badge.tsx                  # Reusable badge with domain helpers
└── BgOrbs.tsx                 # Decorative background orbs
context/
├── AuthContext.tsx             # Auth state + profile loading
└── ThemeContext.tsx            # Dark/light theme toggle
lib/
├── supabase.ts                # Supabase client + N8N_BASE
└── types.ts                   # TypeScript interfaces
```

## License

Private — Internal use only.
