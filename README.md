# Deka Electronics — Store Manager

A brand-first inventory, billing, and reporting app for the shop, backed by a
real cloud database (Supabase) so it can be opened from any phone, tablet, or
computer — by you and your staff — with a proper login.

This README walks through getting it fully live: database → staff logins →
hosting → custom domain. None of this needs to be done by a developer; it's
all clicking through free dashboards plus a couple of copy-paste steps.

---

## 1. Create your database (Supabase) — free

1. Go to supabase.com and sign up, then **New Project**.
   - Pick any project name (e.g. "deka-electronics") and a strong database password — save that password somewhere safe.
   - Pick a region close to you (e.g. Mumbai/Singapore for India).
2. Once the project finishes setting up, open **SQL Editor** (left sidebar) → **New query**.
3. Open `supabase_schema.sql` from this folder, copy all of it, paste it into the SQL editor, and click **Run**.
   - This creates the `products`, `sales`, `stock_log` tables, turns on security so only logged-in staff can touch the data, and sets up safe invoice numbering.
4. Go to **Database → Replication** (the exact label may differ slightly depending on your Supabase version — search "Realtime" in the dashboard if you don't see it) and turn on Realtime for `products`, `sales`, and `stock_log`. This makes changes show up live on other staff's screens without needing to refresh. (Optional — the app still works fine without it, staff just need to switch tabs to see others' updates.)
5. Go to **Settings → API**. You'll need two values from this page in step 3 below:
   - **Project URL**
   - **anon public** key

---

## 2. Create staff logins

Go to **Authentication → Users → Add user** (in the Supabase dashboard) and create one account per staff member with their email + a password you set for them. That's it — there's no public sign-up page in the app, so only people you've explicitly added here can ever log in.

To make sure no one else can self-register, go to **Authentication → Providers → Email** and make sure "Allow new users to sign up" is turned off (the app never calls sign-up anyway, but this closes that door at the database level too).

You (the owner) should add yourself as a user here too.

---

## 3. Run it locally first (optional, recommended once)

1. Install [Node.js](https://nodejs.org) if you don't have it.
2. In this folder, run:
   ```
   npm install
   cp .env.example .env
   ```
3. Open `.env` and paste in your Project URL and anon key from step 1.5 above.
4. Run:
   ```
   npm run dev
   ```
5. Open the link it prints (usually `http://localhost:5173`) and log in with a staff account you created in step 2. Confirm everything works before deploying.

---

## 4. Put the code on GitHub

1. Create a free GitHub account if needed, and a new (private is fine) repository.
2. From this project folder:
   ```
   git init
   git add .
   git commit -m "Deka Electronics store manager"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
   (`.env` is already excluded via `.gitignore`, so your keys won't be uploaded — you'll set them again in Vercel directly.)

---

## 5. Deploy on Vercel — free, gives you a real link

1. Go to vercel.com, sign up (you can sign in with your GitHub account directly), and click **Add New → Project**.
2. Import the GitHub repo you just pushed.
3. Vercel should auto-detect **Vite** as the framework. Leave the build settings as default.
4. Before deploying, expand **Environment Variables** and add:
   - `VITE_SUPABASE_URL` → your Project URL
   - `VITE_SUPABASE_ANON_KEY` → your anon public key
5. Click **Deploy**. In about a minute you'll get a live link like `deka-electronics.vercel.app` — that link already works from any device, anywhere, with your staff logins.

---

## 6. Add your own custom domain

1. Buy a domain if you don't have one (any registrar — GoDaddy, Namecheap, etc.) — e.g. `dekaelectronics.com` or `dekaelectronics.in`.
2. In Vercel: open your project → **Settings → Domains** → add your domain.
3. Vercel will show you a DNS record (usually an `A` record or `CNAME`) to add.
4. Go to your domain registrar's DNS settings and add that record exactly as shown.
5. Wait a few minutes to a few hours for DNS to update — Vercel will show a green checkmark once it's live, and will automatically issue a free HTTPS certificate.

Now the app is reachable at your own domain, from anywhere, by any staff member you've added — with all data safely stored in Supabase instead of on any one device.

---

## Day-to-day after this

- **Adding/removing staff**: Supabase dashboard → Authentication → Users.
- **Backups**: the app has a "Download a backup" / "Restore a backup" link in the footer, exporting/importing a JSON snapshot of everything — handy as an extra safety net, on top of Supabase's own automatic backups.
- **Code changes**: if you ever want a feature changed, just bring the updated file back here, push to GitHub, and Vercel redeploys automatically within a minute.

If you hit an error at any step, copy the exact error message and bring it back — happy to help debug it.
