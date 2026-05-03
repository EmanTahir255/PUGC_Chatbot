/* ================================================================
   Application Form Generator — Client-Side Logic
   js/application-form.js
   ================================================================ */

'use strict';

// ── Form Configuration ──────────────────────────────────────────
const FORM_CONFIG = {
    transcript: {
        title: 'Transcript Request Form',
        icon: 'fa-graduation-cap',
        fields: [
            { id: 'transcriptType', label: 'Transcript Type', type: 'select', options: ['Official', 'Unofficial'], required: true },
            { id: 'transcriptCopies', label: 'Number of Copies', type: 'number', placeholder: 'e.g., 2', min: 1, required: true },
            { id: 'transcriptPurpose', label: 'Purpose', type: 'select', options: ['Job', 'Higher Studies', 'Visa', 'Personal'], required: true },
            { id: 'transcriptUrgency', label: 'Urgency', type: 'select', options: ['Normal', 'Urgent'], required: true },
            { id: 'transcriptDelivery', label: 'Delivery Method', type: 'select', options: ['By Hand', 'Courier'], required: true }
        ]
    },
    resit: {
        title: 'Resit / Reappear Exam Form',
        icon: 'fa-redo-alt',
        fields: [
            { id: 'resitCourseCode', label: 'Course Code', type: 'text', placeholder: 'e.g., GE-161', required: true },
            { id: 'resitCourseTitle', label: 'Course Title', type: 'text', placeholder: 'e.g., Introduction to Computing', required: true },
            { id: 'resitExamType', label: 'Exam Type', type: 'select', options: ['Mid', 'Final', 'Practical'], required: true },
            { id: 'resitPrevGrade', label: 'Previous Grade / Marks', type: 'text', placeholder: 'e.g., D / 35', required: true },
            { id: 'resitReason', label: 'Reason for Resit', type: 'textarea', placeholder: 'Briefly explain the reason...', required: true }
        ]
    },
    freeze: {
        title: 'Semester Freeze / Deferment Form',
        icon: 'fa-snowflake',
        fields: [
            { id: 'freezeSemester', label: 'Semester to Freeze', type: 'select', options: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'], required: true },
            { id: 'freezeDuration', label: 'Duration', type: 'select', options: ['1 Semester', '2 Semesters'], required: true },
            { id: 'freezeReason', label: 'Reason for Freeze', type: 'textarea', placeholder: 'Describe your reason...', required: true },
            { id: 'freezeDoc', label: 'Supporting Document Available', type: 'select', options: ['Yes', 'No'], required: true },
            { id: 'freezeReturn', label: 'Expected Return Semester', type: 'text', placeholder: 'e.g., Spring 2027', required: true }
        ]
    },
    degree: {
        title: 'Degree Verification Form',
        icon: 'fa-certificate',
        fields: [
            { id: 'degreeTitle', label: 'Degree Title', type: 'text', placeholder: 'e.g., BS Information Technology', required: true },
            { id: 'degreeYear', label: 'Passing Year', type: 'number', placeholder: 'e.g., 2024', min: 1990, max: 2099, required: true },
            { id: 'degreeRegNo', label: 'Registration Number', type: 'text', placeholder: 'e.g., 2020-PUGC-0011', required: true },
            { id: 'degreePurpose', label: 'Purpose', type: 'select', options: ['Job', 'Abroad', 'Embassy', 'Higher Studies'], required: true },
            { id: 'degreeOrg', label: 'Organization / Institution Name', type: 'text', placeholder: 'e.g., HEC Pakistan', required: false }
        ]
    },
    admission: {
        title: 'Admission Application Form',
        icon: 'fa-door-open',
        fields: [
            { id: 'admProgram', label: 'Program Applied For', type: 'text', placeholder: 'e.g., BS Computer Science', required: true },
            { id: 'admQualification', label: 'Previous Qualification', type: 'select', options: ['Matric', 'Intermediate (FSc/FA/ICS)', 'Bachelor', 'Master', 'Other'], required: true },
            { id: 'admMarks', label: 'Marks / Percentage', type: 'text', placeholder: 'e.g., 870/1100 or 79%', required: true },
            { id: 'admBoard', label: 'Board / University Name', type: 'text', placeholder: 'e.g., BISE Gujranwala', required: true },
            { id: 'admShift', label: 'Preferred Shift', type: 'select', options: ['Morning', 'Evening'], required: true }
        ]
    },
    scholarship: {
        title: 'Scholarship / Financial Aid Form',
        icon: 'fa-hand-holding-heart',
        fields: [
            { id: 'scholType', label: 'Scholarship Type', type: 'select', options: ['Need-based', 'Merit-based'], required: true },
            { id: 'scholIncome', label: 'Family Monthly Income (PKR)', type: 'number', placeholder: 'e.g., 35000', min: 0, required: true },
            { id: 'scholGuardianOcc', label: 'Guardian Occupation', type: 'text', placeholder: 'e.g., Farmer, Teacher', required: true },
            { id: 'scholDependents', label: 'Number of Dependents', type: 'number', placeholder: 'e.g., 4', min: 0, required: true },
            { id: 'scholReason', label: 'Reason for Financial Aid', type: 'textarea', placeholder: 'Describe your financial situation...', required: true }
        ]
    },
    idcard: {
        title: 'Student ID Card Form',
        icon: 'fa-id-card',
        fields: [
            { id: 'idcardRequest', label: 'Request Type', type: 'select', options: ['New', 'Duplicate'], required: true },
            { id: 'idcardReason', label: 'Reason', type: 'select', options: ['New Admission', 'Lost', 'Damaged'], required: true },
            { id: 'idcardPrevNo', label: 'Previous Card Number (if any)', type: 'text', placeholder: 'Leave blank if not applicable', required: false },
            { id: 'idcardPhoto', label: 'Passport Photo Required', type: 'select', options: ['Yes', 'No'], required: true },
            { id: 'idcardDelivery', label: 'Delivery Method', type: 'select', options: ['Collect from Office', 'Courier'], required: true }
        ]
    },
    leave: {
        title: 'Leave Application Form',
        icon: 'fa-calendar-minus',
        fields: [
            { id: 'leaveType', label: 'Leave Type', type: 'select', options: ['Medical', 'Personal', 'Emergency'], required: true },
            { id: 'leaveStart', label: 'Start Date', type: 'date', required: true },
            { id: 'leaveEnd', label: 'End Date', type: 'date', required: true },
            { id: 'leaveDays', label: 'Total Days', type: 'number', placeholder: 'Auto-calculated or enter manually', min: 1, required: true },
            { id: 'leaveReason', label: 'Reason for Leave', type: 'textarea', placeholder: 'Briefly explain the reason...', required: true }
        ]
    }
};

// ── Helpers ─────────────────────────────────────────────────────
function generateAppId() {
    const year = new Date().getFullYear();
    const rand = String(Math.floor(Math.random() * 9000) + 1000);
    return `PUGC-APP-${year}-${rand}`;
}

function formatToday() {
    return new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });
}

