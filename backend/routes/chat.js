const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getPool, sql } = require('../db');
const {
    extractIntentFromQuestion,
    getGroqResponse,
    isAnswerRelevant,
    refineAnswerWithDBContext,
    getGroundedGroqResponse
} = require('../gemini');

const DYNAMIC_INTENT_HANDLERS = {
    ask_department_list: 'departments',
    ask_cs_department: 'department_details',
    ask_bba_department: 'department_details',
    ask_hod_contact: 'department_details',
    ask_department_office_hours: 'department_details',
    ask_available_programs: 'programs',
    ask_bs_cs_details: 'program_details',
    ask_bba_details: 'program_details',
    ask_program_duration: 'program_details',
    ask_credit_hours: 'program_details',
    ask_ms_program: 'programs',
    ask_phd_program: 'programs',
    ask_tuition_fee: 'fees',
    ask_cs_fee: 'fees',
    ask_bba_fee: 'fees',
    ask_fee_deadline: 'fee_schedule',
    ask_late_fee: 'fee_schedule',
    ask_scholarship: 'scholarships',
    ask_scholarship_deadline: 'scholarships',
    ask_hostel_availability: 'hostels',
    ask_hostel_fee: 'hostels',
    ask_hostel_facilities: 'hostels',
    ask_hostel_warden: 'hostels',
    ask_semester_events: 'events',
    ask_orientation: 'events',
    ask_event_registration: 'events',
    ask_event_eligibility: 'events',
    ask_department_events: 'events',
    ask_library_books: 'library',
    ask_library_fine: 'library',
    ask_library_general: 'library',
    ask_transport: 'transport',
    ask_transport_routes: 'transport',
    ask_transport_fee: 'transport'
};

const RELATED_QUESTION_MAP = {
    ask_tuition_fee: [
        'When is the fee deadline?',
        'How can I pay the fee?',
        'Is there any late fee?',
        'What is the fee for BS Computer Science?'
    ],
    ask_cs_fee: [
        'What are the credit hours of BS Computer Science?',
        'How long is BS Computer Science?',
        'When is the fee deadline for BSCS?',
        'Which department offers BS Computer Science?'
    ],
    ask_bba_fee: [
        'How long is BBA?',
        'What are the credit hours of BBA?',
        'When is the fee deadline for BBA?',
        'Which department offers BBA?'
    ],
    ask_fee_deadline: [
        'Is there any late fee?',
        'How can I pay the fee?',
        'What is the tuition fee?',
        'Can I get a fee refund?'
    ],
    ask_late_fee: [
        'What is the fee deadline?',
        'How can I pay the fee?',
        'Can I get a fee refund?',
        'Is there any installment plan?'
    ],
    ask_scholarship: [
        'When is the scholarship deadline?',
        'What CGPA is required for scholarship?',
        'How do I apply for scholarship?',
        'Is scholarship renewable?'
    ],
    ask_scholarship_deadline: [
        'What scholarships are available right now?',
        'What CGPA is required for scholarship?',
        'How do I apply for scholarship?',
        'Can scholarship be cancelled?'
    ],
    ask_available_programs: [
        'How long is the program I want to study?',
        'What are the credit hours of a program?',
        'What is the fee structure?',
        'Which departments are present at PUGC?'
    ],
    ask_program_duration: [
        'What are the credit hours of this program?',
        'What is the fee of this program?',
        'Which department offers this program?',
        'How many seats are available?'
    ],
    ask_credit_hours: [
        'How long is this program?',
        'What is the fee of this program?',
        'Which department offers it?',
        'What are the graduation requirements?'
    ],
    ask_department_list: [
        'Who is the HOD of a department?',
        'What are department office hours?',
        'Which programs are offered?',
        'Where is the Computer Science department?'
    ],
    ask_cs_department: [
        'Who is the HOD of CS department?',
        'What are the office hours of CS department?',
        'What programs does the department offer?',
        'What is the fee of BS Computer Science?'
    ],
    ask_bba_department: [
        'Who is the HOD of BBA department?',
        'What are the office hours of BBA department?',
        'What programs does the department offer?',
        'What is the fee of BBA?'
    ],
    ask_hod_contact: [
        'What are the department office hours?',
        'Which departments are present at PUGC?',
        'Where is the department located?',
        'What programs does the department offer?'
    ],
    ask_department_office_hours: [
        'Who is the HOD of that department?',
        'Where is the department located?',
        'Which programs does the department offer?',
        'What departments are present at PUGC?'
    ],
    ask_admissions_contact: [
        'What are the admission requirements?',
        'What is the admission schedule?',
        'What documents are required for admission?',
        'Is there an entry test for admission?'
    ],
    ask_exam_office_contact: [
        'What is the exam schedule?',
        'When will the result be announced?',
        'How can I apply for transcript?',
        'How do I contact the admissions office?'
    ],
    ask_accounts_contact: [
        'What is the tuition fee?',
        'When is the fee deadline?',
        'Is there any late fee?',
        'How can I pay the fee?'
    ],
    ask_it_support_contact: [
        'How do I access the student portal?',
        'How can I reset my portal password?',
        'The portal is not working, what should I do?',
        'How do I contact the admissions office?'
    ],
    ask_main_contact: [
        'How do I contact the admissions office?',
        'What is the university address?',
        'How do I access the student portal?',
        'What departments are present at PUGC?'
    ],
    ask_university_address: [
        'How do I contact the university?',
        'How do I access the student portal?',
        'What departments are present at PUGC?',
        'How do I contact the admissions office?'
    ],
    ask_student_portal: [
        'How do I contact IT support?',
        'How can I reset my portal password?',
        'What is the university website?',
        'How do I contact the admissions office?'
    ],
    ask_emergency_contacts: [
        'How do I contact the university?',
        'Where is PUGC located?',
        'Who is the hostel warden?',
        'How do I contact IT support?'
    ],
    ask_hostel_availability: [
        'What is the hostel fee?',
        'Who is the hostel warden?',
        'What facilities are available in hostel?',
        'How can I apply for hostel?'
    ],
    ask_hostel_fee: [
        'Is hostel available right now?',
        'What facilities are available in hostel?',
        'Who is the hostel warden?',
        'How can I apply for hostel?'
    ],
    ask_hostel_facilities: [
        'Is hostel available right now?',
        'What is the hostel fee?',
        'Who is the hostel warden?',
        'How can I apply for hostel?'
    ],
    ask_hostel_warden: [
        'Is hostel available right now?',
        'What is the hostel fee?',
        'What facilities are available in hostel?',
        'How can I apply for hostel?'
    ],
    ask_library_books: [
        'What is the library fine per day?',
        'Where is the library located?',
        'Is there a reading room?',
        'How do I get library membership?'
    ],
    ask_library_fine: [
        'How many books can I borrow?',
        'Where is the library located?',
        'Is there a reading room?',
        'How do I get library membership?'
    ],
    ask_library_general: [
        'How many books can I borrow?',
        'What is the library fine per day?',
        'Where is the library located?',
        'Is there a reading room?'
    ],
    ask_transport: [
        'Which routes does PUGC cover?',
        'What is the transport fee?',
        'Does the bus cover Satellite Town?',
        'How can I register for transport?'
    ],
    ask_transport_routes: [
        'What is the transport fee?',
        'Does the bus cover Satellite Town?',
        'What time is pickup for my route?',
        'How can I register for transport?'
    ],
    ask_transport_fee: [
        'Which routes does PUGC cover?',
        'Does the bus cover Satellite Town?',
        'What time is pickup for my route?',
        'How can I register for transport?'
    ],
    ask_semester_events: [
        'When is orientation?',
        'Do upcoming events require registration?',
        'Who can join campus events?',
        'Are there any workshops at PUGC?'
    ],
    ask_orientation: [
        'What upcoming events are there at PUGC?',
        'Does orientation require registration?',
        'Where will orientation be held?',
        'Are there any workshops at PUGC?'
    ],
    ask_event_registration: [
        'What upcoming events are there at PUGC?',
        'Who can join campus events?',
        'When is orientation?',
        'Are there any workshops at PUGC?'
    ],
    ask_event_eligibility: [
        'Do upcoming events require registration?',
        'What upcoming events are there at PUGC?',
        'When is orientation?',
        'Are there any department events?'
    ]
};

