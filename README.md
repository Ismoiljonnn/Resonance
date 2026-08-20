# Resonance — Echoes of the Earth

A social voice map. Users leave short voice or text notes pinned to a 3D globe, creating a living, worldwide conversation layered on top of the real world.

This is a learning project. I built it to practice full-stack development (Flask + PostgreSQL + vanilla JS + 3D rendering) by combining a social app, a voice recorder, and an interactive globe into one. The idea came to me and I just started building it — no planning, no waiting, just code.

It is not a polished, maintained product — expect rough edges, and read the code with that in mind.

## What it does

- **3D Globe** — posts are rendered as colored markers on an interactive globe (globe.gl), placed at the user's country with per-post jitter so overlapping posts spread out.
- **Voice & Text posts** — record a 15-second voice clip or write a short text note, both pinned to the same map. Posts expire from the map after 24 hours but remain in the user's profile.
- **Hover cards** — hover a marker on desktop to see the author's avatar, name, city, post text, and date.
- **Profile cards** — click a marker or avatar to open a full profile card showing bio, social links, active and total post counts, and a scrollable post list.
- **Lazy Auth** — guests can browse the globe freely. Signing in with Google only happens when the user takes an action (post, react, edit profile), and they return exactly where they left off.
- **Reactions** — 🔥 ❤️ 👏 😂 🤯 on each post. One reaction per user per post; tap again to remove.
- **Share links** — every post has a `/post/<id>` URL for sharing. On mobile it uses the native Share API, on desktop it copies the link.
- **Search** — find users by name, username, or bio via a search modal.
- **Social links** — Telegram, GitHub, Instagram, website/portfolio, displayed on profile cards.
- **Admin panel** — view all users and posts (active + archived), search by keyword, delete users or posts. Access gated by `ADMIN_EMAIL` env variable.

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

I'm open-sourcing this mainly as a record of what I learned: Flask backend design with SQLAlchemy, session-based auth with Google OAuth, 3D globe rendering with globe.gl, real-time audio recording in the browser, Supabase integration for database and file storage, responsive design across 9 breakpoints, and building a full social feature set (profiles, posts, reactions, search, admin) from scratch. Feel free to look around, fork it, or use pieces of it in your own learning projects. Pull requests and issues are welcome, but I'm not actively maintaining this as a product.

## License

This project is shared as-is for learning purposes. Feel free to use, modify, and learn from the code.