function esc(val) {
    return String(val || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── DOM References ───────────────────────────────────────────────
const formTypeEl = document.getElementById('formType');
const appForm = document.getElementById('applicationForm');
const dynSection = document.getElementById('dynamicFieldsSection');
const formPanel = document.getElementById('formPanel');
const previewSection = document.getElementById('previewSection');
const previewDoc = document.getElementById('previewDocument');
const step1El = document.getElementById('step1');
const step2El = document.getElementById('step2');
const step3El = document.getElementById('step3');

// ── Auto-fill Read-only Fields ───────────────────────────────────
document.getElementById('appId').value = generateAppId();
document.getElementById('appDate').value = formatToday();

try {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (user.name) document.getElementById('appStudentName').value = user.name;
    if (user.rollNo) document.getElementById('appRollNo').value = user.rollNo;
    if (user.email && !user.email.includes('@')) document.getElementById('appEmail').value = user.email;
} catch (e) { }

// ── Render Dynamic Fields ────────────────────────────────────────
function renderDynamicFields(type) {
    dynSection.innerHTML = '';
    if (!type || !FORM_CONFIG[type]) {
        dynSection.style.display = 'none';
        return;
    }
    const config = FORM_CONFIG[type];
    let html = `<div class="appform-section-title"><i class="fas ${config.icon}" style="margin-right:6px;color:var(--accent)"></i> ${esc(config.title)} — Additional Details</div>`;
    html += `<div class="appform-grid" id="dynGrid">`;
    config.fields.forEach(f => {
        const reqMark = f.required ? '<span class="req">*</span>' : '';
        const fullClass = f.type === 'textarea' ? ' full-width' : '';
        html += `<div class="appform-field${fullClass}" id="field_wrap_${f.id}">`;
        html += `<label for="${esc(f.id)}">${esc(f.label)} ${reqMark}</label>`;
        if (f.type === 'select') {
            html += `<select id="${esc(f.id)}"${f.required ? ' required' : ''}>`;
            html += `<option value="">— Select —</option>`;
            f.options.forEach(o => { html += `<option value="${esc(o)}">${esc(o)}</option>`; });
            html += `</select>`;
        } else if (f.type === 'textarea') {
            html += `<textarea id="${esc(f.id)}" rows="3" placeholder="${esc(f.placeholder || '')}"${f.required ? ' required' : ''}></textarea>`;
        } else {
            const extra = [
                f.min !== undefined ? `min="${f.min}"` : '',
                f.max !== undefined ? `max="${f.max}"` : '',
                f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '',
                f.required ? 'required' : ''
            ].filter(Boolean).join(' ');
            html += `<input type="${esc(f.type)}" id="${esc(f.id)}" ${extra}>`;
        }
        html += `<span class="error-msg">This field is required.</span>`;
        html += `</div>`;
    });
    html += `</div>`;
    dynSection.innerHTML = html;
    dynSection.style.display = 'block';

    // Auto-calc leave days
    if (type === 'leave') {
        const startEl = document.getElementById('leaveStart');
        const endEl = document.getElementById('leaveEnd');
        const daysEl = document.getElementById('leaveDays');
        function calcDays() {
            if (startEl.value && endEl.value) {
                const diff = Math.ceil((new Date(endEl.value) - new Date(startEl.value)) / 86400000);
                daysEl.value = diff > 0 ? diff : '';
            }
        }
        startEl.addEventListener('change', calcDays);
        endEl.addEventListener('change', calcDays);
    }
}

formTypeEl.addEventListener('change', () => renderDynamicFields(formTypeEl.value));

// ── Validation ───────────────────────────────────────────────────
function validateField(el) {
    const wrap = el.closest('.appform-field');
    if (!wrap) return true;
    let valid = true;
    const val = el.value.trim();
    if (el.required && !val) valid = false;
    if (el.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) valid = false;
    if (el.pattern && val && !new RegExp(el.pattern).test(val)) valid = false;
    wrap.classList.toggle('has-error', !valid);
    return valid;
}

function validateAll() {
    let ok = true;
    if (!formTypeEl.value) {
        formTypeEl.style.borderColor = '#e55353';
        ok = false;
    } else {
        formTypeEl.style.borderColor = '';
    }
    appForm.querySelectorAll('input, select, textarea').forEach(el => {
        if (!validateField(el)) ok = false;
    });
    return ok;
}

appForm.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('blur', () => validateField(el));
});

