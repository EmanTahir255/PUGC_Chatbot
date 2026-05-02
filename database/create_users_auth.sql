-- ============================================================
-- PUGC SmartBot - users table for backend authentication
-- Run this ONCE in SQL Server Management Studio
-- against your PUGC_ChatbotDB database
-- ============================================================

USE PUGC_ChatbotDB;
GO

-- Create the users table only if it does not already exist
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'users'
)
BEGIN
    CREATE TABLE users (
        user_id            INT IDENTITY(1,1) PRIMARY KEY,
        full_name          NVARCHAR(150)   NOT NULL,
        email              NVARCHAR(255)   NOT NULL,
        password_hash      NVARCHAR(255)   NOT NULL,
        role               NVARCHAR(20)    NOT NULL DEFAULT 'student',
        is_active          BIT             NOT NULL DEFAULT 1,
        last_login_at      DATETIME        NULL,
        created_at         DATETIME        NOT NULL DEFAULT GETDATE(),
        updated_at         DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_users_email UNIQUE (email),
        CONSTRAINT CK_users_role CHECK (role IN ('student', 'admin'))
    );

    PRINT 'users table created successfully.';
END
ELSE
BEGIN
    PRINT 'users table already exists - skipped.';
END
GO

-- Index to support quick login lookups by email
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_users_email'
      AND object_id = OBJECT_ID('users')
)
BEGIN
    CREATE INDEX IX_users_email ON users (email);
    PRINT 'Index IX_users_email created.';
END
GO

-- Trigger to keep updated_at in sync on every update
IF OBJECT_ID('TRG_users_set_updated_at', 'TR') IS NULL
BEGIN
    EXEC('
        CREATE TRIGGER TRG_users_set_updated_at
        ON users
        AFTER UPDATE
        AS
        BEGIN
            SET NOCOUNT ON;

            UPDATE u
            SET updated_at = GETDATE()
            FROM users u
            INNER JOIN inserted i ON u.user_id = i.user_id;
        END
    ');

    PRINT 'Trigger TRG_users_set_updated_at created.';
END
ELSE
BEGIN
    PRINT 'Trigger TRG_users_set_updated_at already exists - skipped.';
END
GO

-- ============================================================
-- Optional admin note
-- After backend auth is connected, you can promote any user to
-- admin with a query like this:
--
-- UPDATE users
-- SET role = 'admin'
-- WHERE email = 'your-admin-email@example.com';
-- ============================================================
