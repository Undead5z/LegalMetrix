PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('MASTER_ADMIN', 'ADMIN', 'FIELD_OFFICER')),
  account_status TEXT NOT NULL CHECK (account_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED')) DEFAULT 'PENDING_APPROVAL',
  employee_id TEXT UNIQUE,
  phone TEXT,
  department TEXT,
  designation TEXT,
  jurisdiction TEXT,
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  rejected_by TEXT REFERENCES users(id),
  rejected_at TEXT,
  reviewer_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  target_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('USER_REGISTERED', 'USER_DETAILS_UPDATED', 'USER_APPROVED', 'USER_REJECTED', 'USER_SUSPENDED', 'USER_REACTIVATED', 'LOGIN_SUCCESS', 'LOGIN_DENIED_PENDING_APPROVAL', 'LOGIN_DENIED_ROLE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_user_id, created_at);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  generic_name TEXT,
  brand_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY,
  inspection_number TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL REFERENCES products(id),
  officer_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL CHECK (state IN ('DRAFT', 'PROCESSING', 'PENDING_REVIEW', 'VERIFIED', 'REPORT_GENERATED')) DEFAULT 'DRAFT',
  location TEXT,
  notes TEXT,
  ai_extraction_json TEXT,
  ai_diagnostics_json TEXT,
  vision_extraction_json TEXT,
  vision_diagnostics_json TEXT,
  vision_cache_key TEXT,
  vision_completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inspection_images (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  image_type TEXT NOT NULL CHECK (image_type IN ('FRONT', 'BACK', 'ADDITIONAL')),
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  quality_state TEXT NOT NULL DEFAULT 'NOT_ASSESSED' CHECK (quality_state IN ('NOT_ASSESSED', 'ACCEPTABLE', 'REVIEW_REQUIRED')),
  quality_reason TEXT,
  ocr_text TEXT,
  ocr_confidence REAL,
  ocr_status TEXT,
  ocr_error TEXT,
  normalized_ocr_text TEXT,
  ocr_storage_path TEXT,
  preprocessing_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS declarations (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  value TEXT,
  detection_state TEXT NOT NULL CHECK (detection_state IN ('DETECTED', 'NOT_DETECTED', 'NOT_IMPLEMENTED')) DEFAULT 'NOT_IMPLEMENTED',
  confidence REAL,
  source_image_id TEXT REFERENCES inspection_images(id),
  bounding_box_json TEXT,
  extraction_method TEXT NOT NULL DEFAULT 'NOT_IMPLEMENTED',
  extraction_state TEXT NOT NULL DEFAULT 'NOT_DETECTED',
  ocr_evidence TEXT,
  extraction_source TEXT NOT NULL DEFAULT 'DETERMINISTIC',
  visual_evidence_description TEXT,
  ocr_candidate_json TEXT,
  vision_candidate_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE,
  name TEXT,
  declaration_field TEXT NOT NULL,
  requirement TEXT NOT NULL,
  applicability TEXT NOT NULL,
  legal_reference TEXT NOT NULL DEFAULT 'LEGAL_REFERENCE_PENDING_VERIFICATION',
  version TEXT NOT NULL,
  effective_date TEXT,
  effective_to TEXT,
  validation_type TEXT,
  validation_logic TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'DRAFT')) DEFAULT 'DRAFT',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  rule_id TEXT REFERENCES rules(id),
  declaration_id TEXT REFERENCES declarations(id),
  status TEXT NOT NULL CHECK (status IN ('PASS', 'POTENTIAL_NON_COMPLIANCE', 'REVIEW_REQUIRED', 'NOT_APPLICABLE')),
  message TEXT NOT NULL,
  evidence_json TEXT,
  confidence REAL,
  officer_decision TEXT CHECK (officer_decision IN ('CONFIRMED', 'REJECTED')),
  officer_comment TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  report_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('NOT_IMPLEMENTED', 'GENERATED', 'FAILED')) DEFAULT 'NOT_IMPLEMENTED',
  storage_path TEXT,
  generated_by TEXT REFERENCES users(id),
  generated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inspections_officer ON inspections(officer_id);
CREATE INDEX IF NOT EXISTS idx_inspections_state ON inspections(state);
CREATE INDEX IF NOT EXISTS idx_images_inspection ON inspection_images(inspection_id);
CREATE INDEX IF NOT EXISTS idx_declarations_inspection ON declarations(inspection_id);
CREATE INDEX IF NOT EXISTS idx_findings_inspection ON findings(inspection_id);