// ── Build Preview ────────────────────────────────────────────────
function getFieldValue(id, fallback) {
    const el = document.getElementById(id);
    return el ? (el.value.trim() || fallback || '—') : (fallback || '—');
}

function buildPreviewHTML() {
    const type = formTypeEl.value;
    const config = FORM_CONFIG[type];
    const appId = getFieldValue('appId');
    const appDate = getFieldValue('appDate');

    const commonFields = [
        ['Student Name', getFieldValue('appStudentName')],
        ["Father's Name", getFieldValue('appFatherName')],
        ['Roll Number', getFieldValue('appRollNo')],
        ['CNIC / B-Form', getFieldValue('appCnic')],
        ['Program', getFieldValue('appProgram')],
        ['Department', getFieldValue('appDept')],
        ['Semester', getFieldValue('appSemester')],
        ['Email', getFieldValue('appEmail')],
        ['Phone', getFieldValue('appPhone')],
        ['Address', getFieldValue('appAddress')],
    ];

    let commonRows = '';
    commonFields.forEach(([k, v]) => {
        commonRows += `<div class="preview-field-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`;
    });

    let dynRows = '';
    if (config) {
        config.fields.forEach(f => {
            const val = getFieldValue(f.id);
            dynRows += `<div class="preview-field-row"><dt>${esc(f.label)}</dt><dd>${esc(val)}</dd></div>`;
        });
    }

    return `
        <div class="preview-doc-header">
            <div class="dept-line">Department of Examinations</div>
            <h1>University of the Punjab</h1>
            <div class="campus-line">Gujranwala Campus</div>
            <div class="form-title-badge">${esc(config ? config.title : 'Application Form')}</div>
        </div>

        <div class="preview-app-id-row">
            <span>Application ID: <strong>${esc(appId)}</strong></span>
            <span>Date: <strong>${esc(appDate)}</strong></span>
        </div>

        <div class="preview-fields-block">
            <div class="preview-block-title">Student Details</div>
            <dl class="preview-fields-grid">${commonRows}</dl>
        </div>

        ${dynRows ? `
        <div class="preview-fields-block">
            <div class="preview-block-title">${esc(config ? config.title : '')} — Specific Details</div>
            <dl class="preview-fields-grid">${dynRows}</dl>
        </div>` : ''}

        <div class="preview-declaration">
            <p><strong>Declaration:</strong> I hereby declare that all the particulars mentioned above are correct and complete to the best of my knowledge. In case of any inaccuracy therein, I shall be solely responsible for the same.</p>
        </div>

        <div class="preview-signatures">
            <div class="sig-block">
                <div class="sig-line"></div>
                <div class="sig-label">Signature of Applicant</div>
                <div class="sig-sub">Contact: ${esc(getFieldValue('appPhone'))}</div>
            </div>
            <div class="sig-block">
                <div class="sig-line"></div>
                <div class="sig-label">Signature of Guardian</div>
                <div class="sig-sub">Contact: ____________________</div>
            </div>
            <div class="sig-block">
                <div class="sig-line"></div>
                <div class="sig-label">Incharge Department</div>
                <div class="sig-sub">${esc(getFieldValue('appDept'))}</div>
            </div>
            <div class="sig-block">
                <div class="sig-line"></div>
                <div class="sig-label">Assistant Controller</div>
                <div class="sig-sub">Incharge Examinations</div>
            </div>
        </div>
    `;
}

