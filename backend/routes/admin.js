const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

function requireAdmin(req, res, next) {
    const role = String(req.header('x-user-role') || '').toLowerCase();
    if (role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}

function parseIntField(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function parseDecimalField(value) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function normalizeOptionalText(value) {
    const text = String(value ?? '').trim();
    return text.length > 0 ? text : null;
}

function parseBit(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function validateDate(value) {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : String(value).slice(0, 10);
}

async function recordExists(pool, table, keyColumn, keyValue) {
    const request = pool.request();
    request.input('keyValue', typeof keyValue === 'number' ? sql.Int : sql.VarChar, keyValue);
    const result = await request.query(`
        SELECT TOP 1 1 AS found
        FROM ${table}
        WHERE ${keyColumn} = @keyValue
    `);
    return result.recordset.length > 0;
}

async function ensureNotDuplicate(pool, query, bindInputs = []) {
    const request = pool.request();
    bindInputs.forEach(input => request.input(input.name, input.type, input.value));
    const result = await request.query(query);
    return result.recordset.length > 0;
}

function sendValidationError(res, errors) {
    return res.status(400).json({ error: 'Validation failed.', details: errors });
}

router.use(requireAdmin);

router.get('/meta', async (req, res) => {
    try {
        const pool = await getPool();
        const [intents, departments, eventTypes, semesters, programs, feeTypes, scholarshipTypes] = await Promise.all([
            pool.request().query(`
                SELECT i.intent_id, i.intent_name, c.category_name
                FROM intents i
                JOIN categories c ON i.category_id = c.category_id
                ORDER BY i.intent_name
            `),
            pool.request().query(`
                SELECT department_id, dept_name
                FROM departments
                ORDER BY dept_name
            `),
            pool.request().query(`
                SELECT event_type_id, type_name
                FROM event_types
                ORDER BY type_name
            `),
            pool.request().query(`
                SELECT semester_id, semester_name, semester_type, year
                FROM semesters
                ORDER BY year DESC, semester_name DESC
            `),
            pool.request().query(`
                SELECT program_id, program_name, program_level, is_active
                FROM programs
                ORDER BY program_name
            `),
            pool.request().query(`
                SELECT fee_type_id, fee_type_name
                FROM fee_types
                ORDER BY fee_type_name
            `),
            pool.request().query(`
                SELECT scholarship_type_id, type_name, funding_source, is_renewable
                FROM scholarship_types
                ORDER BY type_name
            `)
        ]);

        return res.json({
            intents: intents.recordset,
            departments: departments.recordset,
            eventTypes: eventTypes.recordset,
            semesters: semesters.recordset,
            programs: programs.recordset,
            feeTypes: feeTypes.recordset,
            scholarshipTypes: scholarshipTypes.recordset
        });
    } catch (error) {
        console.error('Admin meta error:', error);
        return res.status(500).json({ error: 'Failed to load admin reference data.' });
    }
});

router.get('/faq-answers', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT fa.answer_id, fa.intent_id, fa.answer_text, fa.is_active, fa.updated_at,
                   i.intent_name, c.category_name
            FROM faq_answers fa
            JOIN intents i ON fa.intent_id = i.intent_id
            JOIN categories c ON i.category_id = c.category_id
            ORDER BY i.intent_name
        `);
        return res.json(result.recordset);
    } catch (error) {
        console.error('FAQ list error:', error);
        return res.status(500).json({ error: 'Failed to load FAQ answers.' });
    }
});

router.post('/faq-answers', async (req, res) => {
    try {
        const pool = await getPool();
        const intentId = parseIntField(req.body.intent_id);
        const answerText = String(req.body.answer_text || '').trim();
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!intentId) errors.intent_id = 'Intent is required.';
        if (!answerText) errors.answer_text = 'Answer text is required.';
        if (intentId && !(await recordExists(pool, 'intents', 'intent_id', intentId))) {
            errors.intent_id = 'Selected intent does not exist.';
        }

        if (intentId && isActive) {
            const activeExists = await ensureNotDuplicate(pool, `
                SELECT TOP 1 1 AS found
                FROM faq_answers
                WHERE intent_id = @intentId
                  AND is_active = 1
            `, [{ name: 'intentId', type: sql.Int, value: intentId }]);
            if (activeExists) {
                errors.intent_id = 'This intent already has an active FAQ answer.';
            }
        }

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        const result = await pool.request()
            .input('intentId', sql.Int, intentId)
            .input('answerText', sql.NVarChar(sql.MAX), answerText)
            .input('isActive', sql.Bit, isActive)
            .query(`
                INSERT INTO faq_answers (intent_id, answer_text, is_active)
                OUTPUT INSERTED.answer_id
                VALUES (@intentId, @answerText, @isActive)
            `);

        return res.status(201).json({ id: result.recordset[0].answer_id });
    } catch (error) {
        console.error('FAQ create error:', error);
        return res.status(500).json({ error: 'Failed to create FAQ answer.' });
    }
});

router.put('/faq-answers/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const answerId = parseIntField(req.params.id);
        const intentId = parseIntField(req.body.intent_id);
        const answerText = String(req.body.answer_text || '').trim();
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!answerId || !(await recordExists(pool, 'faq_answers', 'answer_id', answerId))) {
            return res.status(404).json({ error: 'FAQ answer not found.' });
        }
        if (!intentId) errors.intent_id = 'Intent is required.';
        if (!answerText) errors.answer_text = 'Answer text is required.';
        if (intentId && !(await recordExists(pool, 'intents', 'intent_id', intentId))) {
            errors.intent_id = 'Selected intent does not exist.';
        }

        if (intentId && isActive) {
            const activeExists = await ensureNotDuplicate(pool, `
                SELECT TOP 1 1 AS found
                FROM faq_answers
                WHERE intent_id = @intentId
                  AND is_active = 1
                  AND answer_id <> @answerId
            `, [
                { name: 'intentId', type: sql.Int, value: intentId },
                { name: 'answerId', type: sql.Int, value: answerId }
            ]);
            if (activeExists) {
                errors.intent_id = 'This intent already has another active FAQ answer.';
            }
        }

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        await pool.request()
            .input('answerId', sql.Int, answerId)
            .input('intentId', sql.Int, intentId)
            .input('answerText', sql.NVarChar(sql.MAX), answerText)
            .input('isActive', sql.Bit, isActive)
            .query(`
                UPDATE faq_answers
                SET intent_id = @intentId,
                    answer_text = @answerText,
                    is_active = @isActive,
                    updated_at = GETDATE()
                WHERE answer_id = @answerId
            `);

        return res.json({ success: true });
    } catch (error) {
        console.error('FAQ update error:', error);
        return res.status(500).json({ error: 'Failed to update FAQ answer.' });
    }
});

router.delete('/faq-answers/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const answerId = parseIntField(req.params.id);
        if (!answerId || !(await recordExists(pool, 'faq_answers', 'answer_id', answerId))) {
            return res.status(404).json({ error: 'FAQ answer not found.' });
        }

        await pool.request()
            .input('answerId', sql.Int, answerId)
            .query(`
                UPDATE faq_answers
                SET is_active = 0,
                    updated_at = GETDATE()
                WHERE answer_id = @answerId
            `);

        return res.json({ success: true, softDeleted: true });
    } catch (error) {
        console.error('FAQ deactivate error:', error);
        return res.status(500).json({ error: 'Failed to deactivate FAQ answer.' });
    }
});

router.get('/departments', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT department_id, dept_name, head_name, contact_number, email,
                   block_location, room_number, office_hours
            FROM departments
            ORDER BY dept_name
        `);
        return res.json(result.recordset);
    } catch (error) {
        console.error('Department list error:', error);
        return res.status(500).json({ error: 'Failed to load departments.' });
    }
});

