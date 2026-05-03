-- ============================================================
-- PUGC SmartBot - manual payment and subscription tables
-- Run this ONCE in SQL Server Management Studio
-- against your PUGC_ChatbotDB database
-- ============================================================

USE PUGC_ChatbotDB;
GO

-- ============================================================
-- 1. Subscription plans
-- Matches the current frontend plans:
-- weekly  = Rs. 199, 7 days, 200 chat limit
-- monthly = Rs. 499, 30 days, 1000 chat limit
-- ============================================================

IF OBJECT_ID('dbo.subscription_plans', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.subscription_plans (
        plan_id        INT IDENTITY(1,1) PRIMARY KEY,
        plan_code      NVARCHAR(50)    NOT NULL,
        plan_name      NVARCHAR(100)   NOT NULL,
        description    NVARCHAR(500)   NULL,
        price          DECIMAL(10,2)   NOT NULL,
        currency       NVARCHAR(10)    NOT NULL DEFAULT 'PKR',
        duration_days  INT             NOT NULL,
        chat_limit     INT             NOT NULL,
        is_active      BIT             NOT NULL DEFAULT 1,
        sort_order     INT             NOT NULL DEFAULT 0,
        created_at     DATETIME        NOT NULL DEFAULT GETDATE(),
        updated_at     DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_subscription_plans_plan_code UNIQUE (plan_code),
        CONSTRAINT CK_subscription_plans_price CHECK (price >= 0),
        CONSTRAINT CK_subscription_plans_duration CHECK (duration_days > 0),
        CONSTRAINT CK_subscription_plans_chat_limit CHECK (chat_limit > 0)
    );

    PRINT 'subscription_plans table created successfully.';
END
ELSE
BEGIN
    PRINT 'subscription_plans table already exists - skipped.';
END
GO

-- Seed default plans only if they do not already exist.
IF OBJECT_ID('dbo.subscription_plans', 'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.subscription_plans WHERE plan_code = 'weekly')
    BEGIN
        INSERT INTO dbo.subscription_plans
            (plan_code, plan_name, description, price, currency, duration_days, chat_limit, is_active, sort_order)
        VALUES
            ('weekly', 'Weekly Premium', '7 days premium access with higher chat limit.', 199.00, 'PKR', 7, 200, 1, 1);

        PRINT 'Weekly Premium plan inserted.';
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.subscription_plans WHERE plan_code = 'monthly')
    BEGIN
        INSERT INTO dbo.subscription_plans
            (plan_code, plan_name, description, price, currency, duration_days, chat_limit, is_active, sort_order)
        VALUES
            ('monthly', 'Monthly Premium', '30 days premium access with full premium chat limit.', 499.00, 'PKR', 30, 1000, 1, 2);

        PRINT 'Monthly Premium plan inserted.';
    END
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_subscription_plans_active'
      AND object_id = OBJECT_ID('dbo.subscription_plans')
)
BEGIN
    CREATE INDEX IX_subscription_plans_active
    ON dbo.subscription_plans (is_active, sort_order, plan_id);

    PRINT 'Index IX_subscription_plans_active created.';
END
GO

-- ============================================================
-- 2. Manual payment requests
-- Admin approval will move payment from pending to approved/rejected.
-- ============================================================