// ── Steps UI ─────────────────────────────────────────────────────
function goToStep(n) {
    [step1El, step2El, step3El].forEach((s, i) => {
        s.classList.remove('active', 'done');
        if (i + 1 < n) s.classList.add('done');
        if (i + 1 === n) s.classList.add('active');
    });
}

// ── Form Submit → Preview ────────────────────────────────────────
appForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateAll()) {
        const firstErr = appForm.querySelector('.has-error input, .has-error select, .has-error textarea');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
    previewDoc.innerHTML = buildPreviewHTML();
    formPanel.style.display = 'none';
    previewSection.classList.add('visible');
    goToStep(2);
    previewSection.scrollIntoView({ behavior: 'smooth' });
});

// ── Edit Button ──────────────────────────────────────────────────
document.getElementById('editFormBtn').addEventListener('click', () => {
    previewSection.classList.remove('visible');
    formPanel.style.display = '';
    goToStep(1);
    formPanel.scrollIntoView({ behavior: 'smooth' });
});

// ── Reset ────────────────────────────────────────────────────────
document.getElementById('resetFormBtn').addEventListener('click', () => {
    appForm.reset();
    document.getElementById('appId').value = generateAppId();
    document.getElementById('appDate').value = formatToday();
    dynSection.innerHTML = '';
    dynSection.style.display = 'none';
    appForm.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
    formTypeEl.style.borderColor = '';
});

// ── Print ────────────────────────────────────────────────────────
document.getElementById('printFormBtn').addEventListener('click', () => {
    goToStep(3);
    window.print();
});

// ── PDF Download via jsPDF ───────────────────────────────────────
async function loadScript(src) {
    return new Promise((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) return res();
        const s = document.createElement('script');
        s.src = src; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
    });
}