router.post('/departments', async (req, res) => {
    try {
        const pool = await getPool();
        const deptName = String(req.body.dept_name || '').trim();
        const headName = normalizeOptionalText(req.body.head_name);
        const contactNumber = normalizeOptionalText(req.body.contact_number);
        const email = normalizeOptionalText(req.body.email);
        const blockLocation = normalizeOptionalText(req.body.block_location);
        const roomNumber = normalizeOptionalText(req.body.room_number);
        const officeHours = normalizeOptionalText(req.body.office_hours);
        const errors = {};

        if (!deptName) errors.dept_name = 'Department name is required.';
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Valid email is required.';

        const duplicate = deptName && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM departments
            WHERE LOWER(dept_name) = LOWER(@deptName)
        `, [{ name: 'deptName', type: sql.VarChar, value: deptName }]);
        if (duplicate) errors.dept_name = 'Department name already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        const result = await pool.request()
            .input('deptName', sql.VarChar, deptName)
            .input('headName', sql.VarChar, headName)
            .input('contactNumber', sql.VarChar, contactNumber)
            .input('email', sql.VarChar, email)
            .input('blockLocation', sql.VarChar, blockLocation)
            .input('roomNumber', sql.VarChar, roomNumber)
            .input('officeHours', sql.VarChar, officeHours)
            .query(`
                INSERT INTO departments (dept_name, head_name, contact_number, email, block_location, room_number, office_hours)
                OUTPUT INSERTED.department_id
                VALUES (@deptName, @headName, @contactNumber, @email, @blockLocation, @roomNumber, @officeHours)
            `);

        return res.status(201).json({ id: result.recordset[0].department_id });
    } catch (error) {
        console.error('Department create error:', error);
        return res.status(500).json({ error: 'Failed to create department.' });
    }
});

router.put('/departments/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const departmentId = parseIntField(req.params.id);
        const deptName = String(req.body.dept_name || '').trim();
        const headName = normalizeOptionalText(req.body.head_name);
        const contactNumber = normalizeOptionalText(req.body.contact_number);
        const email = normalizeOptionalText(req.body.email);
        const blockLocation = normalizeOptionalText(req.body.block_location);
        const roomNumber = normalizeOptionalText(req.body.room_number);
        const officeHours = normalizeOptionalText(req.body.office_hours);
        const errors = {};

        if (!departmentId || !(await recordExists(pool, 'departments', 'department_id', departmentId))) {
            return res.status(404).json({ error: 'Department not found.' });
        }
        if (!deptName) errors.dept_name = 'Department name is required.';
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Valid email is required.';

        const duplicate = deptName && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM departments
            WHERE LOWER(dept_name) = LOWER(@deptName)
              AND department_id <> @departmentId
        `, [
            { name: 'deptName', type: sql.VarChar, value: deptName },
            { name: 'departmentId', type: sql.Int, value: departmentId }
        ]);
        if (duplicate) errors.dept_name = 'Department name already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        await pool.request()
            .input('departmentId', sql.Int, departmentId)
            .input('deptName', sql.VarChar, deptName)
            .input('headName', sql.VarChar, headName)
            .input('contactNumber', sql.VarChar, contactNumber)
            .input('email', sql.VarChar, email)
            .input('blockLocation', sql.VarChar, blockLocation)
            .input('roomNumber', sql.VarChar, roomNumber)
            .input('officeHours', sql.VarChar, officeHours)
            .query(`
                UPDATE departments
                SET dept_name = @deptName,
                    head_name = @headName,
                    contact_number = @contactNumber,
                    email = @email,
                    block_location = @blockLocation,
                    room_number = @roomNumber,
                    office_hours = @officeHours
                WHERE department_id = @departmentId
            `);

        return res.json({ success: true });
    } catch (error) {
        console.error('Department update error:', error);
        return res.status(500).json({ error: 'Failed to update department.' });
    }
});

