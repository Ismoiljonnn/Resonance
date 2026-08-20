# Resonance — Echoes of the Earth

A social voice map. Users leave short voice or text notes pinned to a 3D globe, creating a living, worldwide conversation layered on top of the real world.

This is a learning project. I built it to practice full-stack development (Flask + PostgreSQL + vanilla JS + 3D rendering) by combining a social app, a voice recorder, and an interactive globe into one. I had the idea and started building it right away — driven by curiosity and the desire to see it work.

It is not a polished, maintained product — expect rough edges, and read the code with that in mind.

## What it does

Resonance is a real-time, globe-based social platform where people leave short voice or text notes pinned to their location on Earth. Every post becomes a colored marker on an interactive 3D globe — visitors can spin the planet, hover over markers to preview posts, and click to open full author profiles. Think of it as a living world map of human thoughts.

### Core features

- **Interactive 3D Globe** — a fully navigable Earth rendered in the browser with globe.gl. Posts appear as animated markers positioned at the author's country, with randomized jitter so overlapping posts spread naturally across the map. Country borders are drawn from real GeoJSON data.

- **Voice & Text Posts** — users record a 15-second voice clip directly in the browser (no file upload needed) or type a short text note. Both post types live side by side on the globe. Posts are active on the map for 24 hours, then archived — keeping the map fresh while preserving a permanent profile history.

- **Rich Hover Cards** — on desktop, hovering a marker instantly shows a floating preview with the author's avatar, name, city, post text, and timestamp. No clicks required — the globe rewards exploration.

- **Full Profile Cards** — clicking any marker or avatar opens a detailed profile card showing the user's bio, social links (Telegram, GitHub, Instagram, website), and a scrollable list of their posts. Profiles display both active (24h) and total lifetime post counts.

- **Lazy Authentication** — guests can explore the entire globe, read posts, and browse profiles without signing in. Google OAuth only triggers when the user takes an action (posting, reacting, editing their profile). After login, they return to exactly where they left off — no redirect, no friction.

- **Real-time Reactions** — six emoji reactions (🔥 ❤️ 👏 😂 🤯) on every post. One reaction per user per post; tap again to remove. Reaction counts update instantly.

- **Search & Discovery** — a global search modal lets users find others by name, username, or bio. Search results show user cards with avatars, bios, and locations — click to open the full profile.

- **Social Link Integration** — users add their Telegram, GitHub, Instagram, and website links. These appear as clickable buttons on profile cards. Input automatically strips `@` prefixes and validates URLs, so links are always clean.

- **Admin Dashboard** — a separate admin panel (`/admin`) gated by email allows viewing all users and posts (active + archived), searching by keyword, and deleting content. Stats cards show total users, active posts, and archived posts in real time.

- **Mobile-First Responsive Design** — 9 breakpoints from 320px to 1440px+, with dedicated layouts for touch devices, landscape orientation, and safe-area insets. On mobile, navigation moves to a fixed bottom bar with a floating share button.

- **Shareable Post Links** — every post gets a unique `/post/<id>` URL. On mobile, sharing uses the native Web Share API. On desktop, the link is copied to clipboard. Visitors see the globe with the shared post highlighted.

- **Audio Recording in Browser** — a custom voice recorder using the MediaRecorder API captures 15-second clips. A live waveform visualizer shows recording progress. Audio is uploaded directly to Supabase Storage.

- **24-Hour Post Lifecycle** — posts stay active on the map for exactly 24 hours, then automatically archive. The globe always shows fresh, relevant content. Archived posts remain visible on the author's profile as a permanent record.

### Architecture decisions

- **No frontend framework** — the entire UI is built with vanilla HTML, CSS, and JavaScript. No React, no Vue, no build step. This keeps the project simple, fast to deploy, and easy to understand.
- **Token-based design system** — CSS custom properties (colors, spacing, border-radius, shadows) ensure visual consistency across the entire app. Dark theme is built in from the start.
- **JSONB social links** — storing social links as a PostgreSQL JSONB column allows flexible schema evolution without migrations when new platforms are added.
- **Country centroid placement** — instead of asking users to drop a pin, posts are automatically placed at their country's geographic center with per-post random jitter. This keeps the map readable while maintaining geographic accuracy.