const EXCLUDED_SUGGESTION_INTENTS = new Set([
    'greet',
    'goodbye',
    'thank_you',
    'bot_introduction',
    'fallback_help'
]);

async function getAnswerFromDB(intent, pool) {
    const result = await pool.request()
        .input('intent', sql.VarChar, intent)
        .query('SELECT answer_text FROM vw_faq_complete WHERE intent_name = @intent AND is_active = 1');
    return result.recordset.length > 0 ? result.recordset[0].answer_text : null;
}

async function getTrainingExampleSuggestions(pool, intent = null, limit = 5) {
    const request = pool.request().input('limit', sql.Int, limit);

    if (intent) {
        request.input('intent', sql.VarChar, intent);
        const result = await request.query(`
            SELECT TOP (@limit) te.example_text, i.intent_name
            FROM training_examples te
            JOIN intents i ON te.intent_id = i.intent_id
            WHERE i.intent_name = @intent
            ORDER BY te.example_id
        `);
        return result.recordset;
    }

    const result = await request.query(`
        SELECT TOP (@limit) te.example_text, i.intent_name
        FROM training_examples te
        JOIN intents i ON te.intent_id = i.intent_id
        ORDER BY te.example_id
    `);
    return result.recordset;
}

function dedupeQuestions(questions = [], currentMessage = '') {
    const seen = new Set();
    const normalizedCurrent = currentMessage.trim().toLowerCase();

    return questions.filter(question => {
        const normalized = String(question || '').trim();
        if (!normalized) return false;
        const key = normalized.toLowerCase();
        if (key === normalizedCurrent || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function isSuggestionCandidate(text = '') {
    const value = String(text || '').trim();
    if (!value) return false;

    const normalized = value.toLowerCase();
    if (normalized.length < 12) return false;
    if (normalized.split(/\s+/).length < 3) return false;

    const blockedPatterns = [
        /^(hello|hi|hey|good morning|good evening|assalamualaikum|salam|thanks?|thank you|bye|goodbye)$/i,
        /^(what'?s up|how are you|who are you)$/i
    ];

    return !blockedPatterns.some(pattern => pattern.test(normalized));
}

function filterSuggestionExamples(examples = []) {
    return examples.filter(item =>
        !EXCLUDED_SUGGESTION_INTENTS.has(item.intent_name) &&
        isSuggestionCandidate(item.example_text)
    );
}

async function buildSuggestedQuestions(pool, primaryIntent, currentMessage, fallbackIntents = []) {
    const intentOrder = [primaryIntent, ...fallbackIntents].filter(Boolean);
    const mapped = intentOrder.flatMap(intent => RELATED_QUESTION_MAP[intent] || []);

    if (mapped.length > 0) {
        return dedupeQuestions(mapped, currentMessage).slice(0, 4);
    }

    for (const intent of intentOrder) {
        const examples = filterSuggestionExamples(await getTrainingExampleSuggestions(pool, intent, 6));
        const questions = dedupeQuestions(
            examples.map(item => item.example_text),
            currentMessage
        );
        if (questions.length > 0) {
            return questions.slice(0, 4);
        }
    }

    const genericExamples = filterSuggestionExamples(await getTrainingExampleSuggestions(pool, null, 20));
    return dedupeQuestions(
        genericExamples.map(item => item.example_text),
        currentMessage
    ).slice(0, 4);
}

function wrapSuggestionsReply(title, leadIn, suggestions) {
    return `<b>${title}</b><br><br>${leadIn ? `${escapeHtml(leadIn)}<br><br>` : ''}${buildBulletList(
        suggestions.map(question => escapeHtml(question))
    )}`;
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
    if (value === null || value === undefined || value === '') return 'N/A';
    const number = Number(value);
    if (Number.isNaN(number)) return escapeHtml(value);
    return `Rs. ${number.toLocaleString('en-PK')}`;
}

function formatDate(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleDateString('en-PK', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function formatTime(value) {
    if (!value) return 'N/A';
    const raw = typeof value === 'string' ? value : String(value);
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return escapeHtml(raw);

    let hours = Number(match[1]);
    const minutes = match[2];
    const suffix = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${suffix}`;
}

function buildBulletList(items) {
    return `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
}

function getProgramMappings() {
    return [
        { keywords: ['bscs', 'bs cs', 'computer science'], program: 'BS Computer Science' },
        { keywords: ['bs software engineering', 'software engineering', 'bsse', 'bs se'], program: 'BS Software Engineering' },
        { keywords: ['bs information technology', 'information technology', 'bsit', 'bs it'], program: 'BS Information Technology' },
        { keywords: ['ms computer science', 'ms cs'], program: 'MS Computer Science' },
        { keywords: ['phd computer science', 'phd cs'], program: 'PhD Computer Science' },
        { keywords: ['bba', 'business administration'], program: 'BBA' },
        { keywords: ['mba'], program: 'MBA' },
        { keywords: ['management sciences', 'ms management sciences'], program: 'MS Management Sciences' },
        { keywords: ['bs mathematics', 'mathematics', 'bs math'], program: 'BS Mathematics' },
        { keywords: ['bs physics', 'physics'], program: 'BS Physics' },
        { keywords: ['bs commerce', 'commerce'], program: 'BS Commerce' }
    ];
}

function detectProgramName(message = '') {
    const text = message.toLowerCase();
    const match = getProgramMappings().find(entry =>
        entry.keywords.some(keyword => text.includes(keyword))
    );
    return match ? match.program : null;
}

function detectProgramLevel(message = '') {
    const text = message.toLowerCase();
    if (text.includes('phd')) return 'PhD';
    if (text.includes('ms ') || text.startsWith('ms') || text.includes('masters')) return 'MS';
    if (text.includes('bs ') || text.startsWith('bs') || text.includes('bachelor') || text.includes('undergraduate')) return 'BS';
    return null;
}

function detectDepartmentName(message = '') {
    const text = message.toLowerCase();
    const mapping = [
        { keywords: ['computer science', 'cs department', 'it department', 'software engineering department'], department: 'Computer Science and IT' },
        { keywords: ['business administration', 'bba department', 'management sciences department'], department: 'Business Administration' },
        { keywords: ['mathematics', 'math department'], department: 'Mathematics' },
        { keywords: ['physics'], department: 'Physics' },
        { keywords: ['chemistry'], department: 'Chemistry' },
        { keywords: ['english'], department: 'English' },
        { keywords: ['urdu'], department: 'Urdu' },
        { keywords: ['islamic studies'], department: 'Islamic Studies' },
        { keywords: ['commerce'], department: 'Commerce' },
        { keywords: ['economics'], department: 'Economics' }
    ];

    const match = mapping.find(entry => entry.keywords.some(keyword => text.includes(keyword)));
    if (match) return match.department;

    const programName = detectProgramName(message);
    if (programName && programName.includes('Computer Science')) return 'Computer Science and IT';
    if (programName === 'BS Software Engineering' || programName === 'BS Information Technology') return 'Computer Science and IT';
    if (programName === 'BBA' || programName === 'MBA' || programName === 'MS Management Sciences') return 'Business Administration';
    if (programName === 'BS Mathematics') return 'Mathematics';
    if (programName === 'BS Physics') return 'Physics';
    if (programName === 'BS Commerce') return 'Commerce';

    return null;
}

function detectHostelType(message = '') {
    const text = message.toLowerCase();
    if (text.includes('girls hostel') || text.includes('female hostel') || text.includes('for girls')) {
        return 'Girls';
    }
    if (text.includes('boys hostel') || text.includes('male hostel') || text.includes('for boys')) {
        return 'Boys';
    }
    return null;
}

function detectRouteKeyword(message = '') {
    const text = message.toLowerCase();
    const areas = [
        'model town', 'satellite town', 'wapda town', 'gt road', 'kamoke road',
        'peoples colony', 'gulberg', 'allama iqbal colony', 'civil lines',
        'cantonment', 'jail road', 'gondlanwala', 'khiali', 'sialkot road',
        'eminabad', 'fatehabad', 'kamoke', 'muridke', 'hafizabad', 'kanjranwala',
        'ravi road', 'shapur', 'jinnah colony', 'rehmanpura', 'city center'
    ];

    return areas.find(area => text.includes(area)) || null;
}

function detectEventCategory(intent, message = '') {
    const text = message.toLowerCase();

    if (intent === 'ask_orientation' || text.includes('orientation')) {
        return { type: 'Administrative', nameLike: '%Orientation%' };
    }

    if (text.includes('workshop')) {
        return { type: 'Workshop' };
    }

    if (text.includes('seminar') || text.includes('lecture') || text.includes('expo')) {
        return { type: 'Academic' };
    }

    if (text.includes('sports')) {
        return { type: 'Sports' };
    }

    if (text.includes('cultural')) {
        return { type: 'Cultural' };
    }

    if (text.includes('job fair') || text.includes('career')) {
        return { type: 'Career' };
    }

    if (text.includes('research')) {
        return { type: 'Research' };
    }

    return null;
}

async function getDepartmentAnswer(intent, message, pool) {
    const departmentName = detectDepartmentName(message);

    if (departmentName) {
        const result = await pool.request()
            .input('departmentName', sql.VarChar, departmentName)
            .query(`
                SELECT TOP 1 dept_name, head_name, contact_number, email, block_location, room_number, office_hours
                FROM departments
                WHERE dept_name = @departmentName
            `);

        if (result.recordset.length === 0) return null;

        const dept = result.recordset[0];
        return `<b>${escapeHtml(dept.dept_name)} Department</b><br><br>${buildBulletList([
            `<b>Head:</b> ${escapeHtml(dept.head_name || 'Not listed')}`,
            `<b>Contact:</b> ${escapeHtml(dept.contact_number || 'Not listed')}`,
            `<b>Email:</b> ${escapeHtml(dept.email || 'Not listed')}`,
            `<b>Location:</b> ${escapeHtml(`${dept.block_location || 'Block N/A'}${dept.room_number ? `, Room ${dept.room_number}` : ''}`)}`,
            `<b>Office Hours:</b> ${escapeHtml(dept.office_hours || 'Not listed')}`
        ])}`;
    }

    const result = await pool.request().query(`
        SELECT dept_name, head_name, block_location, room_number
        FROM departments
        ORDER BY dept_name
    `);

    if (result.recordset.length === 0) return null;

    return `<b>PUGC Departments</b><br><br>${buildBulletList(
        result.recordset.map(dept =>
            `<b>${escapeHtml(dept.dept_name)}:</b> HOD ${escapeHtml(dept.head_name || 'Not listed')}, ${escapeHtml(dept.block_location || 'Location N/A')}${dept.room_number ? `, Room ${escapeHtml(dept.room_number)}` : ''}`
        )
    )}`;
}

async function getProgramsAnswer(intent, message, pool) {
    const programName = detectProgramName(message);
    const level = detectProgramLevel(message);

    if (programName || ['ask_program_duration', 'ask_credit_hours', 'ask_bs_cs_details', 'ask_bba_details'].includes(intent)) {
        const result = await pool.request()
            .input('programName', sql.VarChar, programName || '')
            .query(`
                SELECT TOP 1 p.program_name, p.program_level, p.duration_years, p.total_semesters,
                       p.total_credit_hrs, p.total_seats, p.description, d.dept_name
                FROM programs p
                JOIN departments d ON p.department_id = d.department_id
                WHERE p.is_active = 1
                  AND (@programName = '' OR p.program_name = @programName)
                ORDER BY p.program_name
            `);

        if (result.recordset.length > 0) {
            const program = result.recordset[0];
            return `<b>${escapeHtml(program.program_name)}</b><br><br>${buildBulletList([
                `<b>Level:</b> ${escapeHtml(program.program_level)}`,
                `<b>Department:</b> ${escapeHtml(program.dept_name)}`,
                `<b>Duration:</b> ${escapeHtml(program.duration_years)} years`,
                `<b>Total Semesters:</b> ${escapeHtml(program.total_semesters)}`,
                `<b>Credit Hours:</b> ${escapeHtml(program.total_credit_hrs)}`,
                `<b>Seats:</b> ${escapeHtml(program.total_seats)}`,
                `<b>Overview:</b> ${escapeHtml(program.description || 'Not listed')}`
            ])}`;
        }
    }

    const request = pool.request();
    let query = `
        SELECT p.program_name, p.program_level, d.dept_name
        FROM programs p
        JOIN departments d ON p.department_id = d.department_id
        WHERE p.is_active = 1
    `;

    if (level) {
        request.input('level', sql.VarChar, level);
        query += ' AND p.program_level = @level';
    }

    query += ' ORDER BY p.program_level, p.program_name';
    const result = await request.query(query);
    if (result.recordset.length === 0) return null;

    const heading = level ? `${level} Programs at PUGC` : 'Programs at PUGC';
    return `<b>${escapeHtml(heading)}</b><br><br>${buildBulletList(
        result.recordset.map(program =>
            `<b>${escapeHtml(program.program_name)}:</b> ${escapeHtml(program.program_level)} program in ${escapeHtml(program.dept_name)}`
        )
    )}`;
}

async function getFeesAnswer(message, pool) {
    const programName = detectProgramName(message);

    if (programName) {
        const result = await pool.request()
            .input('programName', sql.VarChar, programName)
            .query(`
                SELECT p.program_name, ft.fee_type_name, fs.amount
                FROM fee_structure fs
                JOIN programs p ON fs.program_id = p.program_id
                JOIN fee_types ft ON fs.fee_type_id = ft.fee_type_id
                WHERE p.program_name = @programName
                  AND fs.effective_to IS NULL
                ORDER BY ft.fee_type_name
            `);

        if (result.recordset.length === 0) return null;

        const total = result.recordset.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        return `<b>${escapeHtml(programName)} Fee Structure</b><br><br>${buildBulletList([
            ...result.recordset.map(row => `<b>${escapeHtml(row.fee_type_name)}:</b> ${formatCurrency(row.amount)}`),
            `<b>Total Semester Fee:</b> ${formatCurrency(total)}`
        ])}`;
    }

    const result = await pool.request().query(`
        SELECT TOP 8 program_name, program_level, dept_name, total_semester_fee
        FROM vw_total_fee_per_program
        ORDER BY program_level, program_name
    `);

    if (result.recordset.length === 0) return null;

    return `<b>PUGC Fee Overview</b><br><br>${buildBulletList(
        result.recordset.map(row =>
            `<b>${escapeHtml(row.program_name)}:</b> ${formatCurrency(row.total_semester_fee)} per semester (${escapeHtml(row.dept_name)})`
        )
    )}`;
}

async function getFeeScheduleAnswer(intent, message, pool) {
    const programName = detectProgramName(message);
    const request = pool.request();
    let query = `
        SELECT TOP 6 p.program_name, sem.semester_name, fs.due_date, fs.late_fee_per_day, fs.grace_period_days
        FROM fee_schedule fs
        JOIN programs p ON fs.program_id = p.program_id
        JOIN semesters sem ON fs.semester_id = sem.semester_id
        WHERE 1 = 1
    `;

    if (programName) {
        request.input('programName', sql.VarChar, programName);
        query += ' AND p.program_name = @programName';
    }

    query += ' ORDER BY fs.due_date DESC';
    const result = await request.query(query);
    if (result.recordset.length === 0) return null;

    const heading = intent === 'ask_late_fee' ? 'Late Fee Policy' : 'Fee Schedule';
    return `<b>${heading}</b><br><br>${buildBulletList(
        result.recordset.map(row =>
            `<b>${escapeHtml(row.program_name)} - ${escapeHtml(row.semester_name)}:</b> Due ${formatDate(row.due_date)}, late fee ${formatCurrency(row.late_fee_per_day)} per day, grace period ${escapeHtml(row.grace_period_days ?? '0')} days`
        )
    )}`;
}

async function getScholarshipAnswer(pool) {
    const result = await pool.request().query(`
        SELECT TOP 6 type_name, funding_source, benefit_percentage,
               min_cgpa_required, max_family_income, semester_name,
               application_deadline, max_beneficiaries
        FROM vw_active_scholarships
        ORDER BY application_deadline DESC
    `);

    if (result.recordset.length === 0) return null;

    return `<b>Scholarship Opportunities</b><br><br>${buildBulletList(
        result.recordset.map(row =>
            `<b>${escapeHtml(row.type_name)}:</b> ${row.benefit_percentage ? `${escapeHtml(row.benefit_percentage)}% benefit, ` : ''}deadline ${formatDate(row.application_deadline)}, semester ${escapeHtml(row.semester_name)}, minimum CGPA ${escapeHtml(row.min_cgpa_required ?? 'Not listed')}`
        )
    )}`;
}

async function getHostelAnswer(intent, message, pool) {
    const hostelType = detectHostelType(message);

    if (intent === 'ask_hostel_facilities') {
        const request = pool.request();
        let query = `
            SELECT h.hostel_name, ht.type_name AS hostel_type, h.facilities, h.warden_name, h.warden_contact
            FROM hostels h
            JOIN hostel_types ht ON h.hostel_type_id = ht.hostel_type_id
            WHERE h.is_active = 1
        `;
        if (hostelType) {
            request.input('hostelType', sql.VarChar, hostelType);
            query += ' AND ht.type_name LIKE @hostelType + \'%\'';
        }
        query += ' ORDER BY h.hostel_name';
        const result = await request.query(query);
        if (result.recordset.length === 0) return null;

        return `<b>Hostel Facilities</b><br><br>${buildBulletList(
            result.recordset.map(row =>
                `<b>${escapeHtml(row.hostel_name)}:</b> ${escapeHtml(row.facilities || 'Facilities not listed')}<br><b>Warden:</b> ${escapeHtml(row.warden_name || 'Not listed')} (${escapeHtml(row.warden_contact || 'Not listed')})`
            )
        )}`;
    }

    const request = pool.request();
    let query = `
        SELECT h.hostel_name, ht.type_name AS hostel_type, rt.sharing_type, rt.occupancy,
               hr.total_rooms, hr.available_rooms, hr.additional_fee,
               h.monthly_fee_meal, h.monthly_fee_no_meal, h.security_deposit,
               h.warden_name, h.warden_contact
        FROM hostel_rooms hr
        JOIN hostels h ON hr.hostel_id = h.hostel_id
        JOIN hostel_types ht ON h.hostel_type_id = ht.hostel_type_id
        JOIN room_types rt ON hr.room_type_id = rt.room_type_id
        WHERE h.is_active = 1
    `;

    if (hostelType) {
        request.input('hostelType', sql.VarChar, hostelType);
        query += ' AND ht.type_name LIKE @hostelType + \'%\'';
    }

    query += ' ORDER BY hostel_name, occupancy';
    const result = await request.query(query);
    if (result.recordset.length === 0) return null;

    const heading = intent === 'ask_hostel_warden' ? 'Hostel Wardens' : 'Hostel Availability';
    return `<b>${heading}</b><br><br>${buildBulletList(
        result.recordset.map(row =>
            `<b>${escapeHtml(row.hostel_name)} (${escapeHtml(row.sharing_type)}):</b> ${escapeHtml(row.available_rooms)} of ${escapeHtml(row.total_rooms)} rooms available, occupancy ${escapeHtml(row.occupancy)}, meal plan ${formatCurrency(row.monthly_fee_meal)}, without meal ${formatCurrency(row.monthly_fee_no_meal)}, security deposit ${formatCurrency(row.security_deposit)},${row.additional_fee ? ` additional room fee ${formatCurrency(row.additional_fee)},` : ''} warden ${escapeHtml(row.warden_name || 'Not listed')} (${escapeHtml(row.warden_contact || 'Not listed')})`
        )
    )}`;
}

async function getEventsAnswer(intent, message, pool) {
    const category = detectEventCategory(intent, message);
    const upcomingRequest = pool.request();
    let upcomingQuery = `
        SELECT TOP 6 event_name, event_type, event_date, event_end_date, venue,
               description, registration_required, registration_deadline, semester_name
        FROM vw_upcoming_events
        WHERE 1 = 1
    `;

    if (category?.type) {
        upcomingRequest.input('eventType', sql.VarChar, category.type);
        upcomingQuery += ' AND event_type = @eventType';
    }

    if (category?.nameLike) {
        upcomingRequest.input('eventNameLike', sql.VarChar, category.nameLike);
        upcomingQuery += ' AND event_name LIKE @eventNameLike';
    }

    if (intent === 'ask_event_registration' || intent === 'ask_event_eligibility') {
        upcomingQuery += ' AND registration_required = 1';
    }

    upcomingQuery += ' ORDER BY event_date ASC';
    const upcomingResult = await upcomingRequest.query(upcomingQuery);

    if (upcomingResult.recordset.length > 0) {
        const heading = intent === 'ask_orientation' ? 'Upcoming Orientation Events' : 'Upcoming PUGC Events';
        return `<b>${heading}</b><br><br>${buildBulletList(
            upcomingResult.recordset.map(row => {
                const details = [
                    `<b>Date:</b> ${formatDate(row.event_date)}`,
                    row.event_end_date && String(row.event_end_date) !== String(row.event_date) ? `<b>Ends:</b> ${formatDate(row.event_end_date)}` : null,
                    `<b>Type:</b> ${escapeHtml(row.event_type)}`,
                    row.venue ? `<b>Venue:</b> ${escapeHtml(row.venue)}` : null,
                    row.semester_name ? `<b>Semester:</b> ${escapeHtml(row.semester_name)}` : null,
                    row.registration_required ? `<b>Registration:</b> Required${row.registration_deadline ? ` by ${formatDate(row.registration_deadline)}` : ''}` : '<b>Registration:</b> Not required',
                    row.description ? `<b>Details:</b> ${escapeHtml(row.description)}` : null
                ].filter(Boolean).join('<br>');

                return `<b>${escapeHtml(row.event_name)}:</b><br>${details}`;
            })
        )}`;
    }

    // If there are no future rows, show the user that current event data is outdated instead of presenting old events as upcoming.
    const historyRequest = pool.request();
    let historyQuery = `
        SELECT TOP 3 e.event_name, et.type_name AS event_type, e.event_date, e.venue, e.registration_required
        FROM events e
        JOIN event_types et ON e.event_type_id = et.event_type_id
        WHERE e.is_active = 1
    `;

    if (category?.type) {
        historyRequest.input('historyEventType', sql.VarChar, category.type);
        historyQuery += ' AND et.type_name = @historyEventType';
    }

    if (category?.nameLike) {
        historyRequest.input('historyNameLike', sql.VarChar, category.nameLike);
        historyQuery += ' AND e.event_name LIKE @historyNameLike';
    }

    if (intent === 'ask_event_registration' || intent === 'ask_event_eligibility') {
        historyQuery += ' AND e.registration_required = 1';
    }

    historyQuery += ' ORDER BY e.event_date DESC';
    const historyResult = await historyRequest.query(historyQuery);

    const latestDate = historyResult.recordset[0]?.event_date;
    const latestDateText = latestDate ? formatDate(latestDate) : 'N/A';
    const categoryLabel = category?.type ? `${category.type.toLowerCase()} ` : '';

    if (historyResult.recordset.length > 0) {
        return `<b>No Upcoming ${escapeHtml(categoryLabel ? `${category.type} Events` : 'Events')}</b><br><br>${buildBulletList([
            `There are no upcoming ${escapeHtml(categoryLabel)}event records in the current database as of <b>${formatDate(new Date())}</b>.`,
            `The latest matching event record in the database is from <b>${latestDateText}</b>, so I am not showing it as an upcoming event.`,
            `<b>Latest stored records:</b><br>${historyResult.recordset.map(row => `${escapeHtml(row.event_name)} (${formatDate(row.event_date)})`).join('<br>')}`,
            `Please update the <b>events</b> table from the admin side or contact PUGC at <b>055-9200001</b> for the latest event schedule.`
        ])}`;
    }

    return `<b>No Event Data Available</b><br><br>${buildBulletList([
        `There are no matching event records in the current database as of <b>${formatDate(new Date())}</b>.`,
        `Please update the <b>events</b> table from the admin side before using dynamic event answers.`,
        `For confirmation, contact PUGC at <b>055-9200001</b>.`
    ])}`;
}

async function getLibraryAnswer(intent, pool) {
    const result = await pool.request().query(`
        SELECT resource_type, borrow_limit, borrow_period_days, fine_per_day, fine_after_days, description
        FROM library_resources
        ORDER BY resource_id
    `);

    if (result.recordset.length === 0) return null;

    const items = result.recordset.map(row => {
        const parts = [];
        if (row.borrow_limit !== null) parts.push(`limit ${escapeHtml(row.borrow_limit)}`);
        if (row.borrow_period_days !== null && row.borrow_period_days > 0) parts.push(`period ${escapeHtml(row.borrow_period_days)} days`);
        if (row.fine_per_day !== null) parts.push(`fine ${formatCurrency(row.fine_per_day)} per day after ${escapeHtml(row.fine_after_days || 0)} days`);
        if (row.description) parts.push(escapeHtml(row.description));
        return `<b>${escapeHtml(row.resource_type)}:</b> ${parts.join(', ')}`;
    });

    const heading = intent === 'ask_library_fine' ? 'Library Fine and Borrowing Rules' : 'PUGC Library Borrowing Rules';
    return `<b>${heading}</b><br><br>${buildBulletList(items)}`;
}

async function getTransportAnswer(message, pool) {
    const routeKeyword = detectRouteKeyword(message);
    const request = pool.request();
    let query = `
        SELECT route_name, route_number, coverage_area, morning_pickup, evening_drop, distance_km, monthly_fee
        FROM transport_routes
        WHERE is_active = 1
    `;

    if (routeKeyword) {
        request.input('routeKeyword', sql.VarChar, `%${routeKeyword}%`);
        query += ' AND coverage_area LIKE @routeKeyword';
    }

    query += ' ORDER BY route_number';
    const result = await request.query(query);
    if (result.recordset.length === 0) return null;

    return `<b>PUGC Transport Routes</b><br><br>${buildBulletList(
        result.recordset.map(row =>
            `<b>Route ${escapeHtml(row.route_number)} - ${escapeHtml(row.route_name)}:</b> Covers ${escapeHtml(row.coverage_area || 'Area not listed')}, pickup ${formatTime(row.morning_pickup)}, drop ${formatTime(row.evening_drop)}, fee ${formatCurrency(row.monthly_fee)}`
        )
    )}`;
}

async function getDynamicAnswer(intent, message, pool) {
    const handler = DYNAMIC_INTENT_HANDLERS[intent];
    if (!handler) return null;

    switch (handler) {
        case 'departments':
        case 'department_details':
            return getDepartmentAnswer(intent, message, pool);
        case 'programs':
        case 'program_details':
            return getProgramsAnswer(intent, message, pool);
        case 'fees':
            return getFeesAnswer(message, pool);
        case 'fee_schedule':
            return getFeeScheduleAnswer(intent, message, pool);
        case 'scholarships':
            return getScholarshipAnswer(pool);
        case 'hostels':
            return getHostelAnswer(intent, message, pool);
        case 'events':
            return getEventsAnswer(intent, message, pool);
        case 'library':
            return getLibraryAnswer(intent, pool);
        case 'transport':
            return getTransportAnswer(message, pool);
        default:
            return null;
    }
}

function cleanMessageText(text = '') {
    return String(text).replace(/<[^>]*>/g, '').trim();
}

function isTransientBotMessage(msg) {
    const text = cleanMessageText(msg?.text).toLowerCase();
    return msg?.sender === 'bot' && (
        text === 'ai is thinking...' ||
        text === 'ai is thinking' ||
        text === 'typing...' ||
        text === 'loading...'
    );
}

function sanitizeHistory(history) {
    if (!Array.isArray(history)) return [];
    // Drop temporary UI messages before using history for context or Groq prompts.
    return history
        .filter(msg => msg && !isTransientBotMessage(msg))
        .map(msg => ({
            sender: msg.sender,
            text: cleanMessageText(msg.text)
        }))
        .filter(msg => msg.text.length > 0);
}

function buildConversationHistory(history) {
    if (!history || history.length === 0) return [];
    return history.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
    }));
}

function isVagueMessage(message) {
    const vaguePatterns = [
        /\bit\b/i,          // any message containing "it"
        /\bthis\b/i,        // any message containing "this"
        /\bthat\b/i,        // any message containing "that"
        /\bsame\b/i,        // any message containing "same"
        /\bits\b/i,         // any message containing "its"
        /tell me more/i,
        /what else/i,
        /elaborate/i,
        /explain more/i,
        /more details/i,
        /and the fee/i,
        /what about/i
    ];
    return vaguePatterns.some(p => p.test(message.trim()));
}

function getLastBotTopic(history) {
    if (!history || history.length === 0) return null;

    // Get last user message topic for better context
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].sender === 'bot') {
            const text = history[i].text;
            // Get first meaningful line
            const lines = text.split('\n').filter(l => l.trim().length > 3);
            if (lines.length > 0) {
                // Return first 5 words of first line as topic
                const words = lines[0].trim().split(' ').slice(0, 5).join(' ');
                return words;
            }
        }
    }
    return null;
}

async function sendDBAnswerOrRefinedResponse(
    pool,
    res,
    message,
    dbAnswer,
    conversationHistory,
    source,
    allowRefinement = true,
    primaryIntent = null,
    fallbackIntents = []
) {
    // Prefer database facts, then let Groq present them in a friendlier form.
    const relevant = await isAnswerRelevant(message, dbAnswer, conversationHistory);
    const suggestedQuestions = await buildSuggestedQuestions(pool, primaryIntent, message, fallbackIntents);

    if (relevant) {
        console.log(`Source: ${source}, refining DB answer for presentation`);
        const refinedAnswer = await refineAnswerWithDBContext(message, dbAnswer, conversationHistory);
        return res.json({ reply: refinedAnswer || dbAnswer, source: `${source}_refined`, suggestedQuestions });
    }

    if (!allowRefinement) {
        console.log(`Source: ${source} not relevant, using grounded Groq fallback`);
        const groqAnswer = await getGroundedGroqResponse(message, dbAnswer, conversationHistory);
        if (groqAnswer) {
            return res.json({ reply: groqAnswer, source: 'groq_grounded', suggestedQuestions });
        }

        return res.json({ reply: dbAnswer, source, suggestedQuestions });
    }

    console.log(`Source: ${source} not directly relevant, refining with Groq`);
    const refinedAnswer = await refineAnswerWithDBContext(message, dbAnswer, conversationHistory);
    if (refinedAnswer) {
        return res.json({ reply: refinedAnswer, source: `${source}_refined`, suggestedQuestions });
    }

    return res.json({ reply: dbAnswer, source, suggestedQuestions });
}

router.post('/chat', async (req, res) => {
    const { message, history } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        const pool = await getPool();
        const cleanHistory = sanitizeHistory(history);
        let extractedIntent = null;

        // Build conversation history for Groq context
        const conversationHistory = buildConversationHistory(cleanHistory);

        // Enrich vague messages with context from history
        let enrichedMessage = message;
        if (isVagueMessage(message) && cleanHistory.length > 0) {
            const lastTopic = getLastBotTopic(cleanHistory);
            if (lastTopic) {
                enrichedMessage = `${message} ${lastTopic}`;
                console.log(`Enriched message: ${enrichedMessage}`);
            }
        }

        // LAYER 1: Rasa intent detection (use enriched message)
        const rasaResponse = await axios.post(
            `${process.env.RASA_URL}/model/parse`,
            { text: enrichedMessage }
        );

        const intent = rasaResponse.data.intent.name;
        const confidence = rasaResponse.data.intent.confidence;

        console.log(`Intent: ${intent} | Confidence: ${confidence}`);

        // LAYER 2: structured table lookup first, then FAQ lookup with the same intent.
        if (confidence >= 0.5) {
            const dynamicAnswer = await getDynamicAnswer(intent, enrichedMessage, pool);
            if (dynamicAnswer) {
                return await sendDBAnswerOrRefinedResponse(
                    pool,
                    res,
                    enrichedMessage,
                    dynamicAnswer,
                    conversationHistory,
                    'rasa_dynamic',
                    true,
                    intent
                );
            }

            const dbAnswer = await getAnswerFromDB(intent, pool);
            if (dbAnswer) {
                return await sendDBAnswerOrRefinedResponse(
                    pool,
                    res,
                    enrichedMessage,
                    dbAnswer,
                    conversationHistory,
                    'rasa_db',
                    true,
                    intent
                );
            }

            // Rasa confident but no DB answer
            if (confidence >= 0.50) {
                console.log('Rasa confident but no DB answer, Groq general...');
                const groqAnswer = await getGroqResponse(message, conversationHistory);
                if (groqAnswer) {
                    const suggestedQuestions = await buildSuggestedQuestions(pool, intent, message, [extractedIntent]);
                    return res.json({ reply: groqAnswer, source: 'groq_general', suggestedQuestions });
                }
            }
        }

        // LAYER 3: Groq extracts intent → DB lookup
        console.log('Trying Groq intent extraction...');
        extractedIntent = await extractIntentFromQuestion(enrichedMessage);
        console.log(`Groq extracted intent: ${extractedIntent}`);

        if (extractedIntent) {
            const dynamicAnswer = await getDynamicAnswer(extractedIntent, enrichedMessage, pool);
            if (dynamicAnswer) {
                return await sendDBAnswerOrRefinedResponse(
                    pool,
                    res,
                    enrichedMessage,
                    dynamicAnswer,
                    conversationHistory,
                    'groq_dynamic',
                    false,
                    extractedIntent,
                    [intent]
                );
            }

            const dbAnswer = await getAnswerFromDB(extractedIntent, pool);
            if (dbAnswer) {
                return await sendDBAnswerOrRefinedResponse(
                    pool,
                    res,
                    enrichedMessage,
                    dbAnswer,
                    conversationHistory,
                    'groq_db',
                    false,
                    extractedIntent,
                    [intent]
                );
            }
        }

        // LAYER 4: Groq general response with conversation history
        console.log('Trying Groq general response...');
        const groqAnswer = await getGroqResponse(message, conversationHistory);
        if (groqAnswer) {
            console.log('Source: Groq general');
            const suggestedQuestions = await buildSuggestedQuestions(pool, extractedIntent || intent, message);
            return res.json({ reply: groqAnswer, source: 'groq', suggestedQuestions });
        }

        // LAYER 5: Final fallback
        const suggestionIntent = extractedIntent || intent || null;
        const suggestions = await getTrainingExampleSuggestions(pool, suggestionIntent, 5);
        if (suggestions.length > 0) {
            const suggestedQuestions = dedupeQuestions(
                suggestions.map(item => item.example_text),
                message
            ).slice(0, 4);
            return res.json({
                reply: wrapSuggestionsReply(
                    'I May Have Missed Your Question',
                    'Would you like me to help with one of these related topics?',
                    suggestedQuestions
                ),
                source: 'training_examples',
                suggestedQuestions
            });
        }

        const fallbackSuggestions = await buildSuggestedQuestions(pool, suggestionIntent, message);
        return res.json({
            reply: '<b>Sorry, I could not find an answer.</b><br><br>Please contact PUGC directly:<br>Phone: <b>055-9200001</b><br>Email: info@pugc.edu.pk',
            source: 'fallback',
            suggestedQuestions: fallbackSuggestions
        });

    } catch (error) {
        console.error('Full error:', error);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

module.exports = router;