router.delete('/departments/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const departmentId = parseIntField(req.params.id);
        if (!departmentId || !(await recordExists(pool, 'departments', 'department_id', departmentId))) {
            return res.status(404).json({ error: 'Department not found.' });
        }

        const inUse = await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM programs
            WHERE department_id = @departmentId
        `, [{ name: 'departmentId', type: sql.Int, value: departmentId }]);
        if (inUse) {
            return res.status(409).json({ error: 'Department cannot be deleted while programs are linked to it.' });
        }

        await pool.request()
            .input('departmentId', sql.Int, departmentId)
            .query('DELETE FROM departments WHERE department_id = @departmentId');

        return res.json({ success: true, deleted: true });
    } catch (error) {
        console.error('Department delete error:', error);
        return res.status(500).json({ error: 'Failed to delete department.' });
    }
});

router.get('/programs', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT p.program_id, p.department_id, p.program_name, p.program_level, p.duration_years,
                   p.total_semesters, p.total_credit_hrs, p.total_seats, p.description, p.is_active,
                   d.dept_name
            FROM programs p
            JOIN departments d ON p.department_id = d.department_id
            ORDER BY p.program_name
        `);
        return res.json(result.recordset);
    } catch (error) {
        console.error('Program list error:', error);
        return res.status(500).json({ error: 'Failed to load programs.' });
    }
});

router.post('/programs', async (req, res) => {
    try {
        const pool = await getPool();
        const departmentId = parseIntField(req.body.department_id);
        const programName = String(req.body.program_name || '').trim();
        const programLevel = String(req.body.program_level || '').trim();
        const durationYears = parseDecimalField(req.body.duration_years);
        const totalSemesters = parseIntField(req.body.total_semesters);
        const totalCreditHrs = parseIntField(req.body.total_credit_hrs);
        const totalSeats = parseIntField(req.body.total_seats);
        const description = normalizeOptionalText(req.body.description);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!departmentId) errors.department_id = 'Department is required.';
        if (!programName) errors.program_name = 'Program name is required.';
        if (!programLevel) errors.program_level = 'Program level is required.';
        if (durationYears === null || durationYears <= 0) errors.duration_years = 'Valid duration is required.';
        if (!totalSemesters || totalSemesters <= 0) errors.total_semesters = 'Valid total semesters are required.';
        if (!totalCreditHrs || totalCreditHrs <= 0) errors.total_credit_hrs = 'Valid total credit hours are required.';
        if (!totalSeats || totalSeats <= 0) errors.total_seats = 'Valid total seats are required.';
        if (departmentId && !(await recordExists(pool, 'departments', 'department_id', departmentId))) {
            errors.department_id = 'Selected department does not exist.';
        }

        const duplicate = programName && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM programs
            WHERE LOWER(program_name) = LOWER(@programName)
        `, [{ name: 'programName', type: sql.VarChar, value: programName }]);
        if (duplicate) errors.program_name = 'Program name already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        const result = await pool.request()
            .input('departmentId', sql.Int, departmentId)
            .input('programName', sql.VarChar, programName)
            .input('programLevel', sql.VarChar, programLevel)
            .input('durationYears', sql.Decimal(3, 1), durationYears)
            .input('totalSemesters', sql.Int, totalSemesters)
            .input('totalCreditHrs', sql.Int, totalCreditHrs)
            .input('totalSeats', sql.Int, totalSeats)
            .input('description', sql.NVarChar(sql.MAX), description)
            .input('isActive', sql.Bit, isActive)
            .query(`
                INSERT INTO programs (
                    department_id, program_name, program_level, duration_years,
                    total_semesters, total_credit_hrs, total_seats, description, is_active
                )
                OUTPUT INSERTED.program_id
                VALUES (
                    @departmentId, @programName, @programLevel, @durationYears,
                    @totalSemesters, @totalCreditHrs, @totalSeats, @description, @isActive
                )
            `);

        return res.status(201).json({ id: result.recordset[0].program_id });
    } catch (error) {
        console.error('Program create error:', error);
        return res.status(500).json({ error: 'Failed to create program.' });
    }
});

router.put('/programs/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const programId = parseIntField(req.params.id);
        const departmentId = parseIntField(req.body.department_id);
        const programName = String(req.body.program_name || '').trim();
        const programLevel = String(req.body.program_level || '').trim();
        const durationYears = parseDecimalField(req.body.duration_years);
        const totalSemesters = parseIntField(req.body.total_semesters);
        const totalCreditHrs = parseIntField(req.body.total_credit_hrs);
        const totalSeats = parseIntField(req.body.total_seats);
        const description = normalizeOptionalText(req.body.description);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!programId || !(await recordExists(pool, 'programs', 'program_id', programId))) {
            return res.status(404).json({ error: 'Program not found.' });
        }
        if (!departmentId) errors.department_id = 'Department is required.';
        if (!programName) errors.program_name = 'Program name is required.';
        if (!programLevel) errors.program_level = 'Program level is required.';
        if (durationYears === null || durationYears <= 0) errors.duration_years = 'Valid duration is required.';
        if (!totalSemesters || totalSemesters <= 0) errors.total_semesters = 'Valid total semesters are required.';
        if (!totalCreditHrs || totalCreditHrs <= 0) errors.total_credit_hrs = 'Valid total credit hours are required.';
        if (!totalSeats || totalSeats <= 0) errors.total_seats = 'Valid total seats are required.';
        if (departmentId && !(await recordExists(pool, 'departments', 'department_id', departmentId))) {
            errors.department_id = 'Selected department does not exist.';
        }

        const duplicate = programName && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM programs
            WHERE LOWER(program_name) = LOWER(@programName)
              AND program_id <> @programId
        `, [
            { name: 'programName', type: sql.VarChar, value: programName },
            { name: 'programId', type: sql.Int, value: programId }
        ]);
        if (duplicate) errors.program_name = 'Program name already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        await pool.request()
            .input('programId', sql.Int, programId)
            .input('departmentId', sql.Int, departmentId)
            .input('programName', sql.VarChar, programName)
            .input('programLevel', sql.VarChar, programLevel)
            .input('durationYears', sql.Decimal(3, 1), durationYears)
            .input('totalSemesters', sql.Int, totalSemesters)
            .input('totalCreditHrs', sql.Int, totalCreditHrs)
            .input('totalSeats', sql.Int, totalSeats)
            .input('description', sql.NVarChar(sql.MAX), description)
            .input('isActive', sql.Bit, isActive)
            .query(`
                UPDATE programs
                SET department_id = @departmentId,
                    program_name = @programName,
                    program_level = @programLevel,
                    duration_years = @durationYears,
                    total_semesters = @totalSemesters,
                    total_credit_hrs = @totalCreditHrs,
                    total_seats = @totalSeats,
                    description = @description,
                    is_active = @isActive
                WHERE program_id = @programId
            `);

        return res.json({ success: true });
    } catch (error) {
        console.error('Program update error:', error);
        return res.status(500).json({ error: 'Failed to update program.' });
    }
});

