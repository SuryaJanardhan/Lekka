# Lekka: Smart Automated Ledger and Expense Tracker

Most people track expenses by typing each payment into an app by hand. Lekka automates the whole thing by connecting directly to your transactional emails, reading invoice receipts, categorizing spend with local rules and Groq AI, and keeping a clean financial ledger right on your phone.

```mermaid
graph LR
    A["Gmail Ingestion"] -->|"Daily midnight cron or Settings manual run"| B["Backend Parser & OCR"]
    B -->|"Auto Tag"| C["Groq AI & Rule Engine"]
    C -->|"Store"| D["MongoDB Ledger"]
    D <-->|"REST API"| E["Mobile Android App"]
    E -->|"Ask Questions"| F["Lekka AI Financial Assistant"]
```

---

## What Lekka Does

* **Automated Email Ingestion**: Reads selected receipt, bank, investment, and policy emails from Gmail on the backend schedule. Manual ingestion exists only in Settings because it can pull new inbox data.
* **Smart Parsing & OCR**: Extracts merchant names, billed amounts, dates, and payment modes from raw HTML and receipt attachments using Tesseract OCR.
* **Hybrid Category Classifier**: Matches receipts against custom keyword rules first. If no rule matches, it asks Groq AI to classify the merchant with low latency.
* **Cash & Manual Expense Tracking**: Log physical cash payments, friend splits, and UPI spends in two taps so your offline cash flow stays in sync with your digital receipts.
* **Built-in Groq AI Assistant**: Chat with an in-app AI that has read-only access to your real database. Ask questions like "How much did I spend on food this month?" or "Find all Swiggy orders" and get immediate answers with live numbers.
* **Rule Builder & Feedback Loop**: Create custom classification rules on the fly or type new custom categories. If you change a category on any receipt, Lekka can auto-train a new rule so future emails get categorized automatically.
* **Hardware Biometrics & Security**: Lock your ledger with a 4-digit PIN code and native Android fingerprint sensors.
* **Android Push Notifications**: Get push alerts for sync completions, pending approvals, and daily financial summaries.
* **LLM Context Exporter**: Export your entire ledger, receipts, and rules into a clean structured JSON file ready to feed into any large language model.

---

## Tech Stack

| Layer | Tools | What it handles |
| :--- | :--- | :--- |
| Mobile App | React, Vite, Capacitor 6, TypeScript | Android APK and web client |
| Mobile Security | Hardware Biometrics, LocalNotifications | Fingerprint sensor prompt and native push alerts |
| Backend Server | Node.js, Express, TypeScript | REST APIs, ingestion pipeline, cron jobs |
| Database | MongoDB | Stores emails, categories, rules, and notifications |
| AI Intelligence | Groq API (`qwen/qwen3.8-27b`) | Merchant classification and chat assistant tool calling |
| OCR Engine | Tesseract.js | Extracts text and totals from image receipts |

---

## Project Structure

```
Lekka/
├── app/                  # Mobile frontend (React + Vite + Capacitor 6)
│   ├── android/          # Native Android project files
│   ├── public/           # Service worker and web manifest
│   ├── src/              # App components, screens, design system
│   └── capacitor.config.json
├── backend/              # Node.js backend
│   ├── src/controllers/  # API routes for emails, rules, chat, analytics
│   ├── src/models/       # Mongoose data schemas
│   ├── src/services/     # Groq AI, Gmail IMAP, OCR, Rule engine
│   └── src/server.ts     # Express server entry point
├── docker-compose.yml    # MongoDB container configuration
└── README.md
```

---

## Quick Start

### 1. Start Local MongoDB
If you have Docker installed, spin up MongoDB with one command:
```bash
docker compose up -d mongodb
```
MongoDB will start listening on port 27017.

### 2. Configure Backend Environment
Edit `backend/.env` with your credentials:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/lekka_db
GROQ_API_KEY=your_groq_api_key_here
GROQ_API_KEY_1=optional_backup_groq_key
GROQ_API_KEY_2=optional_backup_groq_key

# API security secret used by the app and smoke tests
LEKKA_API_SECRET=your_secure_api_secret_here

# Gmail App Password for receipt fetching
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_app_password_here
TARGET_SENDER_EMAILS=target_merchants@example.com

# Cron schedule for backend ingestion
INGESTION_CRON_SCHEDULE=0 0 * * *
```

Current production sender allowlist:
```text
axismf@kfintech.com
noreply@groww.in
noreply@phonepe.com
alerts@axis.bank.in
no-reply@razorpay.com
nse-direct@nse.co.in
policynoreply@service.uiic.co.in
samf@kfintech.com
enq_k@camsonline.com
```

### 3. Run Backend Server
```bash
cd backend
npm install
npm run dev
```
The backend API will run on `http://localhost:5000`.

### 4. Run Mobile App
```bash
cd app
npm install
npm run dev
```
The app will run locally on `http://localhost:5173`.

---

## Production Flow

### Backend

The production backend is deployed on Vercel:
```text
https://lekka-suryas-projects-f3f7a1b9.vercel.app
```

Required Vercel env vars:
```env
MONGODB_URI=...
GROQ_API_KEY_1=...
GROQ_API_KEY_2=...
LEKKA_API_SECRET=...
GMAIL_USER=...
GMAIL_APP_PASSWORD=...
TARGET_SENDER_EMAILS=...
INGESTION_CRON_SCHEDULE=0 0 * * *
GMAIL_IMAP_SCAN_LIMIT=300
GMAIL_INGEST_LIMIT=50
PORT=5000
```

Do not commit real secrets. Keep them in `backend/.env` locally and Vercel environment variables in production.

### Ingestion

Lekka only ingests email from the configured `TARGET_SENDER_EMAILS` allowlist. IMAP ingestion scans lightweight message headers first, filters to the selected senders, then downloads full message bodies only for matching candidates. `GMAIL_IMAP_SCAN_LIMIT` bounds the recent inbox window and `GMAIL_INGEST_LIMIT` bounds full message processing per run so Vercel does not time out on a large inbox.

Emails that do not contain an amount are stored as notifications/review signals instead of expenses.

Automatic ingestion runs from the backend cron schedule. Manual ingestion is available in the app under Settings as `Manual Gmail ingestion`; it is intentionally not placed on Home because it can pull inbox data.

### Mobile App

The Android app uses the production backend from `app/eas.json`:
```env
VITE_BACKEND_URL=https://lekka-suryas-projects-f3f7a1b9.vercel.app
VITE_LEKKA_API_SECRET=...
```

Capacitor Android uses the WebView origin `https://localhost`, so backend CORS must allow:
```text
https://localhost
capacitor://localhost
```

### Verification

Before building an APK, run:
```bash
cd backend
npm run build

cd ../app
npm run test:prod-config
npm run test:native-features
npm run build
```

`test:prod-config` checks production backend compatibility, API auth, AI chat, and Android WebView CORS.

---

## Building Android APK with EAS

To generate a standalone Android APK:

1. Sync web bundle to Android:
```bash
cd app
npm run build
npx cap sync android
```

2. Trigger cloud APK build:
```bash
npx eas-cli build -p android --profile preview
```
Download the generated `.apk` file directly to your phone.
