-- CW Federal Benefits — Supabase Schema
-- SEC-compliant document storage with RLS

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Intake sessions table (tracks each client's upload session)
-- ============================================================
CREATE TABLE IF NOT EXISTS intake_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT UNIQUE NOT NULL, -- URL token for client access
  sf_lead_id TEXT, -- Salesforce Lead ID
  sf_contact_id TEXT, -- Salesforce Contact ID
  sf_intake_id TEXT, -- Salesforce Federal_Benefits_Intake__c ID
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  advisor_id TEXT, -- Salesforce User ID of assigned advisor
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'uploaded', 'parsed', 'complete', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  completed_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT
);

-- ============================================================
-- Uploaded documents table
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES intake_sessions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- MIME type
  file_size BIGINT NOT NULL,
  document_type TEXT CHECK (document_type IN ('LES', 'TSP_Statement', 'SF50', 'DD214', 'PSB', 'SS_Statement', 'Other')),
  storage_path TEXT NOT NULL, -- Supabase storage path
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  parsed BOOLEAN DEFAULT FALSE,
  parsed_at TIMESTAMPTZ,
  parse_confidence DECIMAL(5,2),
  parsed_data JSONB -- Extracted fields (encrypted at application layer)
);

-- ============================================================
-- Audit log — every access is tracked for SEC compliance
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES intake_sessions(id),
  document_id UUID REFERENCES documents(id),
  action TEXT NOT NULL, -- 'upload', 'view', 'parse', 'download', 'delete', 'sf_sync'
  actor TEXT NOT NULL, -- 'client', 'advisor:USER_ID', 'system:parser', etc.
  ip_address INET,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security — clients can only access their own data
-- ============================================================

ALTER TABLE intake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Clients access their session via token (passed as JWT claim or query param)
CREATE POLICY "Clients access own session" ON intake_sessions
  FOR SELECT USING (token = current_setting('request.headers')::json->>'x-session-token');

CREATE POLICY "Clients upload to own session" ON documents
  FOR INSERT WITH CHECK (
    session_id IN (
      SELECT id FROM intake_sessions
      WHERE token = current_setting('request.headers')::json->>'x-session-token'
    )
  );

CREATE POLICY "Clients view own documents" ON documents
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM intake_sessions
      WHERE token = current_setting('request.headers')::json->>'x-session-token'
    )
  );

-- Service role (admin) has full access — used by the parsing pipeline
-- (service_role key bypasses RLS by default)

-- ============================================================
-- Storage bucket for encrypted documents
-- ============================================================
-- Run via Supabase dashboard or API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('federal-docs', 'federal-docs', false);

-- Storage RLS policy: clients can only upload to their folder
-- CREATE POLICY "Client upload to own folder" ON storage.objects
--   FOR INSERT WITH CHECK (
--     bucket_id = 'federal-docs' AND
--     (storage.foldername(name))[1] IN (
--       SELECT token FROM intake_sessions
--       WHERE token = current_setting('request.headers')::json->>'x-session-token'
--     )
--   );

-- ============================================================
-- Auto-delete expired documents (SEC retention policy)
-- ============================================================
-- Run as a scheduled function or cron job:
-- DELETE FROM documents WHERE session_id IN (
--   SELECT id FROM intake_sessions WHERE expires_at < NOW() - INTERVAL '30 days'
-- );

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sessions_token ON intake_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_sf_lead ON intake_sessions(sf_lead_id);
CREATE INDEX IF NOT EXISTS idx_documents_session ON documents(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