router.delete('/programs/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const programId = parseIntField(req.params.id);
        if (!programId || !(await recordExists(pool, 'programs', 'program_id', programId))) {
            return res.status(404).json({ error: 'Program not found.' });
        }

        await pool.request()
            .input('programId', sql.Int, programId)
            .query(`
                UPDATE programs
                SET is_active = 0
                WHERE program_id = @programId
            `);

        return res.json({ success: true, softDeleted: true });
    } catch (error) {
        console.error('Program deactivate error:', error);
        return res.status(500).json({ error: 'Failed to deactivate program.' });
    }
});

router.get('/events', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT e.event_id, e.event_type_id, e.semester_id, e.event_name, e.event_date,
                   e.event_end_date, e.venue, e.description, e.registration_required,
                   e.registration_deadline, e.is_active, et.type_name AS event_type_name,
                   sem.semester_name
            FROM events e
            JOIN event_types et ON e.event_type_id = et.event_type_id
            LEFT JOIN semesters sem ON e.semester_id = sem.semester_id
            ORDER BY e.event_date DESC, e.event_name
        `);
        return res.json(result.recordset);
    } catch (error) {
        console.error('Event list error:', error);
        return res.status(500).json({ error: 'Failed to load events.' });
    }
});

router.post('/events', async (req, res) => {
    try {
        const pool = await getPool();
        const eventTypeId = parseIntField(req.body.event_type_id);
        const semesterId = req.body.semester_id ? parseIntField(req.body.semester_id) : null;
        const eventName = String(req.body.event_name || '').trim();
        const eventDate = validateDate(req.body.event_date);
        const eventEndDate = validateDate(req.body.event_end_date);
        const venue = normalizeOptionalText(req.body.venue);
        const description = normalizeOptionalText(req.body.description);
        const registrationRequired = parseBit(req.body.registration_required, false);
        const registrationDeadline = validateDate(req.body.registration_deadline);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!eventTypeId) errors.event_type_id = 'Event type is required.';
        if (!eventName) errors.event_name = 'Event name is required.';
        if (!eventDate) errors.event_date = 'Valid event date is required.';
        if (eventTypeId && !(await recordExists(pool, 'event_types', 'event_type_id', eventTypeId))) {
            errors.event_type_id = 'Selected event type does not exist.';
        }
        if (semesterId && !(await recordExists(pool, 'semesters', 'semester_id', semesterId))) {
            errors.semester_id = 'Selected semester does not exist.';
        }
        if (eventEndDate && eventDate && eventEndDate < eventDate) {
            errors.event_end_date = 'End date cannot be earlier than event date.';
        }
        if (registrationRequired && !registrationDeadline) {
            errors.registration_deadline = 'Registration deadline is required when registration is enabled.';
        }

        const duplicate = eventName && eventDate && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM events
            WHERE LOWER(event_name) = LOWER(@eventName)
              AND event_date = @eventDate
        `, [
            { name: 'eventName', type: sql.VarChar, value: eventName },
            { name: 'eventDate', type: sql.Date, value: eventDate }
        ]);
        if (duplicate) errors.event_name = 'An event with this name and date already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        const result = await pool.request()
            .input('eventTypeId', sql.Int, eventTypeId)
            .input('semesterId', sql.Int, semesterId)
            .input('eventName', sql.VarChar, eventName)
            .input('eventDate', sql.Date, eventDate)
            .input('eventEndDate', sql.Date, eventEndDate)
            .input('venue', sql.VarChar, venue)
            .input('description', sql.NVarChar(sql.MAX), description)
            .input('registrationRequired', sql.Bit, registrationRequired)
            .input('registrationDeadline', sql.Date, registrationDeadline)
            .input('isActive', sql.Bit, isActive)
            .query(`
                INSERT INTO events (
                    event_type_id, semester_id, event_name, event_date, event_end_date,
                    venue, description, registration_required, registration_deadline, is_active
                )
                OUTPUT INSERTED.event_id
                VALUES (
                    @eventTypeId, @semesterId, @eventName, @eventDate, @eventEndDate,
                    @venue, @description, @registrationRequired, @registrationDeadline, @isActive
                )
            `);

        return res.status(201).json({ id: result.recordset[0].event_id });
    } catch (error) {
        console.error('Event create error:', error);
        return res.status(500).json({ error: 'Failed to create event.' });
    }
});

