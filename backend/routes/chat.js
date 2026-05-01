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
const { logChat } = require('../chat_logger');

const DYNAMIC_INTENT_HANDLERS = {
    // Departments
    ask_department_list: 'departments',
    ask_cs_department: 'department_details',
    ask_bba_department: 'department_details',
    ask_hod_contact: 'department_details',
    ask_department_office_hours: 'department_details',
    ask_dean_contact: 'department_details',
    // Programs
    ask_available_programs: 'programs',
    ask_bs_cs_details: 'program_details',
    ask_bba_details: 'program_details',
    ask_program_duration: 'program_details',
    ask_credit_hours: 'program_details',
    ask_ms_program: 'programs',
    ask_phd_program: 'programs',
    ask_bs_math_details: 'program_details',
    ask_bs_english_details: 'program_details',
    // Fees
    ask_tuition_fee: 'fees',
    ask_cs_fee: 'fees',
    ask_bba_fee: 'fees',
    ask_fee_deadline: 'fee_schedule',
    ask_late_fee: 'fee_schedule',
    // Scholarships
    ask_scholarship: 'scholarships',
    ask_scholarship_deadline: 'scholarships',
    ask_scholarship_renewal: 'scholarships',
    ask_scholarship_cancellation: 'scholarships',
    // Hostels
    ask_hostel_availability: 'hostels',
    ask_hostel_fee: 'hostels',
    ask_hostel_facilities: 'hostels',
    ask_hostel_warden: 'hostels',
    // Events
    ask_semester_events: 'events',
    ask_orientation: 'events',
    ask_event_registration: 'events',
    ask_event_eligibility: 'events',
    ask_department_events: 'events',
    // Library
    ask_library_books: 'library',
    ask_library_fine: 'library',
    ask_library_general: 'library',
    ask_library_location: 'library',
    ask_library_membership: 'library',
    ask_library_hours: 'library',
    // Transport
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

function missingDataAnswer(text) {
    return { text, answerStatus: 'missing_data' };
}

function getAnswerText(answer) {
    return typeof answer === 'object' && answer !== null && 'text' in answer
        ? answer.text
        : answer;
}

function getAnswerStatus(answer) {
    return typeof answer === 'object' && answer !== null
        ? answer.answerStatus || 'answered'
        : 'answered';
}

const LOOKUP_STOP_WORDS = new Set([
    'the', 'a', 'an', 'of', 'for', 'to', 'is', 'are', 'in', 'at', 'on', 'with', 'and',
    'or', 'do', 'does', 'did', 'can', 'i', 'we', 'you', 'it', 'this', 'that', 'these',
    'those', 'about', 'please', 'tell', 'me', 'what', 'which', 'who', 'when', 'where',
    'how', 'many', 'much', 'any', 'there', 'from', 'by', 'be', 'my', 'their', 'our',
    'its', 'have', 'has', 'had', 'offer', 'offered', 'available'
]);

function normalizeLookupText(value = '') {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function compactLookupText(value = '') {
    return normalizeLookupText(value).replace(/\s+/g, '');
}

function extractMeaningfulTokens(value = '') {
    return normalizeLookupText(value)
        .split(' ')
        .filter(token => token && token.length > 1 && !LOOKUP_STOP_WORDS.has(token));
}

function hasSpecificUnknownSubject(message = '', domainWords = []) {
    const domainSet = new Set(domainWords);
    return extractMeaningfulTokens(message)
        .filter(token => !domainSet.has(token))
        .some(token => token.length >= 4);
}

function hasUnknownSpecificProgramRequest(message = '', catalog = null) {
    const normalized = normalizeLookupText(message);
    const hasProgramContext = /\b(program|course|degree|bs|ms|phd|bachelor|master|study)\b/.test(normalized);
    if (!hasProgramContext) return false;

    const programMatch = catalog
        ? findBestCatalogMatch(
            message,
            catalog.programs.map(program => ({ ...program, name: program.program_name })),
            item => buildProgramAliases(item.program_name),
            50
        )
        : null;

    if (programMatch) return false;

    return hasSpecificUnknownSubject(message, [
        'program', 'programs', 'course', 'degree', 'available', 'offer', 'offered', 'study',
        'pugc', 'punjab', 'university', 'campus', 'bs', 'ms', 'phd', 'bachelor', 'master',
        'details', 'detail', 'list', 'fee', 'fees', 'tuition', 'charges', 'cost', 'structure',
        'semester', 'total', 'what'
    ]);
}

function addAlias(set, value) {
    const normalized = normalizeLookupText(value);
    if (normalized) {
        set.add(normalized);
        set.add(compactLookupText(normalized));
    }
}

function buildAcronym(words = []) {
    return words
        .filter(Boolean)
        .map(word => word[0])
        .join('')
        .toLowerCase();
}

function buildProgramAliases(name = '') {
    const aliases = new Set();
    const normalized = normalizeLookupText(name);
    const words = normalized.split(' ').filter(Boolean);

    addAlias(aliases, name);

    if (words.length > 1) {
        addAlias(aliases, words.join(' '));
        addAlias(aliases, words.slice(1).join(' '));
        addAlias(aliases, `${words[0]} ${words.slice(1).join(' ')}`);

        const acronym = buildAcronym(words);
        if (acronym.length >= 2) aliases.add(acronym);

        const trimmedWords = words.filter(word => !['bs', 'ms', 'phd'].includes(word));
        if (trimmedWords.length > 0) {
            addAlias(aliases, trimmedWords.join(' '));
            const trimmedAcronym = buildAcronym(trimmedWords);
            if (trimmedAcronym.length >= 2) aliases.add(trimmedAcronym);
        }
    }

    return Array.from(aliases).filter(Boolean);
}

function buildDepartmentAliases(name = '') {
    const aliases = new Set();
    const normalized = normalizeLookupText(name);
    const words = normalized.split(' ').filter(Boolean);

    addAlias(aliases, name);
    if (words.length > 1) {
        addAlias(aliases, words.join(' '));
        addAlias(aliases, words.filter(word => word !== 'department').join(' '));
        const acronym = buildAcronym(words.filter(word => !['and'].includes(word)));
        if (acronym.length >= 2) aliases.add(acronym);
    }

    return Array.from(aliases).filter(Boolean);
}

function buildGenericAliases(name = '') {
    const aliases = new Set();
    addAlias(aliases, name);
    const words = normalizeLookupText(name).split(' ').filter(Boolean);
    if (words.length > 1) {
        aliases.add(buildAcronym(words));
    }
    return Array.from(aliases).filter(Boolean);
}

function buildFeeTypeAliases(name = '') {
    const aliases = new Set();
    const normalized = normalizeLookupText(name);
    const words = normalized.split(' ').filter(Boolean);

    addAlias(aliases, name);

    if (words.length > 1) {
        addAlias(aliases, words.join(' '));
        addAlias(aliases, words.filter(word => !['fee', 'charges', 'charge', 'fund', 'deposit'].includes(word)).join(' '));
        const acronym = buildAcronym(words);
        if (acronym.length >= 2) aliases.add(acronym);
    }

    if (normalized.includes('admission')) {
        addAlias(aliases, 'admission fee');
        addAlias(aliases, 'admission charges');
    }
    if (normalized.includes('security')) {
        addAlias(aliases, 'security fee');
        addAlias(aliases, 'security deposit');
        addAlias(aliases, 'security');
    }
    if (normalized.includes('tuition')) {
        addAlias(aliases, 'tuition fee');
        addAlias(aliases, 'tuition');
    }
    if (normalized.includes('exam')) {
        addAlias(aliases, 'exam fee');
        addAlias(aliases, 'examination fee');
        addAlias(aliases, 'exam');
    }
    if (normalized.includes('library')) {
        addAlias(aliases, 'library fee');
        addAlias(aliases, 'library');
    }
    if (normalized.includes('lab')) {
        addAlias(aliases, 'lab fee');
        addAlias(aliases, 'lab charges');
        addAlias(aliases, 'laboratory fee');
    }
    if (normalized.includes('sports')) {
        addAlias(aliases, 'sports fee');
        addAlias(aliases, 'sports fund');
    }
    if (normalized.includes('welfare')) {
        addAlias(aliases, 'student welfare');
        addAlias(aliases, 'welfare fee');
    }

    return Array.from(aliases).filter(Boolean);
}

function buildScholarshipTypeAliases(name = '', fundingSource = '') {
    const aliases = new Set();
    const normalized = normalizeLookupText(name);
    const words = normalized.split(' ').filter(Boolean);

    addAlias(aliases, name);
    addAlias(aliases, fundingSource);

    if (words.length > 1) {
        addAlias(aliases, words.join(' '));
        addAlias(aliases, words.filter(word => !['scholarship', 'based'].includes(word)).join(' '));
        const acronym = buildAcronym(words);
        if (acronym.length >= 2) aliases.add(acronym);
    }

    if (normalized.includes('merit')) {
        addAlias(aliases, 'merit scholarship');
        addAlias(aliases, 'merit based');
        addAlias(aliases, 'merit-based');
    }
    if (normalized.includes('need')) {
        addAlias(aliases, 'need based');
        addAlias(aliases, 'need-based');
        addAlias(aliases, 'financial aid');
    }
    if (normalized.includes('hec')) addAlias(aliases, 'hec scholarship');
    if (normalized.includes('peef')) addAlias(aliases, 'peef scholarship');
    if (normalized.includes('ehsaas')) addAlias(aliases, 'ehsaas scholarship');
    if (normalized.includes('special')) addAlias(aliases, 'special scholarship');

    return Array.from(aliases).filter(Boolean);
}

function scoreAliasMatch(message, alias) {
    if (!alias) return 0;
    const normalizedMessage = normalizeLookupText(message);
    const compactMessage = compactLookupText(message);
    const normalizedAlias = normalizeLookupText(alias);
    const compactAlias = compactLookupText(alias);
    const messageTokens = new Set(extractMeaningfulTokens(message));
    const aliasTokens = extractMeaningfulTokens(alias);

    if (normalizedAlias && normalizedMessage.includes(normalizedAlias)) {
        return 100 + normalizedAlias.split(' ').length;
    }

    if (compactAlias && compactAlias.length > 2 && compactMessage.includes(compactAlias)) {
        return 90 + compactAlias.length;
    }

    const overlap = aliasTokens.filter(token => messageTokens.has(token)).length;
    if (overlap > 0) {
        return 40 + overlap * 10;
    }

    return 0;
}

function findBestCatalogMatch(message, items = [], aliasBuilder = buildGenericAliases, minimumScore = 50) {
    let bestMatch = null;
    let bestScore = 0;

    for (const item of items) {
        const aliases = aliasBuilder(item.name || item.program_name || item.dept_name || item.type_name || item.event_name || '');
        const score = aliases.reduce((highest, alias) => Math.max(highest, scoreAliasMatch(message, alias)), 0);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = item;
        }
    }

    return bestScore >= minimumScore ? bestMatch : null;
}

async function loadStructuredCatalog(pool) {
    const [departments, programs, feeTypes, scholarshipTypes, semesters, eventTypes, eventNames] = await Promise.all([
        pool.request().query(`SELECT department_id, dept_name FROM departments ORDER BY dept_name`),
        pool.request().query(`
            SELECT p.program_id, p.program_name, p.program_level, p.department_id, d.dept_name
            FROM programs p
            JOIN departments d ON p.department_id = d.department_id
            WHERE p.is_active = 1
            ORDER BY p.program_name
        `),
        pool.request().query(`SELECT fee_type_id, fee_type_name FROM fee_types ORDER BY fee_type_name`),
        pool.request().query(`
            SELECT scholarship_type_id, type_name, funding_source, min_cgpa_required,
                   max_family_income, benefit_percentage, is_renewable
            FROM scholarship_types
            ORDER BY type_name
        `),
        pool.request().query(`
            SELECT semester_id, semester_name, semester_type, year
            FROM semesters
            ORDER BY year DESC, semester_name
        `),
        pool.request().query(`SELECT event_type_id, type_name FROM event_types ORDER BY type_name`),
        pool.request().query(`
            SELECT TOP 100 e.event_id, e.event_name, et.type_name
            FROM events e
            JOIN event_types et ON e.event_type_id = et.event_type_id
            WHERE e.is_active = 1
            ORDER BY e.event_date DESC
        `)
    ]);

    return {
        departments: departments.recordset,
        programs: programs.recordset,
        feeTypes: feeTypes.recordset,
        scholarshipTypes: scholarshipTypes.recordset,
        semesters: semesters.recordset,
        eventTypes: eventTypes.recordset,
        eventNames: eventNames.recordset
    };
}

function detectDepartmentField(message = '') {
    const text = normalizeLookupText(message);
    if (/\b(program|programs|offer|offered)\b/.test(text)) return 'programs';
    if (/\b(head|hod|chair|dean)\b/.test(text)) return 'head_name';
    if (/\b(contact|phone|number|call|helpline)\b/.test(text)) return 'contact_number';
    if (/\b(email|mail)\b/.test(text)) return 'email';
    if (/\b(room|office room)\b/.test(text)) return 'room_number';
    if (/\b(hours|timing|timings|open)\b/.test(text)) return 'office_hours';
    if (/\b(block|location|where|located|building)\b/.test(text)) return 'block_location';
    return 'summary';
}

function detectProgramField(message = '') {
    const text = normalizeLookupText(message);
    if (/\bfee|fees\b/.test(text)) return 'fees';
    if (/\bcredit\b/.test(text)) return 'total_credit_hrs';
    if (/\bsemester|semesters\b/.test(text)) return 'total_semesters';
    if (/\bduration|years|how long|year\b/.test(text)) return 'duration_years';
    if (/\bseat|seats|capacity|intake\b/.test(text)) return 'total_seats';
    if (/\bdepartment|which department\b/.test(text)) return 'department';
    if (/\blevel|undergraduate|graduate|postgraduate\b/.test(text)) return 'program_level';
    if (/\bdescription|overview|details|about\b/.test(text)) return 'description';
    if (/\bprogram|programs|offer|available\b/.test(text)) return 'list';
    return 'summary';
}

function detectFeeField(message = '', feeTypes = []) {
    const text = normalizeLookupText(message);
    const matchedFeeType = findBestCatalogMatch(
        text,
        feeTypes.map(type => ({ ...type, name: type.fee_type_name })),
        item => buildFeeTypeAliases(item.fee_type_name),
        40
    );

    if (matchedFeeType) {
        return { kind: 'specific_fee_type', feeType: matchedFeeType };
    }
    if (/\beffective from|from when|starts from\b/.test(text)) return { kind: 'effective_from' };
    if (/\beffective to|valid till|until\b/.test(text)) return { kind: 'effective_to' };
    if (/\btotal|overall|semester fee|complete fee|full fee\b/.test(text)) return { kind: 'total' };
    return { kind: 'breakdown' };
}

function detectScholarshipField(message = '') {
    const text = normalizeLookupText(message);
    if (/\bdeadline|last date|apply by\b/.test(text)) return 'application_deadline';
    if (/\binterview\b/.test(text)) return 'interview_date';
    if (/\bannouncement|announce|result\b/.test(text)) return 'announcement_date';
    if (/\bbenefit|percentage|coverage|amount\b/.test(text)) return 'benefit_percentage';
    if (/\bcgpa|criteria|eligibility\b/.test(text)) return 'min_cgpa_required';
    if (/\bincome|family income\b/.test(text)) return 'max_family_income';
    if (/\brenewable|renew\b/.test(text)) return 'is_renewable';
    if (/\bbeneficiaries|students\b/.test(text)) return 'max_beneficiaries';
    if (/\bfunding|funding source|sponsor\b/.test(text)) return 'funding_source';
    if (/\bsemester\b/.test(text)) return 'semester_name';
    return 'summary';
}

function detectScholarshipScope(message = '') {
    const text = normalizeLookupText(message);

    if (/\b(all scholarships|all scholarship|every scholarship|all types of scholarships|scholarship list)\b/.test(text)) {
        return 'all';
    }
    if (/\b(previous|past|history|last|old scholarships|expired scholarships|when was|when did|was it|was interview|was announcement)\b/.test(text)) {
        return 'past';
    }
    if (/\b(current|active|available now|open now|ongoing)\b/.test(text)) {
        return 'current';
    }
    if (/\b(upcoming|future|next|deadline|last date|apply by|coming)\b/.test(text)) {
        return 'future';
    }

    return 'current';
}

function detectSemesterReference(message = '', semesters = []) {
    const normalized = normalizeLookupText(message);
    const yearMatch = normalized.match(/\b(20\d{2})\b/);
    const targetYear = yearMatch ? Number(yearMatch[1]) : null;

    const directMatch = semesters.find(semester => {
        const semesterName = normalizeLookupText(semester.semester_name);
        const semesterType = normalizeLookupText(semester.semester_type || '');
        const hasName = semesterName && normalized.includes(semesterName);
        const hasType = semesterType && normalized.includes(semesterType);
        const hasYear = targetYear ? Number(semester.year) === targetYear : true;
        return (hasName || hasType) && hasYear;
    });

    if (directMatch) return directMatch;

    if (targetYear) {
        const sameYear = semesters.filter(semester => Number(semester.year) === targetYear);
        if (sameYear.length === 1) return sameYear[0];
    }

    return null;
}

function getScholarshipStatus(row) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!row.is_active) return 'Inactive';
    if (!row.application_deadline) return 'Active';

    const deadline = new Date(row.application_deadline);
    deadline.setHours(0, 0, 0, 0);

    return deadline >= today ? 'Open' : 'Closed';
}

