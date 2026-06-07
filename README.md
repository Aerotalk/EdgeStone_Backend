# EdgeStone Ticketing System (Backend)

This is the backend service for the EdgeStone Ticketing System, built with Node.js, Express, and Prisma ORM.

## Key Features
- **Ticket Management:** Core CRUD and processing logic for support tickets.
- **SLA Computation Engine:** Dynamically tracks system downtime against customizable Service Level Agreements (SLAs). Evaluates exact thresholds to automatically calculate vendor penalties or customer service credits.
- **Email & Outlook Integration:** Syncs with Microsoft Graph API to automatically ingest incoming tickets and handle email thread parsing.
- **AI Processing:** Integrates with Gemini AI to auto-summarize tickets, suggest automated agent responses, and classify ticket priorities.

## Development Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Environment Setup:**
   Copy `.env.example` to `.env` and fill in the required keys:
   - Database credentials (PostgreSQL)
   - Microsoft Graph API credentials
   - Google Gemini AI API key

3. **Database Migration & Seeding:**
   ```bash
   npx prisma generate
   npx prisma db push
   # Optional: run seed scripts if provided in package.json
   ```

4. **Start Development Server:**
   ```bash
   npm run dev
   ```

5. **Production Build/Start:**
   ```bash
   npm start
   ```

## Architecture Notes
- **Prisma ORM:** Used for type-safe database access and schema management.
- **Controllers & Services:** Clear separation of concerns—HTTP routes invoke controllers, which delegate core business logic to dedicated services (e.g., `ticketService.js`, `slaService.js`, `aiService.js`).
- **Cron Jobs:** Background tasks handle automated tasks like periodic SLA status updates or email ingestion sweeps.