router.put('/events/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const eventId = parseIntField(req.params.id);
        const eventTypeId = parseIntField(req.body.event_type_id);
        const semesterId = req.body.semester_id ? parseIntField(req.body.semester_id) : null;
        const eventName = String(req.body.event_name || '').trim();
        const eventDate = validateDate(req.body.event_date);
        const eventEndDate = validateDate(req.body.event_end_date);
        const venue = normalizeOptionalText(req.body.venue);
        const description = normalizeOptionalText(req.body.description);
        const registrationRequired = parseBit(req.body.registration_required, false);
        const registrationDeadline = validateDate(req.body.registration_deadline);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!eventId || !(await recordExists(pool, 'events', 'event_id', eventId))) {
            return res.status(404).json({ error: 'Event not found.' });
        }
        if (!eventTypeId) errors.event_type_id = 'Event type is required.';
        if (!eventName) errors.event_name = 'Event name is required.';
        if (!eventDate) errors.event_date = 'Valid event date is required.';
        if (eventTypeId && !(await recordExists(pool, 'event_types', 'event_type_id', eventTypeId))) {
            errors.event_type_id = 'Selected event type does not exist.';
        }
        if (semesterId && !(await recordExists(pool, 'semesters', 'semester_id', semesterId))) {
            errors.semester_id = 'Selected semester does not exist.';
        }
        if (eventEndDate && eventDate && eventEndDate < eventDate) {
            errors.event_end_date = 'End date cannot be earlier than event date.';
        }
        if (registrationRequired && !registrationDeadline) {
            errors.registration_deadline = 'Registration deadline is required when registration is enabled.';
        }

        const duplicate = eventName && eventDate && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM events
            WHERE LOWER(event_name) = LOWER(@eventName)
              AND event_date = @eventDate
              AND event_id <> @eventId
        `, [
            { name: 'eventName', type: sql.VarChar, value: eventName },
            { name: 'eventDate', type: sql.Date, value: eventDate },
            { name: 'eventId', type: sql.Int, value: eventId }
        ]);
        if (duplicate) errors.event_name = 'An event with this name and date already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        await pool.request()
            .input('eventId', sql.Int, eventId)
            .input('eventTypeId', sql.Int, eventTypeId)
            .input('semesterId', sql.Int, semesterId)
            .input('eventName', sql.VarChar, eventName)
            .input('eventDate', sql.Date, eventDate)
            .input('eventEndDate', sql.Date, eventEndDate)
            .input('venue', sql.VarChar, venue)
            .input('description', sql.NVarChar(sql.MAX), description)
            .input('registrationRequired', sql.Bit, registrationRequired)
            .input('registrationDeadline', sql.Date, registrationDeadline)
            .input('isActive', sql.Bit, isActive)
            .query(`
                UPDATE events
                SET event_type_id = @eventTypeId,
                    semester_id = @semesterId,
                    event_name = @eventName,
                    event_date = @eventDate,
                    event_end_date = @eventEndDate,
                    venue = @venue,
                    description = @description,
                    registration_required = @registrationRequired,
                    registration_deadline = @registrationDeadline,
                    is_active = @isActive
                WHERE event_id = @eventId
            `);

        return res.json({ success: true });
    } catch (error) {
        console.error('Event update error:', error);
        return res.status(500).json({ error: 'Failed to update event.' });
    }
});

router.delete('/events/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const eventId = parseIntField(req.params.id);
        if (!eventId || !(await recordExists(pool, 'events', 'event_id', eventId))) {
            return res.status(404).json({ error: 'Event not found.' });
        }

        await pool.request()
            .input('eventId', sql.Int, eventId)
            .query(`
                UPDATE events
                SET is_active = 0
                WHERE event_id = @eventId
            `);

        return res.json({ success: true, softDeleted: true });
    } catch (error) {
        console.error('Event deactivate error:', error);
        return res.status(500).json({ error: 'Failed to deactivate event.' });
    }
});

router.get('/fee-structures', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT fs.fee_structure_id, fs.program_id, fs.fee_type_id, fs.amount, fs.effective_from, fs.effective_to,
                   p.program_name, ft.fee_type_name
            FROM fee_structure fs
            JOIN programs p ON fs.program_id = p.program_id
            JOIN fee_types ft ON fs.fee_type_id = ft.fee_type_id
            ORDER BY p.program_name, ft.fee_type_name, fs.effective_from DESC
        `);
        return res.json(result.recordset);
    } catch (error) {
        console.error('Fee structure list error:', error);
        return res.status(500).json({ error: 'Failed to load fee structure records.' });
    }
});

