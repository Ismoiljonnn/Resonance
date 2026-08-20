# Resonance — Ovozli Ijtimoiy Xarita

Anonim ovozli chatdan Ochiq Ovozli Ijtimoiy Xarita (3D globus + Twitter/X + SnapMap hibridi).

## Loyiha tuzilishi
```
resonance/
├── app/
│   ├── __init__.py      # Flask app factory
│   ├── config.py        # Sozlamalar (.env orqali)
│   ├── models.py        # User, AudioPost, Reaction (SQLAlchemy)
│   ├── auth.py          # Google OAuth (Lazy Auth oqimi)
│   ├── api.py           # markers, profile, audio, matn, reaction, share
│   ├── templates/index.html
│   └── static/{css,js}/
├── requirements.txt
├── .env.example
└── run.py
```

---

## QADAM-BAQADAM: Supabase (DB) va Google OAuth ulash

### 1-QADAM — Supabase loyihasini yaratish

1. https://supabase.com/dashboard ga kiring, Google/GitHub bilan ro'yxatdan o'ting.
2. **"New Project"** tugmasini bosing:
   - **Name**: `resonance` (yoki xohlagan nom)
   - **Database Password**: kuchli parol o'ylab toping va **albatta saqlab qo'ying** — keyin kerak bo'ladi
   - **Region**: foydalanuvchilaringizga eng yaqin region (masalan, Frankfurt yoki Singapore — O'zbekistonga yaqinroq)
3. "Create new project" — 1-2 daqiqa kutasiz, baza tayyor bo'ladi.

### 2-QADAM — Connection string (`DATABASE_URL`) olish

1. Chap paneldan **Project Settings (⚙️) → Database** ga o'ting.
2. **"Connection string"** bo'limida **"URI"** tabini tanlang.
3. Ko'rinadigan qatorni nusxalang, masalan:
   ```
   postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```
4. `[YOUR-PASSWORD]` o'rniga 1-qadamda o'ylab topgan parolingizni qo'ying.

> **Muhim**: Flask/Gunicorn odatiy ishlab chiqarishda ko'p vaqt ulanib-uzilib turadi,
> shuning uchun **6543-portli pooler (Transaction mode)** connection stringni ishlating —
> u yuqorida ko'rsatilgan. Agar migratsiya paytida xatolik chiqsa, 5432-portli
> "Direct connection" stringni sinab ko'ring (Session mode).

5. Loyiha papkasida `.env` faylini yarating:
   ```bash
   cp .env.example .env
   ```
6. `.env` faylini oching va `DATABASE_URL`ni joylashtiring:
   ```
   DATABASE_URL=postgresql://postgres.[project-ref]:SIZNING_PAROLINGIZ@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```

### 3-QADAM — Google OAuth Client yaratish

1. https://console.cloud.google.com ga kiring.
2. Yuqoridan yangi loyiha yarating (masalan, "Resonance").
3. Chap menyu: **APIs & Services → OAuth consent screen**
   - User Type: **External** ni tanlang → Create
   - App name: `Resonance`
   - User support email va Developer contact — o'z emailingiz
   - Scopes qadamida hech narsa qo'shmasdan "Save and Continue" bosavering
   - Test users qadamida (agar app "Testing" holatida bo'lsa) o'z emailingizni qo'shing
4. Chap menyu: **APIs & Services → Credentials → + Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `Resonance Web`
   - **Authorized JavaScript origins**:
     ```
     http://localhost:5000
     ```
   - **Authorized redirect URIs**:
     ```
     http://localhost:5000/auth/google/callback
     ```
   - Production'ga chiqarganda shu yerga haqiqiy domeningizni ham qo'shasiz:
     ```
     https://sizning-domeningiz.uz/auth/google/callback
     ```
5. "Create" bosgach chiqqan **Client ID** va **Client Secret**ni nusxalang.
6. `.env` fayliga qo'shing:
   ```
   GOOGLE_CLIENT_ID=123456-abc.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
   ```
7. `.env` faylida `SECRET_KEY`ni ham tasodifiy qiymatga almashtiring:
   ```bash
   python3 -c "import secrets; print(secrets.token_hex(32))"
   ```
   Chiqqan qiymatni `SECRET_KEY=...` ga qo'ying.

### 4-QADAM — Loyihani ishga tushirish

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

export FLASK_APP=run.py         # Windows (PowerShell): $env:FLASK_APP="run.py"
flask db init
flask db migrate -m "initial: users, audio_posts, reactions"
flask db upgrade

python run.py
```

Brauzerda oching: **http://localhost:5000**

"Fikr qoldirish" tugmasini bosing → "Continue with Google" → ruxsat bering →
avtomatik audio yozish oynasiga qaytasiz. Agar shu yerga yetib kelsangiz —
Supabase + Google OAuth to'liq ishlayapti.

### Muammo bo'lsa (tez tekshiruv)

| Xatolik | Sabab / yechim |
|---|---|
| `psycopg2.OperationalError` | `DATABASE_URL` noto'g'ri yoki parol xato — 2-qadamni qayta tekshiring |
| Google login'da `redirect_uri_mismatch` | Google Console'dagi Authorized redirect URI aniq `http://localhost:5000/auth/google/callback` bo'lishi kerak (oxirida `/` bo'lmasin) |
| `Access blocked: this app's request is invalid` | OAuth consent screen "Testing" holatida va sizning emailingiz Test users'ga qo'shilmagan |
| `relation "users" does not exist` | `flask db upgrade` bajarilmagan yoki muvaffaqiyatsiz tugagan |

---

## Funksiyalar

- **Mehmon rejimi**: `/`, `/api/markers`, `/api/profile/<id>`, `/api/post/<id>` — login shart emas
- **Lazy Auth**: faol harakat (fikr qoldirish, reaksiya) bosilgandagina Google login so'raladi,
  keyin foydalanuvchi to'xtagan joyiga avtomatik qaytadi
- **Ovoz yoki matn**: har ikkisi ham bir xil xarita nuqtasi (`post_type` bilan farqlanadi)
- **Reaksiyalar**: 🔥 ❤️ 👏 😂 🤯 — bitta foydalanuvchi bitta postga bitta reaksiya, qayta bossa olib tashlanadi
- **Ulashish**: har bir post `/post/<id>` orqali tashqi joyga ulashiladi
  (mobil qurilmada native Share API, boshqasida havola nusxalanadi)
- **Shaxsiy kabinet**: `DELETE /api/audio/<id>` — faqat muallif o'z postini o'chira oladi

## Keyingi bosqichlar (production uchun tavsiya)

- Audio fayllarni lokal `/static/uploads` o'rniga **Supabase Storage**ga ko'chirish
- Rate limiting (`Flask-Limiter`) — spamdan himoya
- 24 soatlik "aktiv" muddat uchun background job (APScheduler yoki Supabase cron)
- Production'da `gunicorn run:app` bilan ishga tushirish, orqasida Nginx + HTTPS