IF OBJECT_ID('dbo.manual_payments', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.manual_payments (
        payment_id             INT IDENTITY(1,1) PRIMARY KEY,
        user_id                INT             NOT NULL,
        plan_id                INT             NOT NULL,
        amount                 DECIMAL(10,2)   NOT NULL,
        currency               NVARCHAR(10)    NOT NULL DEFAULT 'PKR',
        payment_method         NVARCHAR(30)    NOT NULL,
        sender_account_name    NVARCHAR(150)   NULL,
        sender_account_number  NVARCHAR(50)    NULL,
        transaction_reference  NVARCHAR(100)   NULL,
        proof_file_path        NVARCHAR(500)   NULL,
        proof_original_name    NVARCHAR(255)   NULL,
        student_note           NVARCHAR(500)   NULL,
        status                 NVARCHAR(20)    NOT NULL DEFAULT 'pending',
        reviewed_by            INT             NULL,
        reviewed_at            DATETIME        NULL,
        admin_note             NVARCHAR(500)   NULL,
        submitted_at           DATETIME        NOT NULL DEFAULT GETDATE(),
        created_at             DATETIME        NOT NULL DEFAULT GETDATE(),
        updated_at             DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_manual_payments_user
            FOREIGN KEY (user_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_manual_payments_plan
            FOREIGN KEY (plan_id) REFERENCES dbo.subscription_plans(plan_id),
        CONSTRAINT FK_manual_payments_reviewed_by
            FOREIGN KEY (reviewed_by) REFERENCES dbo.users(user_id),
        CONSTRAINT CK_manual_payments_amount CHECK (amount > 0),
        CONSTRAINT CK_manual_payments_method
            CHECK (payment_method IN ('easypaisa', 'jazzcash', 'bank_transfer', 'cash', 'other')),
        CONSTRAINT CK_manual_payments_status
            CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
    );

    PRINT 'manual_payments table created successfully.';
END
ELSE
BEGIN
    PRINT 'manual_payments table already exists - skipped.';
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_manual_payments_user_status'
      AND object_id = OBJECT_ID('dbo.manual_payments')
)
BEGIN
    CREATE INDEX IX_manual_payments_user_status
    ON dbo.manual_payments (user_id, status, submitted_at DESC);

    PRINT 'Index IX_manual_payments_user_status created.';
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_manual_payments_status'
      AND object_id = OBJECT_ID('dbo.manual_payments')
)
BEGIN
    CREATE INDEX IX_manual_payments_status
    ON dbo.manual_payments (status, submitted_at DESC);

    PRINT 'Index IX_manual_payments_status created.';
END
GO

-- Prevent accidental duplicate transaction references when a reference is provided.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_manual_payments_transaction_reference'
      AND object_id = OBJECT_ID('dbo.manual_payments')
)
BEGIN
    CREATE UNIQUE INDEX UX_manual_payments_transaction_reference
    ON dbo.manual_payments (payment_method, transaction_reference)
    WHERE transaction_reference IS NOT NULL;

    PRINT 'Index UX_manual_payments_transaction_reference created.';
END
GO

-- ============================================================
-- 3. User subscriptions
-- Created or extended only after an admin approves payment.
-- ============================================================

IF OBJECT_ID('dbo.user_subscriptions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_subscriptions (
        subscription_id  INT IDENTITY(1,1) PRIMARY KEY,
        user_id          INT             NOT NULL,
        plan_id          INT             NOT NULL,
        payment_id       INT             NULL,
        status           NVARCHAR(20)    NOT NULL DEFAULT 'active',
        started_at       DATETIME        NOT NULL DEFAULT GETDATE(),
        expires_at       DATETIME        NOT NULL,
        cancelled_at     DATETIME        NULL,
        created_at       DATETIME        NOT NULL DEFAULT GETDATE(),
        updated_at       DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_user_subscriptions_user
            FOREIGN KEY (user_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_user_subscriptions_plan
            FOREIGN KEY (plan_id) REFERENCES dbo.subscription_plans(plan_id),
        CONSTRAINT FK_user_subscriptions_payment
            FOREIGN KEY (payment_id) REFERENCES dbo.manual_payments(payment_id),
        CONSTRAINT CK_user_subscriptions_status
            CHECK (status IN ('active', 'expired', 'cancelled')),
        CONSTRAINT CK_user_subscriptions_dates
            CHECK (expires_at > started_at)
    );

    PRINT 'user_subscriptions table created successfully.';
END
ELSE
BEGIN
    PRINT 'user_subscriptions table already exists - skipped.';
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_user_subscriptions_user_status'
      AND object_id = OBJECT_ID('dbo.user_subscriptions')
)
BEGIN
    CREATE INDEX IX_user_subscriptions_user_status
    ON dbo.user_subscriptions (user_id, status, expires_at DESC);

    PRINT 'Index IX_user_subscriptions_user_status created.';
END
GO

-- One active subscription row per user. If a user buys again,
-- backend should extend the active row instead of creating another active row.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_user_subscriptions_one_active'
      AND object_id = OBJECT_ID('dbo.user_subscriptions')
)
BEGIN
    CREATE UNIQUE INDEX UX_user_subscriptions_one_active
    ON dbo.user_subscriptions (user_id)
    WHERE status = 'active';

    PRINT 'Index UX_user_subscriptions_one_active created.';
END
GO

-- ============================================================
-- 4. User notifications
-- Used for payment submitted/approved/rejected and subscription notices.
-- ============================================================

