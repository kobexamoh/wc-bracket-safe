# 2026 World Cup Bracket Predictor - Work Safe Edition ⚽

A **secure, refactored version** of the bracket predictor that:
- ✅ Keeps API credentials out of git
- ✅ Uses environment variables for secrets
- ✅ Sanitizes all user input (prevents XSS)
- ✅ Split into modular files (easier to maintain)
- ✅ Ready for team use at work

---

## 🔒 Security Changes Made

### Problem: Original had hardcoded secrets
```javascript
// ❌ UNSAFE - Original code
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### Solution: Environment variables
```javascript
// ✅ SAFE - This version
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
// Loaded from .env.local (never committed to git)
```

### Other improvements:
- ✅ Input sanitization (no XSS)
- ✅ Email redaction (GDPR compliance)
- ✅ Modular code structure
- ✅ Removed massive email blocklist (~200KB)
- ✅ Removed personal GA tracking

---

## 🚀 Setup Instructions

### 1. Get your Supabase credentials
Go to [supabase.com](https://supabase.com) and create a free project:
- Create account (free tier included)
- Create new project
- Go to **Settings → API**
- Copy `Project URL` and `anon public key`

### 2. Create `.env.local` (never committed)
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**⚠️ WARNING:** `.env.local` is in `.gitignore` — it will NOT be committed. This is intentional.

### 3. Install dependencies
```bash
npm install
```

### 4. Run locally
```bash
npm run dev
```

Opens at `http://localhost:3000`

---

## 📁 Project Structure

```
wc-bracket-safe/
├── src/
│   ├── config/
│   │   └── supabase.js         # Config with env vars (NOT committed)
│   ├── js/
│   │   ├── app.js              # Main app logic
│   │   └── sanitize.js         # Input sanitization utils
│   └── styles/
│       └── styles.css          # Global styles
├── index.html                  # HTML template (no secrets)
├── package.json                # Dependencies
├── vite.config.js              # Build config
├── .env.example                # Template for .env.local
├── .gitignore                  # Secrets protected
└── README.md                   # This file
```

**Key principle:** Anything with secrets goes in `.env.local` → loaded at runtime → never in git history.

---

## 🛡️ Security Checklist

Before sharing/deploying:

- [ ] `.env.local` exists with your Supabase credentials
- [ ] `.env.local` is in `.gitignore` (already is ✅)
- [ ] Run `git status` — `.env.local` should NOT appear
- [ ] Never commit `.env.local` or hardcode secrets
- [ ] All user input is sanitized (see `src/js/sanitize.js`)
- [ ] Supabase RLS policies enabled (server-side security)

---

## 🌐 Deployment (Vercel, DigitalOcean, etc)

### Option 1: Vercel (GitHub Student Pack)
1. Push repo to GitHub (without `.env.local`)
2. Connect to Vercel
3. In Vercel dashboard → **Settings → Environment Variables**
4. Add: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
5. Deploy

### Option 2: DigitalOcean (GitHub Student Pack)
1. Create App Platform
2. Connect your GitHub repo
3. Add environment variables same as above
4. Deploy

Both platforms keep secrets safe (never shown in repo).

---

## 📝 Development Notes

### Adding new features:

1. **Receiving user input?** → Sanitize it
   ```javascript
   import { sanitizeInput } from './sanitize.js';
   const userTeam = sanitizeInput(userInput);
   ```

2. **Need a new env var?**
   - Add to `.env.example`
   - Import in `src/config/supabase.js`
   - Use `import.meta.env.VITE_*`

3. **Rendering dynamic content?**
   ```javascript
   // ❌ UNSAFE
   element.innerHTML = userInput;
   
   // ✅ SAFE
   element.textContent = sanitizeInput(userInput);
   ```

---

## 🤔 FAQ

**Q: Why use `.env.local` instead of `.env`?**
A: `.env.local` is ignored by git but `.env` isn't always. Using `.local` is explicit and safer.

**Q: Can I share this repo with my team?**
A: Yes! The code is safe to share. Just remind them to create their own `.env.local` with their Supabase credentials.

**Q: What if my Supabase key leaks?**
A: Rotate it immediately in Supabase dashboard. Supabase has RLS (Row Level Security) so even leaked keys have limited access.

**Q: Can I use this at work?**
A: Yes, it's designed for it! No hardcoded secrets, sanitized inputs, GDPR-compliant.

---

## 📚 Next Steps

1. **Set up Supabase database** (see Supabase docs)
2. **Build bracket UI** (in `src/js/app.js` → `loadBracket()`)
3. **Add team management** features
4. **Deploy to Vercel/DigitalOcean**

---

## 📞 Questions?

Refer to:
- [Supabase Docs](https://supabase.com/docs)
- [Vite Docs](https://vitejs.dev/)
- [Environment Variables in Vite](https://vitejs.dev/guide/env-and-mode.html)

---

**Credits:** Original bracket app from [2026bracket.vercel.app](https://2026bracket.vercel.app)  
**Refactored for:** Security, modularity, and team use  
**By:** Kobe Amoh
