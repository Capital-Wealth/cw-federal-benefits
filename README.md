# CW Federal Benefits Platform

Capital Wealth federal employee retirement intake system — secure document upload, AI-powered extraction, Salesforce integration, and report generation pipeline.

## Architecture

```
Federal Employee        This App (Next.js)              Salesforce                  GullStack Report Builder
     |                       |                              |                              |
     |   /portal/{token}     |                              |                              |
     |   Upload LES, SF-50,  |                              |                              |
     |   TSP, DD-214, etc.   |                              |                              |
     |──────────────────────>|                              |                              |
     |                       |  Encrypt & store in          |                              |
     |                       |  Supabase Storage            |                              |
     |                       |                              |                              |
     |                       |  Claude AI parses docs       |                              |
     |                       |  Extracts 130+ fields        |                              |
     |                       |──────────────────────────────>|                              |
     |                       |  Writes to                   |  Federal_Benefits_Intake__c  |
     |                       |  Federal_Benefits_Intake__c  |  Status: "AI Parsed"         |
     |                       |                              |                              |
     |                       |                              |  Advisor reviews & approves  |
     |                       |                              |  Status: "Complete"          |
     |                       |                              |                              |
     |                       |                              |──────────────────────────────>|
     |                       |                              |  OAuth → reads intake record |
     |                       |                              |  Runs 15 calc modules        |
     |                       |                              |  Generates 50-page PDF       |
```

## Repo Structure

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── intake/route.ts       # Create intake session + SF record
│   │   │   ├── upload/route.ts       # Encrypted document upload
│   │   │   ├── parse/route.ts        # AI document parsing + SF update
│   │   │   ├── calculate/route.ts    # FERS/CSRS retirement calculator
│   │   │   └── salesforce/
│   │   │       └── callback/route.ts # OAuth callback for report builder
│   │   └── portal/
│   │       └── [token]/page.tsx      # Client-facing secure upload portal
│   ├── lib/
│   │   ├── parsing/
│   │   │   └── document-parser.ts    # Claude AI document extraction engine
│   │   ├── calculation/
│   │   │   └── fers-engine.ts        # FERS/CSRS pension calculation (OPM formulas)
│   │   ├── salesforce/
│   │   │   └── connector.ts          # SF CRUD for Federal_Benefits_Intake__c
│   │   └── supabase/
│   │       └── client.ts             # Supabase client (encrypted storage)
│   └── types/
│       └── index.ts                  # TypeScript types (mirrors SF schema)
│
├── salesforce/                        # Salesforce metadata (SFDX format)
│   ├── sfdx-project.json
│   └── force-app/main/default/
│       └── objects/
│           └── Federal_Benefits_Intake__c/
│               └── fields/            # 156 custom field definitions
│
├── supabase/
│   └── migrations/
│       └── 001_intake_schema.sql     # Database schema (sessions, docs, audit)
│
├── vision-field-mapping.md           # Complete field mapping for GullStack Report Builder
├── .env.local.example                # Environment variable template
└── package.json
```

## Salesforce Object

**`Federal_Benefits_Intake__c`** — 156 custom fields covering:
- Retirement eligibility (FERS/CSRS/xFERS, SCD, employee category)
- TSP balances and allocations (6 funds x Traditional + Roth)
- FEGLI life insurance (Basic, Options A/B/C, multipliers, reductions)
- FEHB health insurance (plan, enrollment, premium)
- Social Security estimates
- Military service and DD-214
- Survivor benefits
- Deposit/redeposit calculations
- LES deduction analysis
- Tax and expense projections
- AI parsing metadata (confidence, review flags)

See [`vision-field-mapping.md`](./vision-field-mapping.md) for the complete field-by-field mapping used by the GullStack Report Builder.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/intake` | Create intake session, SF record, return portal URL |
| GET | `/api/intake?token=` | Get session status and uploaded documents |
| POST | `/api/upload` | Upload document (auto-triggers AI parsing) |
| POST | `/api/parse` | Parse documents and update SF fields |
| POST | `/api/calculate` | Run retirement projection with scenario comparison |
| GET | `/api/salesforce/callback` | OAuth callback for report builder |

## Document Types Supported

| Type | Key Fields Extracted |
|------|---------------------|
| **LES** | Salary, retirement system, all deductions, sick leave, FEGLI/FEHB premiums |
| **SF-50** | Service computation date, retirement plan, salary, agency, grade/step |
| **TSP Statement** | All fund balances (Traditional + Roth), contributions, allocations |
| **DD-214** | Military service dates |
| **Benefits Statement** | FEGLI elections, FEHB plan, survivor benefit, SS estimate |
| **SS Statement** | Social Security benefit estimates at age 62 |

## Status Pipeline

```
Draft -> Link Sent -> Docs Uploaded -> AI Parsed -> Advisor Review -> Complete
```

## Connected Repos

| Repo | Description |
|------|-------------|
| **This repo** (`cw-federal-benefits`) | Intake portal, AI doc extraction, SF integration, SF metadata |
| [`gullstack-report-builder`](https://github.com/Gull-Stack/gullstack-report-builder) | 15-module calculation engine + 50-page PDF report generator |
| [`cw-federal-report-builder`](https://github.com/Gull-Stack/cw-federal-report-builder) | Deployed report builder (Vercel) |

## Setup

```bash
cp .env.local.example .env.local
# Fill in: Supabase URL/keys, SF credentials
# AI parsing uses Claude CLI (Max plan OAuth) — no API key needed

npm install
npm run dev
```

### Salesforce Metadata Deployment

```bash
cd salesforce
sf project deploy start --source-dir force-app --target-org cw
```
