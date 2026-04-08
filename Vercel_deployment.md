# 🚀 DEPLOY BANK STATEMENT CONVERTER ON VERCEL — Complete Guide

## OVERVIEW

**What you're doing:**
1. Use existing frontend from GitHub: https://github.com/gauravbodar/secureconverter
2. Generate backend using Claude Code (serverless functions)
3. Deploy ENTIRE project to Vercel (frontend + backend + database)
4. Transfer domain from Hostinger to Vercel
5. Go live at: https://securestatementconverter.com

**Timeline:** 30 minutes setup + 15 minutes domain transfer = **45 minutes total**

---

## PART 1: GENERATE BACKEND WITH CLAUDE CODE (15 min)

### Step 1: Open Claude Code

1. Go to **Claude Code** (not regular Claude)
2. Click **"Open Project"** or **"Import from GitHub"**
3. Paste: `https://github.com/gauravbodar/secureconverter`
4. Wait for Claude Code to clone and load the project

### Step 2: Paste the Backend Prompt

1. Download **VERCEL_BACKEND_PROMPT.md** (provided below)
2. Copy all the content
3. In Claude Code chat, paste the entire prompt
4. Claude will analyze the project and ask clarifying questions
5. Say: **"Generate the backend now"**
6. Claude Code will create `/api` folder with all serverless functions

### Step 3: Review Generated Files

Claude Code will create:
```
api/
├── mailerlite-signup.js
├── auth/register.js
├── auth/login.js
├── auth/verify-token.js
├── conversion/upload.js
├── conversion/convert.js
├── user/profile.js
├── user/usage.js
├── payment/create-checkout.js
├── payment/webhook.js
├── health.js
└── lib/ + utils/ (helper files)
```

**Review and accept all changes.**

---

## PART 2: SET UP SERVICES (10 min)

### Step 1: Create Supabase Database (5 min)

1. Go to **supabase.com**
2. Click **"Start Your Project"**
3. Sign up with GitHub
4. Create new project:
   - Project name: `bank-statement-converter`
   - Region: Sydney (or closest to Australia)
   - Password: Generate strong password
5. Wait for project creation (2 min)
6. Go to **Settings** → **API**
7. Copy:
   - `Project URL` (SUPABASE_URL)
   - `Anon Key` (SUPABASE_KEY)
   - `Service Role Secret` (SUPABASE_SECRET)
8. Save these safely

### Step 2: Set Up Stripe Account (3 min)

1. Go to **stripe.com**
2. Click **"Start Now"**
3. Create account
4. Go to **Developers** → **API Keys**
5. Copy both:
   - Publishable Key (pk_...) → STRIPE_PUBLIC_KEY
   - Secret Key (sk_...) → STRIPE_SECRET_KEY
6. Create a **Webhook Endpoint**:
   - Go to **Webhooks**
   - Add endpoint: `https://yourdomain.vercel.app/api/payment/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.deleted`
   - Copy signing secret → STRIPE_WEBHOOK_SECRET
7. Save these

### Step 3: MailerLite Credentials (Already Have)

You already have:
- `MAILERLITE_API_KEY`
- `MAILERLITE_GROUP_ID`

(From earlier setup)

### Step 4: Generate JWT Secret

In terminal, run:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy output → `JWT_SECRET`

---

## PART 3: DEPLOY TO VERCEL (10 min)

### Step 1: Push Code to GitHub

In your project terminal:
```bash
git add .
git commit -m "Add backend serverless functions"
git push origin main
```

### Step 2: Connect GitHub to Vercel

1. Go to **vercel.com**
2. Click **"New Project"**
3. Click **"Import Git Repository"**
4. Search: `secureconverter`
5. Select **gauravbodar/secureconverter**
6. Click **"Import"**

### Step 3: Configure Environment Variables

In Vercel project settings:
1. Go to **Settings** → **Environment Variables**
2. Add each variable:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key
SUPABASE_SECRET=your_service_role_key
MAILERLITE_API_KEY=mlsn_your_key
MAILERLITE_GROUP_ID=your_group_id
JWT_SECRET=your_generated_secret
STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_API_URL=https://securestatementconverter.com
NODE_ENV=production
```

3. Click **"Save"**

### Step 4: Deploy

1. Click **"Deploy"**
2. Vercel automatically builds and deploys
3. Wait for deployment to complete (2-3 min)
4. You'll get a Vercel URL: `https://your-project.vercel.app`

---

## PART 4: TRANSFER DOMAIN FROM HOSTINGER (15 min)

### Step 1: Get Nameservers from Vercel

1. In Vercel project: **Settings** → **Domains**
2. Click **"Add Domain"**
3. Enter: `securestatementconverter.com`
4. Vercel shows you **nameservers** to use:
   - `ns1.vercel-dns.com`
   - `ns2.vercel-dns.com`
   - `ns3.vercel-dns.com`
   - `ns4.vercel-dns.com`

(Copy these exactly)

