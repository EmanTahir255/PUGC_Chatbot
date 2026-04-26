USE [PUGC_ChatbotDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.departments
    WHERE UPPER(LTRIM(RTRIM(dept_name))) = 'LAW'
)
BEGIN
    INSERT INTO dbo.departments (
        dept_name,
        head_name,
        contact_number,
        email,
        block_location,
        room_number,
        office_hours,
        created_at
    )
    VALUES (
        'LAW',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        GETDATE()
    );
END;

COMMIT TRANSACTION;
GO

SELECT department_id, dept_name
FROM dbo.departments
WHERE UPPER(LTRIM(RTRIM(dept_name))) = 'LAW';
GO
