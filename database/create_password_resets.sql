-- ============================================================
-- PUGC SmartBot - password_resets table
-- Run this in SQL Server Management Studio (SSMS) 
-- against your PUGC_ChatbotDB database.
-- ============================================================

USE PUGC_ChatbotDB;
GO

IF NOT EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_NAME = 'password_resets'
)
BEGIN
    CREATE TABLE password_resets (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        user_id     INT NOT NULL,
        token       NVARCHAR(255) NOT NULL,
        expires_at  DATETIME NOT NULL,
        created_at  DATETIME NOT NULL DEFAULT GETDATE(),
        
        CONSTRAINT FK_password_resets_users 
            FOREIGN KEY (user_id) 
            REFERENCES users(user_id) 
            ON DELETE CASCADE
    );

    -- Index for faster token lookups
    CREATE INDEX IX_password_resets_token ON password_resets(token);

    PRINT 'password_resets table created successfully.';
END
ELSE
BEGIN
    PRINT 'password_resets table already exists - skipped.';
END
GO