function detectEventField(message = '') {
    const text = normalizeLookupText(message);
    if (/\bvenue|where|held\b/.test(text)) return 'venue';
    if (/\bend|ends|finish\b/.test(text)) return 'event_end_date';
    if (/\bdate|when\b/.test(text)) return 'event_date';
    if (/\bregistration deadline|register by|last date to register\b/.test(text)) return 'registration_deadline';
    if (/\bregister|registration|required\b/.test(text)) return 'registration_required';
    if (/\bdescription|details|about\b/.test(text)) return 'description';
    if (/\bsemester\b/.test(text)) return 'semester_name';
    return 'summary';
}

function detectEventTimeScope(message = '') {
    const text = normalizeLookupText(message);

    if (/\b(all events|all event|event list|complete event|full event|every event)\b/.test(text)) {
        return 'all';
    }
    if (/\b(today|current|currently|now|ongoing|happening today|this week|this month)\b/.test(text)) {
        return 'current';
    }
    if (/\b(previous|past|history|last|held before|already happened|old events)\b/.test(text)) {
        return 'past';
    }
    if (/\b(upcoming|future|next|schedule|planned|coming)\b/.test(text)) {
        return 'future';
    }

    return 'future';
}

function formatFieldValue(label, value, formatter = null, suffix = '') {
    const formatted = formatter ? formatter(value) : escapeHtml(value ?? 'Not listed');
    return `<b>${label}:</b> ${formatted}${suffix}`;
}

