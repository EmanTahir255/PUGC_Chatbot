-- ============================================================
-- PUGC SmartBot — feedback table
-- Run this ONCE in SQL Server Management Studio
-- against your PUGC_ChatbotDB database
-- ============================================================

USE PUGC_ChatbotDB;
GO

-- Create the table only if it does not already exist
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'feedback'
)
BEGIN
    CREATE TABLE feedback (
        feedback_id     INT IDENTITY(1,1) PRIMARY KEY,
        user_id         INT NULL,               -- Link to users table if logged in
        user_email      NVARCHAR(255) NULL,    -- Captured for reference
        rating          INT NOT NULL,           -- 1 to 5
        message         NVARCHAR(MAX) NULL,     -- Detailed feedback
        created_at      DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Optional: Link to users table
        CONSTRAINT FK_feedback_users FOREIGN KEY (user_id) 
            REFERENCES dbo.users (user_id) ON DELETE SET NULL,
            
        -- Rating validation (1-5)
        CONSTRAINT CK_feedback_rating CHECK (rating >= 1 AND rating <= 5)
    );

    PRINT 'feedback table created successfully.';
END
ELSE
BEGIN
    PRINT 'feedback table already exists — skipped.';
END
GO

-- Index for date sorting in admin dashboard
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_feedback_created_at'
      AND object_id = OBJECT_ID('feedback')
)
BEGIN
    CREATE INDEX IX_feedback_created_at ON feedback (created_at DESC);
    PRINT 'Index IX_feedback_created_at created.';
END
GO