### Step 2: Update Nameservers in Hostinger

1. Log into **Hostinger** dashboard
2. Go to **Domains** → **securestatementconverter.com**
3. Click **"Manage"** or **"Edit"**
4. Look for **Nameservers**
5. Replace with Vercel nameservers:
   - ns1.vercel-dns.com
   - ns2.vercel-dns.com
   - ns3.vercel-dns.com
   - ns4.vercel-dns.com
6. Click **"Save"** or **"Update"**

### Step 3: Verify Domain in Vercel

1. Back in Vercel: **Settings** → **Domains**
2. Vercel checks nameserver status
3. Status changes from "pending" to ✅ "connected"
4. This takes 5-15 minutes (sometimes faster)

### Step 4: Test Your Domain

1. Wait 5-10 min for DNS propagation
2. Go to: `https://securestatementconverter.com`
3. Should show your website ✅
4. Test waitlist: `https://securestatementconverter.com/waitlist`

---

## PART 5: SET UP DATABASE TABLES (Supabase)

Claude Code will have generated SQL files. You need to run them:

1. In **Supabase** project → **SQL Editor**
2. Click **"New Query"**
3. Paste the migration SQL (Claude Code provided it)
4. Click **"Run"**
5. Creates `users` and `conversions` tables

---

## PART 6: CONFIGURE STRIPE WEBHOOK (5 min)

1. In Vercel: Copy your domain URL
2. In **Stripe** → **Webhooks**
3. Update webhook endpoint:
   - Old: `https://your-project.vercel.app/api/payment/webhook`
   - New: `https://securestatementconverter.com/api/payment/webhook`
4. Copy new signing secret
5. Update in Vercel env var: `STRIPE_WEBHOOK_SECRET`

---

## ✅ FINAL CHECKLIST

**Before you start:**
- [ ] Have GitHub account (existing frontend repo)
- [ ] Have Supabase account (free tier)
- [ ] Have Stripe account (free tier)
- [ ] Have MailerLite account (free tier)
- [ ] Have Vercel account (free tier)
- [ ] Have Hostinger domain access

**During setup:**
- [ ] Backend generated by Claude Code
- [ ] Push code to GitHub
- [ ] Create Supabase project + copy credentials
- [ ] Create Stripe account + copy keys
- [ ] Generate JWT secret
- [ ] Deploy to Vercel + add env vars
- [ ] Transfer domain nameservers
- [ ] Verify domain in Vercel (wait 5-15 min)
- [ ] Set up database tables (SQL in Supabase)
- [ ] Update Stripe webhook URL

**After deployment:**
- [ ] Test at: https://securestatementconverter.com ✅
- [ ] Test waitlist: /waitlist ✅
- [ ] Check API health: `/api/health` ✅
- [ ] Verify MailerLite signups ✅
- [ ] Test Stripe integration (use test mode first) ✅

---

## 🎯 EXACT STEPS TO FOLLOW NOW

1. **Download VERCEL_BACKEND_PROMPT.md** (next section)
2. **Open Claude Code** with your GitHub repo
3. **Paste the prompt** and generate backend
4. **Accept all changes** Claude Code creates
5. **Push to GitHub:** `git push`
6. **Create Supabase** account (2 min)
7. **Create Stripe** account (2 min)
8. **Create Vercel** project from GitHub (3 min)
9. **Add env vars** to Vercel (3 min)
10. **Click Deploy** (2 min)
11. **Transfer domain** nameservers in Hostinger (3 min)
12. **Wait 5-15 min** for DNS propagation
13. **Test** at your domain ✅

---

## 💡 WHY THIS APPROACH IS BETTER

✅ **One platform:** Vercel handles frontend + backend  
✅ **One domain:** No subdomain complexity  
✅ **One deployment:** Git push = auto-deploy  
✅ **Free tier:** Covers your needs (starting out)  
✅ **Scalable:** Pay as you grow  
✅ **No DevOps:** Vercel handles infrastructure  
✅ **Fast:** Vercel has global CDN  

---

## ❓ IF YOU GET STUCK

**Issue:** Domain shows "This page isn't available yet"
- **Fix:** Wait 5-15 min for DNS propagation
- Check in **Vercel dashboard** that domain is connected

**Issue:** "Cannot find module" error
- **Fix:** Make sure all env vars are set in Vercel
- Redeploy: Click **Deployments** → **Redeploy**

**Issue:** API returns 404
- **Fix:** Verify `/api` folder structure is correct
- Check function names match (e.g., `mailerlite-signup.js`)

**Issue:** MailerLite signups not appearing
- **Fix:** Verify env vars are correct: `MAILERLITE_API_KEY`, `MAILERLITE_GROUP_ID`
- Check MailerLite account has active audience

---

## 🚀 YOU'RE READY!

All files are ready. Let's do this:

1. Download the Claude Code prompt below
2. Open Claude Code
3. Paste the prompt
4. Follow the 6-part deployment guide above
5. You'll be live in **45 minutes**

---