## Tech stack

| Layer | Tech |
|-------|------|
| Backend | Python 3, Flask, SQLAlchemy (PostgreSQL) |
| Frontend | HTML, CSS (custom, token-based), vanilla JS — no build step |
| 3D Globe | globe.gl + three.js (CDN) |
| Country borders | GeoJSON from globe.gl GitHub repo |
| Auth | Flask sessions, Google OAuth via Authlib, Flask-Login |
| Database | PostgreSQL (Supabase) |
| Audio storage | Supabase Storage |
| Deploy | Render.com (Gunicorn) |

There's no frontend build system (no webpack/npm) — the JS/CSS are loaded straight in the browser, which keeps the project simple and easy to deploy.

## Project structure

```
resonance/
├── run.py                  # Entry point: creates app, runs on port 5000
├── app/
│   ├── __init__.py         # Flask app factory, route registration
│   ├── config.py           # Settings from env vars (DATABASE_URL, OAuth keys, etc.)
│   ├── models.py           # User, AudioPost (SQLAlchemy + JSONB)
│   ├── auth.py             # Google OAuth flow, /auth/me endpoint
│   ├── api.py              # REST API: markers, profile, posts, search, reactions, admin
│   ├── templates/
│   │   ├── index.html      # Main SPA shell (globe, modals, topbar, bottom bar)
│   │   └── admin.html      # Admin dashboard (users + posts management)
│   └── static/
│       ├── css/
│       │   ├── style.css   # Design tokens, components, modals
│       │   ├── responsive.css  # 9 breakpoints + touch/landscape/safe-area
│       │   └── admin.css   # Admin page styles
│       ├── js/
│       │   ├── app.js      # Globe, hover cards, profile, search, recorder, auth
│       │   └── countries.js    # Country centroids + jitter for marker placement
│       └── favicon.svg     # Inline SVG globe icon
├── requirements.txt
├── .env.example
├── Procfile                # gunicorn start command
└── render.yaml             # Render.com blueprint (web service + Postgres)
```

## Running it locally

You'll need Python 3 and a PostgreSQL database.

### 1. Set up the database

You can use Supabase (free tier) or a local Postgres. Create a `.env` file:

```bash
cp .env.example .env
```

Fill in the values:

```
SECRET_KEY=any-random-string-for-dev
DATABASE_URL=postgresql://user:pass@localhost:5432/resonance
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
ADMIN_EMAIL=your-email@gmail.com
```

### 2. Install and run

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

flask db init
flask db migrate -m "initial"
flask db upgrade

python run.py                   # opens on http://localhost:5000
```

The database tables are created automatically on first run.

### Google OAuth setup (required)

1. Go to https://console.cloud.google.com → create a project.
2. **APIs & Services → OAuth consent screen** → External → fill in app name and email.
3. **APIs & Services → Credentials → + Create Credentials → OAuth client ID** → Web application.
4. Add `http://localhost:5000` to Authorized JavaScript origins.
5. Add `http://localhost:5000/auth/google/callback` to Authorized redirect URIs.
6. Copy the Client ID and Client Secret into your `.env`.

## Deploying to Render.com

The repo includes a `render.yaml` blueprint. Push to GitHub, then in the Render Dashboard choose **New → Blueprint** and pick the repo. Render will provision a Postgres database and a web service. Fill in the Google OAuth and Supabase Storage variables in the dashboard.

Set `ADMIN_EMAIL` in Render's environment variables to enable the admin panel for your account.

## Why I'm sharing this

I'm open-sourcing this as a comprehensive demonstration of what I can build end-to-end. This project covers the full stack: Flask backend design with SQLAlchemy ORM, session-based authentication with Google OAuth, real-time audio recording in the browser with the MediaRecorder API, 3D globe rendering with globe.gl and three.js, Supabase integration for database and file storage, a responsive design system spanning 9 breakpoints with touch/landscape/safe-area support, and a complete social feature set (profiles, posts, reactions, search, admin) — all built from scratch without any frontend framework. Feel free to look around, fork it, or use pieces of it in your own learning projects. Pull requests and issues are welcome, but I'm not actively maintaining this as a product.

## License

This project is shared as-is for learning purposes. Feel free to use, modify, and learn from the code.