router.post('/fee-structures', async (req, res) => {
    try {
        const pool = await getPool();
        const programId = parseIntField(req.body.program_id);
        const feeTypeId = parseIntField(req.body.fee_type_id);
        const amount = parseDecimalField(req.body.amount);
        const effectiveFrom = validateDate(req.body.effective_from);
        const effectiveTo = validateDate(req.body.effective_to);
        const errors = {};

        if (!programId) errors.program_id = 'Program is required.';
        if (!feeTypeId) errors.fee_type_id = 'Fee type is required.';
        if (amount === null || amount < 0) errors.amount = 'Valid amount is required.';
        if (!effectiveFrom) errors.effective_from = 'Effective from date is required.';
        if (effectiveTo && effectiveFrom && effectiveTo < effectiveFrom) {
            errors.effective_to = 'Effective to date cannot be earlier than effective from date.';
        }
        if (programId && !(await recordExists(pool, 'programs', 'program_id', programId))) {
            errors.program_id = 'Selected program does not exist.';
        }
        if (feeTypeId && !(await recordExists(pool, 'fee_types', 'fee_type_id', feeTypeId))) {
            errors.fee_type_id = 'Selected fee type does not exist.';
        }

        const duplicate = programId && feeTypeId && effectiveFrom && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM fee_structure
            WHERE program_id = @programId
              AND fee_type_id = @feeTypeId
              AND effective_from = @effectiveFrom
        `, [
            { name: 'programId', type: sql.Int, value: programId },
            { name: 'feeTypeId', type: sql.Int, value: feeTypeId },
            { name: 'effectiveFrom', type: sql.Date, value: effectiveFrom }
        ]);
        if (duplicate) errors.effective_from = 'A fee record for this program, fee type, and effective date already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        const result = await pool.request()
            .input('programId', sql.Int, programId)
            .input('feeTypeId', sql.Int, feeTypeId)
            .input('amount', sql.Decimal(10, 2), amount)
            .input('effectiveFrom', sql.Date, effectiveFrom)
            .input('effectiveTo', sql.Date, effectiveTo)
            .query(`
                INSERT INTO fee_structure (program_id, fee_type_id, amount, effective_from, effective_to)
                OUTPUT INSERTED.fee_structure_id
                VALUES (@programId, @feeTypeId, @amount, @effectiveFrom, @effectiveTo)
            `);

        return res.status(201).json({ id: result.recordset[0].fee_structure_id });
    } catch (error) {
        console.error('Fee structure create error:', error);
        return res.status(500).json({ error: 'Failed to create fee structure record.' });
    }
});

router.put('/fee-structures/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const feeStructureId = parseIntField(req.params.id);
        const programId = parseIntField(req.body.program_id);
        const feeTypeId = parseIntField(req.body.fee_type_id);
        const amount = parseDecimalField(req.body.amount);
        const effectiveFrom = validateDate(req.body.effective_from);
        const effectiveTo = validateDate(req.body.effective_to);
        const errors = {};

        if (!feeStructureId || !(await recordExists(pool, 'fee_structure', 'fee_structure_id', feeStructureId))) {
            return res.status(404).json({ error: 'Fee structure record not found.' });
        }
        if (!programId) errors.program_id = 'Program is required.';
        if (!feeTypeId) errors.fee_type_id = 'Fee type is required.';
        if (amount === null || amount < 0) errors.amount = 'Valid amount is required.';
        if (!effectiveFrom) errors.effective_from = 'Effective from date is required.';
        if (effectiveTo && effectiveFrom && effectiveTo < effectiveFrom) {
            errors.effective_to = 'Effective to date cannot be earlier than effective from date.';
        }
        if (programId && !(await recordExists(pool, 'programs', 'program_id', programId))) {
            errors.program_id = 'Selected program does not exist.';
        }
        if (feeTypeId && !(await recordExists(pool, 'fee_types', 'fee_type_id', feeTypeId))) {
            errors.fee_type_id = 'Selected fee type does not exist.';
        }

        const duplicate = programId && feeTypeId && effectiveFrom && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM fee_structure
            WHERE program_id = @programId
              AND fee_type_id = @feeTypeId
              AND effective_from = @effectiveFrom
              AND fee_structure_id <> @feeStructureId
        `, [
            { name: 'programId', type: sql.Int, value: programId },
            { name: 'feeTypeId', type: sql.Int, value: feeTypeId },
            { name: 'effectiveFrom', type: sql.Date, value: effectiveFrom },
            { name: 'feeStructureId', type: sql.Int, value: feeStructureId }
        ]);
        if (duplicate) errors.effective_from = 'A fee record for this program, fee type, and effective date already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        await pool.request()
            .input('feeStructureId', sql.Int, feeStructureId)
            .input('programId', sql.Int, programId)
            .input('feeTypeId', sql.Int, feeTypeId)
            .input('amount', sql.Decimal(10, 2), amount)
            .input('effectiveFrom', sql.Date, effectiveFrom)
            .input('effectiveTo', sql.Date, effectiveTo)
            .query(`
                UPDATE fee_structure
                SET program_id = @programId,
                    fee_type_id = @feeTypeId,
                    amount = @amount,
                    effective_from = @effectiveFrom,
                    effective_to = @effectiveTo
                WHERE fee_structure_id = @feeStructureId
            `);

        return res.json({ success: true });
    } catch (error) {
        console.error('Fee structure update error:', error);
        return res.status(500).json({ error: 'Failed to update fee structure record.' });
    }
});

