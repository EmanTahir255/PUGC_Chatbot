-- ============================================================
-- PUGC SmartBot — chat_logs table
-- Run this ONCE in SQL Server Management Studio
-- against your PUGC_ChatbotDB database
-- ============================================================

USE PUGC_ChatbotDB;
GO

-- Create the table only if it does not already exist
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'chat_logs'
)
BEGIN
    CREATE TABLE chat_logs (
        log_id          INT IDENTITY(1,1) PRIMARY KEY,
        question_text   NVARCHAR(1000)  NOT NULL,
        detected_intent NVARCHAR(200)   NULL,
        was_answered    BIT             NOT NULL DEFAULT 0,
        answer_source   NVARCHAR(100)   NULL,   -- e.g. rasa_db, groq_general, fallback
        created_at      DATETIME        NOT NULL DEFAULT GETDATE()
    );

    PRINT 'chat_logs table created successfully.';
END
ELSE
BEGIN
    PRINT 'chat_logs table already exists — skipped.';
END
GO

-- Index for fast date-range queries (used by report endpoint)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_chat_logs_created_at'
      AND object_id = OBJECT_ID('chat_logs')
)
BEGIN
    CREATE INDEX IX_chat_logs_created_at ON chat_logs (created_at);
    PRINT 'Index IX_chat_logs_created_at created.';
END
GO

-- Index for unanswered-question queries
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_chat_logs_was_answered'
      AND object_id = OBJECT_ID('chat_logs')
)
BEGIN
    CREATE INDEX IX_chat_logs_was_answered ON chat_logs (was_answered, created_at);
    PRINT 'Index IX_chat_logs_was_answered created.';
END
GO

-- ============================================================
-- Optional: seed a few demo rows so the report is not empty
-- on first run. Remove this block in production.
-- ============================================================
INSERT INTO chat_logs (question_text, detected_intent, was_answered, answer_source, created_at)
VALUES
('What is the fee for BS Computer Science?',    'ask_cs_fee',             1, 'rasa_dynamic',  DATEADD(day, -1,  GETDATE())),
('What is the hostel fee?',                     'ask_hostel_fee',         1, 'rasa_dynamic',  DATEADD(day, -1,  GETDATE())),
('Is there a scholarship for BS students?',     'ask_scholarship',        1, 'rasa_db',       DATEADD(day, -2,  GETDATE())),
('What are the admission requirements?',        'ask_admission_requirements', 1, 'rasa_db',   DATEADD(day, -2,  GETDATE())),
('What is the fee for BS IT evening?',          NULL,                     0, 'fallback',      DATEADD(day, -1,  GETDATE())),
('What is the fee for BS IT evening?',          NULL,                     0, 'fallback',      DATEADD(day, -2,  GETDATE())),
('What is the fee for BS IT evening?',          NULL,                     0, 'fallback',      DATEADD(day, -3,  GETDATE())),
('What is the fee for BS IT evening?',          NULL,                     0, 'fallback',      DATEADD(day, -4,  GETDATE())),
('Admission deadline 2026',                     NULL,                     0, 'fallback',      DATEADD(day, -1,  GETDATE())),
('Admission deadline 2026',                     NULL,                     0, 'fallback',      DATEADD(day, -2,  GETDATE())),
('Admission deadline 2026',                     NULL,                     0, 'fallback',      DATEADD(day, -3,  GETDATE())),
('Is hostel available for male students?',      NULL,                     0, 'fallback',      DATEADD(day, -1,  GETDATE())),
('Is hostel available for male students?',      NULL,                     0, 'fallback',      DATEADD(day, -3,  GETDATE())),
('What time does the bus leave for Gujranwala?',NULL,                     0, 'fallback',      DATEADD(day, -2,  GETDATE())),
('How do I get my degree certificate?',         'ask_degree_certificate', 1, 'rasa_db',       DATEADD(day, -3,  GETDATE())),
('What is the tuition fee for BBA?',            'ask_bba_fee',            1, 'rasa_dynamic',  DATEADD(day, -4,  GETDATE())),
('When does the fall semester start?',          'ask_fall_semester_dates',1, 'rasa_db',       DATEADD(day, -4,  GETDATE())),
('List all departments at PUGC',                'ask_department_list',    1, 'rasa_dynamic',  DATEADD(day, -5,  GETDATE())),
('Can I pay fee in installments?',              NULL,                     0, 'fallback',      DATEADD(day, -5,  GETDATE())),
('What is the CGPA required for distinction?',  NULL,                     0, 'fallback',      DATEADD(day, -6,  GETDATE()));
GO

PRINT 'Demo seed data inserted into chat_logs.';
GO