// Dynamic program detection using live catalog from DB.
// Falls back to alias-based fuzzy matching so any new program added from admin
// is automatically recognized without any code change.
function detectProgramName(message = '', catalogPrograms = []) {
    if (catalogPrograms.length > 0) {
        const match = findBestCatalogMatch(
            message,
            catalogPrograms.map(p => ({ ...p, name: p.program_name })),
            item => buildProgramAliases(item.program_name),
            50
        );
        if (match) return match.program_name;
    }
    // Lightweight static fallback for when catalog is not pre-loaded
    // (keeps backward compatibility for callers that don't pass catalog)
    const staticMap = [
        { keywords: ['bscs', 'bs cs'], program: 'BS Computer Science' },
        { keywords: ['bsse', 'bs se', 'software engineering'], program: 'BS Software Engineering' },
        { keywords: ['bsit', 'bs it', 'information technology'], program: 'BS Information Technology' },
        { keywords: ['ms cs', 'ms computer science'], program: 'MS Computer Science' },
        { keywords: ['phd cs', 'phd computer science'], program: 'PhD Computer Science' },
        { keywords: ['bba', 'business administration'], program: 'BBA' },
        { keywords: ['mba'], program: 'MBA' },
        { keywords: ['ms management sciences', 'management sciences'], program: 'MS Management Sciences' },
        { keywords: ['bs math', 'bs mathematics'], program: 'BS Mathematics' },
        { keywords: ['bs physics'], program: 'BS Physics' },
        { keywords: ['bs commerce'], program: 'BS Commerce' }
    ];
    const text = message.toLowerCase();
    const found = staticMap.find(entry => entry.keywords.some(k => text.includes(k)));
    return found ? found.program : null;
}