router.delete('/fee-structures/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const feeStructureId = parseIntField(req.params.id);
        if (!feeStructureId || !(await recordExists(pool, 'fee_structure', 'fee_structure_id', feeStructureId))) {
            return res.status(404).json({ error: 'Fee structure record not found.' });
        }

        await pool.request()
            .input('feeStructureId', sql.Int, feeStructureId)
            .query(`
                UPDATE fee_structure
                SET effective_to = ISNULL(effective_to, CAST(GETDATE() AS date))
                WHERE fee_structure_id = @feeStructureId
            `);

        return res.json({ success: true, softDeleted: true });
    } catch (error) {
        console.error('Fee structure deactivate error:', error);
        return res.status(500).json({ error: 'Failed to deactivate fee structure record.' });
    }
});

router.get('/scholarships', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT s.scholarship_id, s.scholarship_type_id, s.semester_id, s.application_deadline,
                   s.interview_date, s.announcement_date, s.max_beneficiaries, s.is_active,
                   st.type_name, st.funding_source, st.benefit_percentage, st.min_cgpa_required, st.is_renewable,
                   sem.semester_name, sem.semester_type, sem.year
            FROM scholarships s
            JOIN scholarship_types st ON s.scholarship_type_id = st.scholarship_type_id
            JOIN semesters sem ON s.semester_id = sem.semester_id
            ORDER BY s.application_deadline DESC, st.type_name
        `);
        return res.json(result.recordset);
    } catch (error) {
        console.error('Scholarship list error:', error);
        return res.status(500).json({ error: 'Failed to load scholarships.' });
    }
});

router.post('/scholarships', async (req, res) => {
    try {
        const pool = await getPool();
        const scholarshipTypeId = parseIntField(req.body.scholarship_type_id);
        const semesterId = parseIntField(req.body.semester_id);
        const applicationDeadline = validateDate(req.body.application_deadline);
        const interviewDate = validateDate(req.body.interview_date);
        const announcementDate = validateDate(req.body.announcement_date);
        const maxBeneficiaries = req.body.max_beneficiaries === '' ? null : parseIntField(req.body.max_beneficiaries);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!scholarshipTypeId) errors.scholarship_type_id = 'Scholarship type is required.';
        if (!semesterId) errors.semester_id = 'Semester is required.';
        if (!applicationDeadline) errors.application_deadline = 'Application deadline is required.';
        if (maxBeneficiaries !== null && maxBeneficiaries <= 0) errors.max_beneficiaries = 'Max beneficiaries must be greater than 0.';
        if (scholarshipTypeId && !(await recordExists(pool, 'scholarship_types', 'scholarship_type_id', scholarshipTypeId))) {
            errors.scholarship_type_id = 'Selected scholarship type does not exist.';
        }
        if (semesterId && !(await recordExists(pool, 'semesters', 'semester_id', semesterId))) {
            errors.semester_id = 'Selected semester does not exist.';
        }
        if (interviewDate && applicationDeadline && interviewDate < applicationDeadline) {
            errors.interview_date = 'Interview date cannot be earlier than application deadline.';
        }
        if (announcementDate && applicationDeadline && announcementDate < applicationDeadline) {
            errors.announcement_date = 'Announcement date cannot be earlier than application deadline.';
        }

        const duplicate = scholarshipTypeId && semesterId && applicationDeadline && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM scholarships
            WHERE scholarship_type_id = @scholarshipTypeId
              AND semester_id = @semesterId
              AND application_deadline = @applicationDeadline
        `, [
            { name: 'scholarshipTypeId', type: sql.Int, value: scholarshipTypeId },
            { name: 'semesterId', type: sql.Int, value: semesterId },
            { name: 'applicationDeadline', type: sql.Date, value: applicationDeadline }
        ]);
        if (duplicate) errors.application_deadline = 'A scholarship record for this type, semester, and deadline already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        const result = await pool.request()
            .input('scholarshipTypeId', sql.Int, scholarshipTypeId)
            .input('semesterId', sql.Int, semesterId)
            .input('applicationDeadline', sql.Date, applicationDeadline)
            .input('interviewDate', sql.Date, interviewDate)
            .input('announcementDate', sql.Date, announcementDate)
            .input('maxBeneficiaries', sql.Int, maxBeneficiaries)
            .input('isActive', sql.Bit, isActive)
            .query(`
                INSERT INTO scholarships (
                    scholarship_type_id, semester_id, application_deadline, interview_date,
                    announcement_date, max_beneficiaries, is_active
                )
                OUTPUT INSERTED.scholarship_id
                VALUES (
                    @scholarshipTypeId, @semesterId, @applicationDeadline, @interviewDate,
                    @announcementDate, @maxBeneficiaries, @isActive
                )
            `);

        return res.status(201).json({ id: result.recordset[0].scholarship_id });
    } catch (error) {
        console.error('Scholarship create error:', error);
        return res.status(500).json({ error: 'Failed to create scholarship.' });
    }
});

