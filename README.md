# WhatsApp AI Sales Agent

A 24/7 automated AI Sales Agent using WhatsApp, Gemini AI, and Supabase PostgreSQL.

## Features

- 🤖 **AI-Powered Responses** - Google Gemini AI with zero-hallucination
- 💬 **WhatsApp Integration** - Via WAHA self-hosted
- 💰 **Payment Processing** - Track and approve payments
- 🙋 **Human Handoff** - Seamless transition to human agents
- 📊 **Google Sheets Logging** - Track payments and handoffs
- 🗄️ **Supabase Database** - PostgreSQL cloud database

## Tech Stack

| Component | Technology |
|-----------|------------|
| WhatsApp API | WAHA (Self-Hosted) |
| AI Engine | Google Gemini API |
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| Sheets | Google Sheets API |

## Quick Start

### 1. Setup Supabase

1. Create account at [supabase.com](https://supabase.com)
2. Create new project
3. Go to SQL Editor and run `database/supabase-schema.sql`
4. Get your Project URL and Anon Key from Settings > API

### 2. Install & Configure

```bash
npm install
cp .env.example .env
```

Edit `.env`:
```env
PORT=4000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
GEMINI_API_KEY=your_gemini_key
ADMIN_PHONE=923001234567
WAHA_API_URL=http://localhost:3000
```

### 3. Start Server

```bash
npm start
```

### 4. Configure WAHA Webhook

```bash
curl -X PUT "http://localhost:3000/api/sessions/default" \
  -H "Content-Type: application/json" \
  -d '{"config":{"webhooks":[{"url":"http://localhost:4000/webhook","events":["message"]}]}}'
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /webhook | Receive WAHA messages |
| GET | /health | Health check |
| GET | /stats | System statistics |
| POST | /admin/approve-payment | Approve payment |
| POST | /admin/reject-payment | Reject payment |
| POST | /admin/send-message | Send message |
| POST | /admin/resume-ai | Resume AI |
| GET | /admin/payments/pending | Get pending payments |
| GET | /admin/handoffs/pending | Get pending handoffs |

## Admin Commands (WhatsApp)

| Command | Description |
|---------|-------------|
| `/approve <id>` | Approve payment |
| `/reject <id> <reason>` | Reject payment |
| `/resume_ai <chatId>` | Resume AI |
| `/stats` | View statistics |
| `/help` | Show help |

## Project Structure

```
├── src/
│   ├── index.js
│   ├── config/
│   │   ├── index.js
│   │   └── knowledge-base.json
│   ├── services/
│   │   ├── supabase.service.js
│   │   ├── waha.service.js
│   │   ├── gemini.service.js
│   │   └── sheets.service.js
│   ├── handlers/
│   │   ├── message.handler.js
│   │   ├── payment.handler.js
│   │   └── handoff.handler.js
│   ├── utils/
│   │   ├── intent.classifier.js
│   │   └── prompt.builder.js
│   └── routes/
│       ├── webhook.routes.js
│       └── admin.routes.js
├── database/
│   └── supabase-schema.sql
├── .env.example
├── package.json
└── README.md
```

## License

MIT