IF OBJECT_ID('dbo.notifications', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.notifications (
        notification_id         INT IDENTITY(1,1) PRIMARY KEY,
        user_id                 INT             NOT NULL,
        notification_type       NVARCHAR(50)    NOT NULL,
        title                   NVARCHAR(150)   NOT NULL,
        message                 NVARCHAR(1000)  NOT NULL,
        related_payment_id      INT             NULL,
        related_subscription_id INT             NULL,
        is_read                 BIT             NOT NULL DEFAULT 0,
        read_at                 DATETIME        NULL,
        created_at              DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_notifications_user
            FOREIGN KEY (user_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_notifications_payment
            FOREIGN KEY (related_payment_id) REFERENCES dbo.manual_payments(payment_id),
        CONSTRAINT FK_notifications_subscription
            FOREIGN KEY (related_subscription_id) REFERENCES dbo.user_subscriptions(subscription_id),
        CONSTRAINT CK_notifications_type
            CHECK (notification_type IN (
                'payment_submitted',
                'payment_approved',
                'payment_rejected',
                'subscription_active',
                'subscription_expiring',
                'subscription_expired',
                'general'
            ))
    );

    PRINT 'notifications table created successfully.';
END
ELSE
BEGIN
    PRINT 'notifications table already exists - skipped.';
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_notifications_user_read'
      AND object_id = OBJECT_ID('dbo.notifications')
)
BEGIN
    CREATE INDEX IX_notifications_user_read
    ON dbo.notifications (user_id, is_read, created_at DESC);

    PRINT 'Index IX_notifications_user_read created.';
END
GO

-- ============================================================
-- 5. updated_at triggers
-- ============================================================

IF OBJECT_ID('dbo.TRG_subscription_plans_set_updated_at', 'TR') IS NULL
BEGIN
    EXEC('
        CREATE TRIGGER dbo.TRG_subscription_plans_set_updated_at
        ON dbo.subscription_plans
        AFTER UPDATE
        AS
        BEGIN
            SET NOCOUNT ON;
            IF TRIGGER_NESTLEVEL() > 1 RETURN;

            UPDATE p
            SET updated_at = GETDATE()
            FROM dbo.subscription_plans p
            INNER JOIN inserted i ON p.plan_id = i.plan_id;
        END
    ');

    PRINT 'Trigger TRG_subscription_plans_set_updated_at created.';
END
ELSE
BEGIN
    PRINT 'Trigger TRG_subscription_plans_set_updated_at already exists - skipped.';
END
GO

IF OBJECT_ID('dbo.TRG_manual_payments_set_updated_at', 'TR') IS NULL
BEGIN
    EXEC('
        CREATE TRIGGER dbo.TRG_manual_payments_set_updated_at
        ON dbo.manual_payments
        AFTER UPDATE
        AS
        BEGIN
            SET NOCOUNT ON;
            IF TRIGGER_NESTLEVEL() > 1 RETURN;

            UPDATE p
            SET updated_at = GETDATE()
            FROM dbo.manual_payments p
            INNER JOIN inserted i ON p.payment_id = i.payment_id;
        END
    ');

    PRINT 'Trigger TRG_manual_payments_set_updated_at created.';
END
ELSE
BEGIN
    PRINT 'Trigger TRG_manual_payments_set_updated_at already exists - skipped.';
END
GO

IF OBJECT_ID('dbo.TRG_user_subscriptions_set_updated_at', 'TR') IS NULL
BEGIN
    EXEC('
        CREATE TRIGGER dbo.TRG_user_subscriptions_set_updated_at
        ON dbo.user_subscriptions
        AFTER UPDATE
        AS
        BEGIN
            SET NOCOUNT ON;
            IF TRIGGER_NESTLEVEL() > 1 RETURN;

            UPDATE s
            SET updated_at = GETDATE()
            FROM dbo.user_subscriptions s
            INNER JOIN inserted i ON s.subscription_id = i.subscription_id;
        END
    ');

    PRINT 'Trigger TRG_user_subscriptions_set_updated_at created.';
END
ELSE
BEGIN
    PRINT 'Trigger TRG_user_subscriptions_set_updated_at already exists - skipped.';
END
GO

-- ============================================================
-- Quick verification queries
-- Run after the script if you want to confirm the setup:
--
-- SELECT * FROM dbo.subscription_plans ORDER BY sort_order;
-- SELECT TOP 5 * FROM dbo.manual_payments ORDER BY payment_id DESC;
-- SELECT TOP 5 * FROM dbo.user_subscriptions ORDER BY subscription_id DESC;
-- SELECT TOP 5 * FROM dbo.notifications ORDER BY notification_id DESC;
-- ============================================================