function detectProgramLevel(message = '') {
    const text = message.toLowerCase();
    if (text.includes('phd')) return 'PhD';
    if (text.includes('ms ') || text.startsWith('ms') || text.includes('masters')) return 'MS';
    if (text.includes('bs ') || text.startsWith('bs') || text.includes('bachelor') || text.includes('undergraduate')) return 'BS';
    return null;
}

// Dynamic department detection using live catalog from DB.
// Any department added via admin panel is automatically matched.
function detectDepartmentName(message = '', catalogDepartments = []) {
    if (catalogDepartments.length > 0) {
        const match = findBestCatalogMatch(
            message,
            catalogDepartments.map(d => ({ ...d, name: d.dept_name })),
            item => buildDepartmentAliases(item.dept_name),
            50
        );
        if (match) return match.dept_name;
    }
    // Static fallback when catalog not provided
    const staticMap = [
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
    const text = message.toLowerCase();
    const found = staticMap.find(entry => entry.keywords.some(k => text.includes(k)));
    return found ? found.department : null;
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

async function getDepartmentAnswer(intent, message, pool, catalog = null) {
    const liveCatalog = catalog || await loadStructuredCatalog(pool);
    const departmentMatch = findBestCatalogMatch(
        message,
        liveCatalog.departments.map(department => ({ ...department, name: department.dept_name })),
        item => buildDepartmentAliases(item.dept_name),
        50
    );
    const departmentName = departmentMatch?.dept_name || detectDepartmentName(message, liveCatalog.departments);
    const field = detectDepartmentField(message);

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

        if (field === 'programs') {
            const programResult = await pool.request()
                .input('departmentName', sql.VarChar, departmentName)
                .query(`
                    SELECT p.program_name, p.program_level, p.duration_years, p.total_semesters
                    FROM programs p
                    JOIN departments d ON p.department_id = d.department_id
                    WHERE d.dept_name = @departmentName
                      AND p.is_active = 1
                    ORDER BY p.program_level, p.program_name
                `);

            if (programResult.recordset.length === 0) {
                return missingDataAnswer(`<b>${escapeHtml(dept.dept_name)} Department Programs</b><br><br>${buildBulletList([
                    'No active programs are currently listed for this department in the database.'
                ])}`);
            }

            return `<b>${escapeHtml(dept.dept_name)} Department Programs</b><br><br>${buildBulletList(
                programResult.recordset.map(program =>
                    `<b>${escapeHtml(program.program_name)}:</b> ${escapeHtml(program.program_level)}, ${escapeHtml(program.duration_years)} years, ${escapeHtml(program.total_semesters)} semesters`
                )
            )}`;
        }

        const fieldMap = {
            head_name: formatFieldValue('Head of Department', dept.head_name),
            contact_number: formatFieldValue('Contact Number', dept.contact_number),
            email: formatFieldValue('Email', dept.email),
            block_location: formatFieldValue('Location', `${dept.block_location || 'Block N/A'}${dept.room_number ? `, Room ${dept.room_number}` : ''}`),
            room_number: formatFieldValue('Room Number', dept.room_number),
            office_hours: formatFieldValue('Office Hours', dept.office_hours)
        };

        if (field !== 'summary' && fieldMap[field]) {
            return `<b>${escapeHtml(dept.dept_name)} Department</b><br><br>${buildBulletList([fieldMap[field]])}`;
        }

        return `<b>${escapeHtml(dept.dept_name)} Department</b><br><br>${buildBulletList([
            formatFieldValue('Head of Department', dept.head_name),
            formatFieldValue('Contact Number', dept.contact_number),
            formatFieldValue('Email', dept.email),
            formatFieldValue('Location', `${dept.block_location || 'Block N/A'}${dept.room_number ? `, Room ${dept.room_number}` : ''}`),
            formatFieldValue('Office Hours', dept.office_hours)
        ])}`;
    }

    const result = await pool.request().query(`
        SELECT dept_name, head_name, contact_number, block_location, room_number
        FROM departments
        ORDER BY dept_name
    `);

    if (result.recordset.length === 0) return null;

    return `<b>PUGC Departments</b><br><br>${buildBulletList(
        result.recordset.map(dept =>
            `<b>${escapeHtml(dept.dept_name)}:</b> HOD ${escapeHtml(dept.head_name || 'Not listed')}, ${escapeHtml(dept.block_location || 'Location N/A')}${dept.room_number ? `, Room ${escapeHtml(dept.room_number)}` : ''}${dept.contact_number ? `, Contact ${escapeHtml(dept.contact_number)}` : ''}`
        )
    )}`;
}

async function getProgramsAnswer(intent, message, pool, catalog = null) {
    const liveCatalog = catalog || await loadStructuredCatalog(pool);
    const programMatch = findBestCatalogMatch(
        message,
        liveCatalog.programs.map(program => ({ ...program, name: program.program_name })),
        item => buildProgramAliases(item.program_name),
        50
    );
    const departmentMatch = findBestCatalogMatch(
        message,
        liveCatalog.departments.map(department => ({ ...department, name: department.dept_name })),
        item => buildDepartmentAliases(item.dept_name),
        50
    );
    const programName = programMatch?.program_name || detectProgramName(message, liveCatalog.programs);
    const level = detectProgramLevel(message);
    const field = detectProgramField(message);

    if (programName) {
        const result = await pool.request()
            .input('programName', sql.VarChar, programName)
            .query(`
                SELECT TOP 1 p.program_name, p.program_level, p.duration_years, p.total_semesters,
                       p.total_credit_hrs, p.total_seats, p.description, d.dept_name
                FROM programs p
                JOIN departments d ON p.department_id = d.department_id
                WHERE p.is_active = 1
                  AND p.program_name = @programName
            `);

        if (result.recordset.length > 0) {
            const program = result.recordset[0];

            if (field === 'fees') {
                return getFeesAnswer(message, pool, liveCatalog);
            }

            const fieldMap = {
                program_level: formatFieldValue('Level', program.program_level),
                duration_years: formatFieldValue('Duration', program.duration_years, null, ' years'),
                total_semesters: formatFieldValue('Total Semesters', program.total_semesters),
                total_credit_hrs: formatFieldValue('Credit Hours', program.total_credit_hrs),
                total_seats: formatFieldValue('Seats', program.total_seats),
                department: formatFieldValue('Department', program.dept_name),
                description: formatFieldValue('Overview', program.description)
            };

            if (field !== 'summary' && fieldMap[field]) {
                return `<b>${escapeHtml(program.program_name)}</b><br><br>${buildBulletList([fieldMap[field]])}`;
            }

            return `<b>${escapeHtml(program.program_name)}</b><br><br>${buildBulletList([
                formatFieldValue('Level', program.program_level),
                formatFieldValue('Department', program.dept_name),
                formatFieldValue('Duration', program.duration_years, null, ' years'),
                formatFieldValue('Total Semesters', program.total_semesters),
                formatFieldValue('Credit Hours', program.total_credit_hrs),
                formatFieldValue('Seats', program.total_seats),
                formatFieldValue('Overview', program.description)
            ])}`;
        }

        return missingDataAnswer(`<b>Program Data Not Available</b><br><br>${buildBulletList([
            `The current PUGC database does not contain an active record for <b>${escapeHtml(programName)}</b>.`,
            'Please contact PUGC directly for confirmation.'
        ])}`);
    }

    const asksSpecificProgram = hasUnknownSpecificProgramRequest(message, liveCatalog)
        && !departmentMatch
        && !level;

    if (asksSpecificProgram) {
        return missingDataAnswer(`<b>Program Data Not Available</b><br><br>${buildBulletList([
            'The current PUGC database does not contain an active program record matching this request.',
            'Please contact PUGC directly for confirmation.'
        ])}`);
    }

    const request = pool.request();
    let query = `
        SELECT p.program_name, p.program_level, p.duration_years, p.total_semesters,
               p.total_credit_hrs, p.total_seats, d.dept_name
        FROM programs p
        JOIN departments d ON p.department_id = d.department_id
        WHERE p.is_active = 1
    `;

    if (departmentMatch?.dept_name) {
        request.input('departmentName', sql.VarChar, departmentMatch.dept_name);
        query += ' AND d.dept_name = @departmentName';
    }

    if (level) {
        request.input('level', sql.VarChar, level);
        query += ' AND p.program_level = @level';
    }

    query += ' ORDER BY p.program_level, p.program_name';
    const result = await request.query(query);
    if (result.recordset.length === 0) return null;

    const heading = departmentMatch?.dept_name
        ? `${departmentMatch.dept_name} Programs`
        : level ? `${level} Programs at PUGC` : 'Programs at PUGC';

    return `<b>${escapeHtml(heading)}</b><br><br>${buildBulletList(
        result.recordset.map(program =>
            `<b>${escapeHtml(program.program_name)}:</b> ${escapeHtml(program.program_level)}, ${escapeHtml(program.duration_years)} years, ${escapeHtml(program.total_semesters)} semesters, ${escapeHtml(program.total_credit_hrs)} credit hours${program.total_seats !== null ? `, ${escapeHtml(program.total_seats)} seats` : ''}, ${escapeHtml(program.dept_name)}`
        )
    )}`;
}

async function getFeesAnswer(message, pool, catalog = null) {
    const liveCatalog = catalog || await loadStructuredCatalog(pool);
    const programMatch = findBestCatalogMatch(
        message,
        liveCatalog.programs.map(program => ({ ...program, name: program.program_name })),
        item => buildProgramAliases(item.program_name),
        50
    );
    const departmentMatch = findBestCatalogMatch(
        message,
        liveCatalog.departments.map(department => ({ ...department, name: department.dept_name })),
        item => buildDepartmentAliases(item.dept_name),
        50
    );
    const programName = programMatch?.program_name || detectProgramName(message, liveCatalog.programs);
    const feeField = detectFeeField(message, liveCatalog.feeTypes);

    if (programName) {
        const result = await pool.request()
            .input('programName', sql.VarChar, programName)
            .query(`
                SELECT p.program_name, ft.fee_type_id, ft.fee_type_name, fs.amount, fs.effective_from, fs.effective_to
                FROM fee_structure fs
                JOIN programs p ON fs.program_id = p.program_id
                JOIN fee_types ft ON fs.fee_type_id = ft.fee_type_id
                WHERE p.program_name = @programName
                  AND (fs.effective_to IS NULL OR fs.effective_to >= CAST(GETDATE() AS date))
                ORDER BY ft.fee_type_name
            `);

        if (result.recordset.length === 0) {
            return missingDataAnswer(`<b>Fee Data Not Available</b><br><br>${buildBulletList([
                `The current PUGC database has an active program record for <b>${escapeHtml(programName)}</b>, but no current fee records are listed for it.`,
                'Please contact PUGC directly for confirmation.'
            ])}`);
        }

        const total = result.recordset.reduce((sum, row) => sum + Number(row.amount || 0), 0);

        if (feeField.kind === 'specific_fee_type' && feeField.feeType) {
            const feeTypeRow = result.recordset.find(row => row.fee_type_id === feeField.feeType.fee_type_id);
            if (feeTypeRow) {
                return `<b>${escapeHtml(programName)} Fee Detail</b><br><br>${buildBulletList([
                    `<b>${escapeHtml(feeTypeRow.fee_type_name)}:</b> ${formatCurrency(feeTypeRow.amount)}`,
                    `<b>Effective From:</b> ${formatDate(feeTypeRow.effective_from)}`,
                    `<b>Effective To:</b> ${feeTypeRow.effective_to ? formatDate(feeTypeRow.effective_to) : 'Current / Open'}`
                ])}`;
            }
        }

        if (feeField.kind === 'total') {
            return `<b>${escapeHtml(programName)} Total Fee</b><br><br>${buildBulletList([
                `<b>Total Semester Fee:</b> ${formatCurrency(total)}`
            ])}`;
        }

        if (feeField.kind === 'effective_from' || feeField.kind === 'effective_to') {
            const values = result.recordset.map(row =>
                `<b>${escapeHtml(row.fee_type_name)}:</b> ${feeField.kind === 'effective_from' ? formatDate(row.effective_from) : row.effective_to ? formatDate(row.effective_to) : 'Current / Open'}`
            );
            return `<b>${escapeHtml(programName)} Fee Effective Dates</b><br><br>${buildBulletList(values)}`;
        }

        return `<b>${escapeHtml(programName)} Fee Structure</b><br><br>${buildBulletList([
            ...result.recordset.map(row => `<b>${escapeHtml(row.fee_type_name)}:</b> ${formatCurrency(row.amount)}`),
            `<b>Total Semester Fee:</b> ${formatCurrency(total)}`
        ])}`;
    }

    if (hasUnknownSpecificProgramRequest(message, liveCatalog) && !departmentMatch) {
        return missingDataAnswer(`<b>Fee Data Not Available</b><br><br>${buildBulletList([
            'The current PUGC database does not contain an active program record matching this fee request.',
            'Please contact PUGC directly for confirmation.'
        ])}`);
    }

    const request = pool.request();
    let query = `
        SELECT TOP 12 program_name, program_level, dept_name, total_semester_fee
        FROM vw_total_fee_per_program
        WHERE 1 = 1
    `;

    if (departmentMatch?.dept_name) {
        request.input('departmentName', sql.VarChar, departmentMatch.dept_name);
        query += ' AND dept_name = @departmentName';
    }

    query += ' ORDER BY program_level, program_name';
    const result = await request.query(query);

    if (result.recordset.length === 0) return null;

    return `<b>${escapeHtml(departmentMatch?.dept_name ? `${departmentMatch.dept_name} Fee Overview` : 'PUGC Fee Overview')}</b><br><br>${buildBulletList(
        result.recordset.map(row =>
            `<b>${escapeHtml(row.program_name)}:</b> ${formatCurrency(row.total_semester_fee)} per semester (${escapeHtml(row.dept_name)})`
        )
    )}`;
}

async function getFeeScheduleAnswer(intent, message, pool, catalog = null) {
    const liveCatalog = catalog || await loadStructuredCatalog(pool);
    const programName = detectProgramName(message, liveCatalog.programs);
    if (!programName && hasUnknownSpecificProgramRequest(message, liveCatalog)) {
        return missingDataAnswer(`<b>Fee Schedule Data Not Available</b><br><br>${buildBulletList([
            'The current PUGC database does not contain an active program record matching this fee schedule request.',
            'Please contact PUGC directly for confirmation.'
        ])}`);
    }

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

async function getScholarshipAnswer(message, pool, catalog = null) {
    const liveCatalog = catalog || await loadStructuredCatalog(pool);
    const scholarshipTypeMatch = findBestCatalogMatch(
        message,
        liveCatalog.scholarshipTypes.map(type => ({ ...type, name: type.type_name })),
        item => buildScholarshipTypeAliases(item.type_name, item.funding_source),
        45
    );
    const field = detectScholarshipField(message);
    let scope = detectScholarshipScope(message);
    const semesterMatch = detectSemesterReference(message, liveCatalog.semesters || []);

    if (
        scholarshipTypeMatch?.type_name &&
        ['interview_date', 'announcement_date'].includes(field) &&
        scope === 'current'
    ) {
        scope = 'all';
    }

    if (
        scholarshipTypeMatch?.type_name &&
        field === 'application_deadline' &&
        /\b(was|previous|past|old|earlier)\b/.test(normalizeLookupText(message)) &&
        scope === 'current'
    ) {
        scope = 'past';
    }
    const request = pool.request();
    let query = `
        SELECT TOP 12 s.scholarship_id, st.type_name, st.funding_source, st.benefit_percentage,
               st.min_cgpa_required, st.max_family_income, st.is_renewable,
               sem.semester_name, sem.year, s.application_deadline, s.interview_date,
               s.announcement_date, s.max_beneficiaries, s.is_active
        FROM scholarships s
        JOIN scholarship_types st ON s.scholarship_type_id = st.scholarship_type_id
        JOIN semesters sem ON s.semester_id = sem.semester_id
        WHERE 1 = 1
    `;

    if (scholarshipTypeMatch?.type_name) {
        request.input('typeName', sql.VarChar, scholarshipTypeMatch.type_name);
        query += ' AND st.type_name = @typeName';
    }

    if (semesterMatch?.semester_id) {
        request.input('semesterId', sql.Int, semesterMatch.semester_id);
        query += ' AND sem.semester_id = @semesterId';
    }

    if (scope === 'current') {
        query += ' AND s.is_active = 1';
        query += ' AND (s.application_deadline IS NULL OR s.application_deadline >= CAST(GETDATE() AS date))';
    } else if (scope === 'future') {
        query += ' AND s.is_active = 1';
        query += ' AND s.application_deadline >= CAST(GETDATE() AS date)';
    } else if (scope === 'past') {
        query += ' AND s.application_deadline < CAST(GETDATE() AS date)';
    } else if (scope === 'all') {
        query += ' AND 1 = 1';
    }

    query += scope === 'past'
        ? ' ORDER BY s.application_deadline DESC'
        : scope === 'all'
            ? ' ORDER BY s.is_active DESC, s.application_deadline ASC'
            : ' ORDER BY s.application_deadline ASC';
    const result = await request.query(query);

    if (result.recordset.length === 0) return null;

    if (scholarshipTypeMatch?.type_name) {
        const row = result.recordset[0];
        const fieldMap = {
            application_deadline: formatFieldValue('Application Deadline', row.application_deadline, formatDate),
            interview_date: formatFieldValue('Interview Date', row.interview_date, formatDate),
            announcement_date: formatFieldValue('Announcement Date', row.announcement_date, formatDate),
            benefit_percentage: formatFieldValue('Benefit', row.benefit_percentage, null, '%'),
            min_cgpa_required: formatFieldValue('Minimum CGPA', row.min_cgpa_required),
            max_family_income: formatFieldValue('Maximum Family Income', row.max_family_income, formatCurrency),
            is_renewable: formatFieldValue('Renewable', row.is_renewable ? 'Yes' : 'No'),
            max_beneficiaries: formatFieldValue('Max Beneficiaries', row.max_beneficiaries),
            funding_source: formatFieldValue('Funding Source', row.funding_source),
            semester_name: formatFieldValue('Semester', `${row.semester_name} ${row.year}`)
        };

        if (field !== 'summary' && fieldMap[field]) {
            const fieldValueRaw = row[field];
            const fieldMissing = fieldValueRaw === null || fieldValueRaw === undefined || fieldValueRaw === '';
            if (fieldMissing) {
                return missingDataAnswer(`<b>${escapeHtml(row.type_name)} Scholarship</b><br><br>${buildBulletList([
                    `This scholarship exists in the current PUGC data, but the requested ${escapeHtml(field.replace(/_/g, ' '))} is not listed for the matched record.`,
                    `<b>Semester:</b> ${escapeHtml(`${row.semester_name} ${row.year}`)}`,
                    `<b>Status:</b> ${escapeHtml(getScholarshipStatus(row))}`
                ])}`);
            }

            return `<b>${escapeHtml(row.type_name)} Scholarship</b><br><br>${buildBulletList([
                fieldMap[field],
                formatFieldValue('Status', getScholarshipStatus(row))
            ])}`;
        }
    }

    const asksSpecificScholarship = !scholarshipTypeMatch
        && /\bscholarship|financial aid|funding\b/.test(normalizeLookupText(message))
        && hasSpecificUnknownSubject(message, [
            'scholarship', 'scholarships', 'financial', 'aid', 'funding', 'available', 'apply',
            'deadline', 'cgpa', 'criteria', 'eligibility', 'renewable', 'pugc', 'punjab',
            'university', 'campus', 'offer', 'offered', 'only', 'list', 'all', 'current'
        ]);

    if (asksSpecificScholarship) {
        return missingDataAnswer(`<b>Scholarship Data Not Available</b><br><br>${buildBulletList([
            'The current PUGC database does not contain a scholarship record matching this specific request.',
            'Please contact PUGC directly for confirmation.'
        ])}`);
    }

    const heading = scope === 'past'
        ? 'Past Scholarship Opportunities'
        : scope === 'future'
            ? 'Upcoming Scholarship Opportunities'
            : scope === 'all'
                ? 'All Scholarship Opportunities'
                : 'Current Scholarship Opportunities';

    return `<b>${heading}</b><br><br>${buildBulletList(
        result.recordset.map(row =>
            `<b>${escapeHtml(row.type_name)}:</b> ${row.benefit_percentage ? `${escapeHtml(row.benefit_percentage)}% benefit, ` : ''}deadline ${formatDate(row.application_deadline)}, semester ${escapeHtml(`${row.semester_name} ${row.year}`)}, minimum CGPA ${escapeHtml(row.min_cgpa_required ?? 'Not listed')}, renewable ${row.is_renewable ? 'Yes' : 'No'}, status ${escapeHtml(getScholarshipStatus(row))}`
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

async function getEventsAnswer(intent, message, pool, catalog = null) {
    const liveCatalog = catalog || await loadStructuredCatalog(pool);
    const eventMatch = findBestCatalogMatch(
        message,
        liveCatalog.eventNames.map(event => ({ ...event, name: event.event_name })),
        item => buildGenericAliases(item.event_name),
        50
    );
    const eventTypeMatch = findBestCatalogMatch(
        message,
        liveCatalog.eventTypes.map(type => ({ ...type, name: type.type_name })),
        item => buildGenericAliases(item.type_name),
        50
    );
    const category = detectEventCategory(intent, message);
    const field = detectEventField(message);
    const timeScope = detectEventTimeScope(message);
    const asksSpecificEvent = !eventMatch
        && !eventTypeMatch
        && !category
        && /\b(event|trip|tour|visit|excursion|seminar|workshop|orientation|planned|plan)\b/.test(normalizeLookupText(message))
        && hasSpecificUnknownSubject(message, [
            'event', 'events', 'trip', 'tour', 'visit', 'excursion', 'seminar', 'workshop',
            'orientation', 'planned', 'plan', 'pugc', 'punjab', 'university', 'campus',
            'upcoming', 'future', 'next', 'schedule', 'held', 'date', 'when'
        ]);

    if (eventMatch?.event_id) {
        const result = await pool.request()
            .input('eventId', sql.Int, eventMatch.event_id)
            .query(`
                SELECT TOP 1 e.event_name, et.type_name AS event_type, e.event_date, e.event_end_date,
                       e.venue, e.description, e.registration_required, e.registration_deadline,
                       sem.semester_name
                FROM events e
                JOIN event_types et ON e.event_type_id = et.event_type_id
                LEFT JOIN semesters sem ON e.semester_id = sem.semester_id
                WHERE e.event_id = @eventId
            `);

        if (result.recordset.length > 0) {
            const row = result.recordset[0];
            const fieldMap = {
                venue: formatFieldValue('Venue', row.venue),
                event_date: formatFieldValue('Date', row.event_date, formatDate),
                event_end_date: formatFieldValue('End Date', row.event_end_date, formatDate),
                registration_required: formatFieldValue('Registration', row.registration_required ? 'Required' : 'Not required'),
                registration_deadline: formatFieldValue('Registration Deadline', row.registration_deadline, formatDate),
                description: formatFieldValue('Details', row.description),
                semester_name: formatFieldValue('Semester', row.semester_name)
            };

            if (field !== 'summary' && fieldMap[field]) {
                return `<b>${escapeHtml(row.event_name)}</b><br><br>${buildBulletList([fieldMap[field]])}`;
            }
        }
    }

    if (asksSpecificEvent) {
        return missingDataAnswer(`<b>Event Data Not Available</b><br><br>${buildBulletList([
            'The current PUGC database does not contain an event record matching this specific request.',
            'Please contact PUGC directly for confirmation.'
        ])}`);
    }

    const eventsRequest = pool.request();
    let eventsQuery = `
        SELECT TOP 12 e.event_name, et.type_name AS event_type, e.event_date, e.event_end_date,
               e.venue, e.description, e.registration_required, e.registration_deadline,
               sem.semester_name, sem.year
        FROM events e
        JOIN event_types et ON e.event_type_id = et.event_type_id
        LEFT JOIN semesters sem ON e.semester_id = sem.semester_id
        WHERE e.is_active = 1
    `;

    if (eventTypeMatch?.type_name) {
        eventsRequest.input('eventType', sql.VarChar, eventTypeMatch.type_name);
        eventsQuery += ' AND et.type_name = @eventType';
    } else if (category?.type) {
        eventsRequest.input('eventType', sql.VarChar, category.type);
        eventsQuery += ' AND et.type_name = @eventType';
    }

    if (category?.nameLike) {
        eventsRequest.input('eventNameLike', sql.VarChar, category.nameLike);
        eventsQuery += ' AND e.event_name LIKE @eventNameLike';
    }

    if (intent === 'ask_event_registration' || intent === 'ask_event_eligibility' || field === 'registration_required' || field === 'registration_deadline') {
        eventsQuery += ' AND e.registration_required = 1';
    }

    if (timeScope === 'future') {
        eventsQuery += ' AND e.event_date > CAST(GETDATE() AS date)';
        eventsQuery += ' ORDER BY e.event_date ASC';
    } else if (timeScope === 'current') {
        eventsQuery += ' AND e.event_date <= CAST(GETDATE() AS date)';
        eventsQuery += ' AND (e.event_end_date IS NULL OR e.event_end_date >= CAST(GETDATE() AS date))';
        eventsQuery += ' ORDER BY e.event_date ASC';
    } else if (timeScope === 'past') {
        eventsQuery += ' AND e.event_date < CAST(GETDATE() AS date)';
        eventsQuery += ' ORDER BY e.event_date DESC';
    } else {
        eventsQuery += ' ORDER BY e.event_date DESC';
    }

    const eventsResult = await eventsRequest.query(eventsQuery);

    if (eventsResult.recordset.length > 0) {
        const headingBase = eventTypeMatch?.type_name
            ? `${eventTypeMatch.type_name} Events`
            : intent === 'ask_orientation'
                ? 'Orientation Events'
                : 'PUGC Events';

        const heading = timeScope === 'past'
            ? `Past ${headingBase}`
            : timeScope === 'current'
                ? `Current ${headingBase}`
                : timeScope === 'all'
                    ? `All ${headingBase}`
                    : `Upcoming ${headingBase}`;

        return `<b>${escapeHtml(heading)}</b><br><br>${buildBulletList(
            eventsResult.recordset.map(row => {
                const details = [
                    formatFieldValue('Date', row.event_date, formatDate),
                    row.event_end_date && String(row.event_end_date) !== String(row.event_date) ? formatFieldValue('Ends', row.event_end_date, formatDate) : null,
                    formatFieldValue('Type', row.event_type),
                    row.venue ? formatFieldValue('Venue', row.venue) : null,
                    row.semester_name ? formatFieldValue('Semester', `${row.semester_name}${row.year ? ` ${row.year}` : ''}`) : null,
                    row.registration_required ? `<b>Registration:</b> Required${row.registration_deadline ? ` by ${formatDate(row.registration_deadline)}` : ''}` : '<b>Registration:</b> Not required',
                    row.description ? formatFieldValue('Details', row.description) : null
                ].filter(Boolean).join('<br>');

                return `<b>${escapeHtml(row.event_name)}:</b><br>${details}`;
            })
        )}`;
    }

    const scopeLabel = timeScope === 'past'
        ? 'past'
        : timeScope === 'current'
            ? 'current'
            : timeScope === 'all'
                ? 'matching'
                : 'upcoming';

    return missingDataAnswer(`<b>No Event Data Available</b><br><br>${buildBulletList([
        `There are no ${escapeHtml(scopeLabel)} event records matching this request in the current database as of <b>${formatDate(new Date())}</b>.`,
        `You can add or update records in the <b>events</b> table from the admin dashboard to make this answer available dynamically.`,
        `For confirmation, contact PUGC at <b>055-9200001</b>.`
    ])}`);
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

async function getFaqSearchAnswer(message, pool) {
    const tokens = extractMeaningfulTokens(message);
    if (tokens.length === 0) return null;

    const result = await pool.request().query(`
        SELECT answer_text, intent_name, category_name
        FROM vw_faq_complete
        WHERE is_active = 1
    `);

    const normalizedMessage = normalizeLookupText(message);
    let best = null;
    let bestScore = 0;

    for (const row of result.recordset) {
        const haystack = normalizeLookupText(`${row.intent_name} ${row.category_name} ${row.answer_text}`);
        const tokenMatches = tokens.filter(token => haystack.includes(token)).length;
        const phraseBoost = haystack.includes(normalizedMessage) ? 10 : 0;
        const score = tokenMatches * 2 + phraseBoost;

        if (score > bestScore) {
            bestScore = score;
            best = row;
        }
    }

    return bestScore >= 4 ? best.answer_text : null;
}

async function getSchemaAwareFallbackAnswer(message, pool) {
    const catalog = await loadStructuredCatalog(pool);
    const normalized = normalizeLookupText(message);

    if (/\bfee|fees|tuition|charges|cost\b/.test(normalized)) {
        const feeAnswer = await getFeesAnswer(message, pool, catalog);
        if (feeAnswer) return feeAnswer;
    }

    if (/\bscholarship|cgpa|benefit|renewable|funding\b/.test(normalized)) {
        const scholarshipAnswer = await getScholarshipAnswer(message, pool, catalog);
        if (scholarshipAnswer) return scholarshipAnswer;
    }

    if (/\bevent|orientation|workshop|seminar|registration|venue|trip|tour|excursion\b/.test(normalized)) {
        const eventAnswer = await getEventsAnswer('ask_semester_events', message, pool, catalog);
        if (eventAnswer) return eventAnswer;
    }

    if (findBestCatalogMatch(message, catalog.programs.map(program => ({ ...program, name: program.program_name })), item => buildProgramAliases(item.program_name), 50)
        || /\bprogram|semester|credit|duration|seat|seats\b/.test(normalized)) {
        const programAnswer = await getProgramsAnswer('ask_available_programs', message, pool, catalog);
        if (programAnswer) return programAnswer;
    }

    if (findBestCatalogMatch(message, catalog.departments.map(department => ({ ...department, name: department.dept_name })), item => buildDepartmentAliases(item.dept_name), 50)
        || /\bdepartment|hod|head|office hours|room|block|location\b/.test(normalized)) {
        const departmentAnswer = await getDepartmentAnswer('ask_department_list', message, pool, catalog);
        if (departmentAnswer) return departmentAnswer;
    }

    return getFaqSearchAnswer(message, pool);
}

async function getDynamicAnswer(intent, message, pool) {
    const handler = DYNAMIC_INTENT_HANDLERS[intent];
    if (!handler) return null;

    const catalog = await loadStructuredCatalog(pool);

    switch (handler) {
        case 'departments':
        case 'department_details':
            return getDepartmentAnswer(intent, message, pool, catalog);
        case 'programs':
        case 'program_details':
            return getProgramsAnswer(intent, message, pool, catalog);
        case 'fees':
            return getFeesAnswer(message, pool, catalog);
        case 'fee_schedule':
            return getFeeScheduleAnswer(intent, message, pool, catalog);
        case 'scholarships':
            return getScholarshipAnswer(message, pool, catalog);
        case 'hostels':
            return getHostelAnswer(intent, message, pool);
        case 'events':
            return getEventsAnswer(intent, message, pool, catalog);
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

async function logChatFromReply(message, intent, replyText, source, contextText = '') {
    const explicitStatus = getAnswerStatus(contextText);
    await logChat(message, intent, explicitStatus !== 'missing_data', source);
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
    const suggestedQuestions = await buildSuggestedQuestions(pool, primaryIntent, message, fallbackIntents);
    const dbAnswerText = getAnswerText(dbAnswer);
    const relevant = await isAnswerRelevant(message, dbAnswerText, conversationHistory);

    if (relevant) {
        console.log(`Source: ${source}, refining DB answer for presentation`);
        const refinedAnswer = await refineAnswerWithDBContext(message, dbAnswerText, conversationHistory);
        await logChatFromReply(message, primaryIntent, refinedAnswer || dbAnswerText, `${source}_refined`, dbAnswer);
        return res.json({ reply: refinedAnswer || dbAnswerText, source: `${source}_refined`, suggestedQuestions });
    }

    if (!allowRefinement) {
        console.log(`Source: ${source} not relevant, using grounded Groq fallback`);
        const groqAnswer = await getGroundedGroqResponse(message, dbAnswerText, conversationHistory);
        if (groqAnswer) {
            await logChatFromReply(message, primaryIntent, groqAnswer, 'groq_grounded', dbAnswer);
            return res.json({ reply: groqAnswer, source: 'groq_grounded', suggestedQuestions });
        }

        await logChatFromReply(message, primaryIntent, dbAnswerText, source, dbAnswer);
        return res.json({ reply: dbAnswerText, source, suggestedQuestions });
    }

    console.log(`Source: ${source} not directly relevant, refining with Groq`);
    const refinedAnswer = await refineAnswerWithDBContext(message, dbAnswerText, conversationHistory);
    if (refinedAnswer) {
        await logChatFromReply(message, primaryIntent, refinedAnswer, `${source}_refined`, dbAnswer);
        return res.json({ reply: refinedAnswer, source: `${source}_refined`, suggestedQuestions });
    }

    await logChatFromReply(message, primaryIntent, dbAnswerText, source, dbAnswer);
    return res.json({ reply: dbAnswerText, source, suggestedQuestions });
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

            const rasaSchemaAnswer = await getSchemaAwareFallbackAnswer(enrichedMessage, pool);
            if (rasaSchemaAnswer) {
                return await sendDBAnswerOrRefinedResponse(
                    pool,
                    res,
                    enrichedMessage,
                    rasaSchemaAnswer,
                    conversationHistory,
                    'rasa_schema',
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
                    await logChatFromReply(message, intent, groqAnswer, 'groq_general');
                    return res.json({ reply: groqAnswer, source: 'groq_general', suggestedQuestions });
                }
            }
        }

        // LAYER 3: Groq extracts intent → DB lookup
        const schemaAwareAnswer = await getSchemaAwareFallbackAnswer(enrichedMessage, pool);
        if (schemaAwareAnswer) {
            return await sendDBAnswerOrRefinedResponse(
                pool,
                res,
                enrichedMessage,
                schemaAwareAnswer,
                conversationHistory,
                'schema_dynamic',
                true,
                intent
            );
        }

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
            await logChatFromReply(message, extractedIntent || intent, groqAnswer, 'groq_general');
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
            await logChat(message, suggestionIntent, false, 'training_examples');
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
        await logChat(message, suggestionIntent, false, 'fallback');
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