router.put('/scholarships/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const scholarshipId = parseIntField(req.params.id);
        const scholarshipTypeId = parseIntField(req.body.scholarship_type_id);
        const semesterId = parseIntField(req.body.semester_id);
        const applicationDeadline = validateDate(req.body.application_deadline);
        const interviewDate = validateDate(req.body.interview_date);
        const announcementDate = validateDate(req.body.announcement_date);
        const maxBeneficiaries = req.body.max_beneficiaries === '' ? null : parseIntField(req.body.max_beneficiaries);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!scholarshipId || !(await recordExists(pool, 'scholarships', 'scholarship_id', scholarshipId))) {
            return res.status(404).json({ error: 'Scholarship record not found.' });
        }
        if (!scholarshipTypeId) errors.scholarship_type_id = 'Scholarship type is required.';
        if (!semesterId) errors.semester_id = 'Semester is required.';
        if (!applicationDeadline) errors.application_deadline = 'Application deadline is required.';
        if (maxBeneficiaries !== null && maxBeneficiaries <= 0) errors.max_beneficiaries = 'Max beneficiaries must be greater than 0.';
        if (scholarshipTypeId && !(await recordExists(pool, 'scholarship_types', 'scholarship_type_id', scholarshipTypeId))) {
            errors.scholarship_type_id = 'Selected scholarship type does not exist.';
        }
        if (semesterId && !(await recordExists(pool, 'semesters', 'semester_id', semesterId))) {
            errors.semester_id = 'Selected semester does not exist.';
        }
        if (interviewDate && applicationDeadline && interviewDate < applicationDeadline) {
            errors.interview_date = 'Interview date cannot be earlier than application deadline.';
        }
        if (announcementDate && applicationDeadline && announcementDate < applicationDeadline) {
            errors.announcement_date = 'Announcement date cannot be earlier than application deadline.';
        }

        const duplicate = scholarshipTypeId && semesterId && applicationDeadline && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM scholarships
            WHERE scholarship_type_id = @scholarshipTypeId
              AND semester_id = @semesterId
              AND application_deadline = @applicationDeadline
              AND scholarship_id <> @scholarshipId
        `, [
            { name: 'scholarshipTypeId', type: sql.Int, value: scholarshipTypeId },
            { name: 'semesterId', type: sql.Int, value: semesterId },
            { name: 'applicationDeadline', type: sql.Date, value: applicationDeadline },
            { name: 'scholarshipId', type: sql.Int, value: scholarshipId }
        ]);
        if (duplicate) errors.application_deadline = 'A scholarship record for this type, semester, and deadline already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        await pool.request()
            .input('scholarshipId', sql.Int, scholarshipId)
            .input('scholarshipTypeId', sql.Int, scholarshipTypeId)
            .input('semesterId', sql.Int, semesterId)
            .input('applicationDeadline', sql.Date, applicationDeadline)
            .input('interviewDate', sql.Date, interviewDate)
            .input('announcementDate', sql.Date, announcementDate)
            .input('maxBeneficiaries', sql.Int, maxBeneficiaries)
            .input('isActive', sql.Bit, isActive)
            .query(`
                UPDATE scholarships
                SET scholarship_type_id = @scholarshipTypeId,
                    semester_id = @semesterId,
                    application_deadline = @applicationDeadline,
                    interview_date = @interviewDate,
                    announcement_date = @announcementDate,
                    max_beneficiaries = @maxBeneficiaries,
                    is_active = @isActive
                WHERE scholarship_id = @scholarshipId
            `);

        return res.json({ success: true });
    } catch (error) {
        console.error('Scholarship update error:', error);
        return res.status(500).json({ error: 'Failed to update scholarship.' });
    }
});

router.delete('/scholarships/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const scholarshipId = parseIntField(req.params.id);
        if (!scholarshipId || !(await recordExists(pool, 'scholarships', 'scholarship_id', scholarshipId))) {
            return res.status(404).json({ error: 'Scholarship record not found.' });
        }

        await pool.request()
            .input('scholarshipId', sql.Int, scholarshipId)
            .query(`
                UPDATE scholarships
                SET is_active = 0
                WHERE scholarship_id = @scholarshipId
            `);

        return res.json({ success: true, softDeleted: true });
    } catch (error) {
        console.error('Scholarship deactivate error:', error);
        return res.status(500).json({ error: 'Failed to deactivate scholarship.' });
    }
});

module.exports = router;