document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
    const btn = document.getElementById('downloadPdfBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const W = doc.internal.pageSize.getWidth();
        const pad = 18;
        const right = W - pad;
        let y = 15;

        const type = formTypeEl.value;
        const config = FORM_CONFIG[type];
        const appId = getFieldValue('appId');
        const appDate = getFieldValue('appDate');

        // Header
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text('DEPARTMENT OF EXAMINATIONS', W / 2, y, { align: 'center' }); y += 6;
        doc.setFontSize(14); doc.setTextColor(0, 33, 71);
        doc.text('UNIVERSITY OF THE PUNJAB', W / 2, y, { align: 'center' }); y += 7;
        doc.setFontSize(10); doc.setTextColor(60, 60, 60);
        doc.text('Gujranwala Campus', W / 2, y, { align: 'center' }); y += 10;

        // Form Title Badge
        doc.setFillColor(0, 33, 71); doc.setTextColor(255, 255, 255); doc.setFontSize(11);
        const titleW = doc.getTextWidth(config ? config.title : 'Application Form') + 16;
        doc.roundedRect(W / 2 - titleW / 2, y - 6, titleW, 10, 3, 3, 'F');
        doc.text(config ? config.title : 'Application Form', W / 2, y, { align: 'center' }); y += 12;

        // Divider
        doc.setDrawColor(0, 33, 71); doc.setLineWidth(0.6);
        doc.line(pad, y, right, y); y += 6;

        // App ID row
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
        doc.text(`Application ID: ${appId}`, pad, y);
        doc.text(`Date: ${appDate}`, right, y, { align: 'right' }); y += 8;

        // Section helper
        function drawSection(title, rows) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0, 33, 71);
            doc.setFillColor(240, 244, 249);
            doc.rect(pad, y - 4, W - 2 * pad, 8, 'F');
            doc.text(title.toUpperCase(), pad + 3, y + 1); y += 8;

            doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(30, 40, 60);
            const colMid = W / 2 + 2;
            const labelW = 32;

            for (let i = 0; i < rows.length; i += 2) {
                const [k1, v1] = rows[i];
                const row2 = rows[i + 1];

                doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
                const k1Lines = doc.splitTextToSize(`${k1}:`, labelW - 2);
                doc.text(k1Lines, pad, y);

                doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 33, 71);
                const valX1 = pad + labelW;
                const valW1 = colMid - valX1 - 4;
                const v1Lines = doc.splitTextToSize(String(v1 || '—'), valW1);
                doc.text(v1Lines, valX1, y);

                let rowH = Math.max(k1Lines.length, v1Lines.length) * 4;

                if (row2) {
                    const [k2, v2] = row2;
                    doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
                    const k2Lines = doc.splitTextToSize(`${k2}:`, labelW - 2);
                    doc.text(k2Lines, colMid, y);

                    doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 33, 71);
                    const valX2 = colMid + labelW;
                    const valW2 = W - pad - valX2;
                    const v2Lines = doc.splitTextToSize(String(v2 || '—'), valW2);
                    doc.text(v2Lines, valX2, y);

                    rowH = Math.max(rowH, k2Lines.length * 4, v2Lines.length * 4);
                }

                y += rowH + 4;
            }
            y += 2;
        }

        const commonRows = [
            ['Student Name', getFieldValue('appStudentName')],
            ["Father's Name", getFieldValue('appFatherName')],
            ['Roll Number', getFieldValue('appRollNo')],
            ['CNIC', getFieldValue('appCnic')],
            ['Program', getFieldValue('appProgram')],
            ['Department', getFieldValue('appDept')],
            ['Semester', getFieldValue('appSemester')],
            ['Email', getFieldValue('appEmail')],
            ['Phone', getFieldValue('appPhone')],
            ['Address', getFieldValue('appAddress')],
        ];
        drawSection('Student Details', commonRows);

        if (config && config.fields.length) {
            const dynRows = config.fields.map(f => [f.label, getFieldValue(f.id)]);
            drawSection('Form Specific Details', dynRows);
        }

        // Declaration
        y += 2;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(0, 33, 71);
        doc.text('Declaration:', pad, y); y += 5;
        doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
        const decl = doc.splitTextToSize('I hereby declare that all the particulars mentioned above are correct and complete to the best of my knowledge. In case of any inaccuracy therein, I shall be solely responsible for the same.', right - pad);
        doc.text(decl, pad, y); y += decl.length * 4 + 8;

        // Signatures
        const sigCols = [pad, W / 2 - 10, pad, W / 2 - 10];
        const sigLabels = ['Signature of Applicant', 'Signature of Guardian', 'Incharge Department', 'Assistant Controller / Incharge Examinations'];
        sigLabels.forEach((label, i) => {
            const col = i % 2 === 0 ? pad : W / 2;
            if (i === 2) y += 14;
            doc.setDrawColor(40, 40, 40); doc.setLineWidth(0.4);
            doc.line(col, y, col + 55, y);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(70, 70, 70);
            doc.text(label, col, y + 4);
        });

        const filename = `PUGC-${(config ? config.title : 'Application').replace(/\s+/g, '-')}-${appId}.pdf`;
        doc.save(filename);
        goToStep(3);
    } catch (err) {
        alert('PDF generation failed. Please try printing instead.');
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-download"></i> Download PDF';
    }
});
