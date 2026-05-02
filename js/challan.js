(() => {
    const API_BASE_URL = 'http://localhost:3000/api';
    const CHALLAN_YEAR = new Date().getFullYear();
    const SEQUENCE_KEY = `pugcChallanSequence_${CHALLAN_YEAR}`;
    const LATE_FEE = 500;

    const state = {
        programs: [],
        feeStructures: [],
        hostels: [],
        fixedFees: {
            admission: 2000,
            transcript: { normal: 3000, urgent: 5000 },
            duplicate: {
                student_card: 1000,
                result_card: 1500,
                degree: 5000,
                roll_no_slip: 500
            },
            exam: {
                course_repeat: 2000,
                resit_exam: 1500,
                improvement_exam: 2500
            },
            event: {
                event_certificate: 1000,
                workshop: 1500,
                competition: 500
            },
            lateFee: LATE_FEE
        },
        bank: {
            name: 'Habib Bank Limited',
            accountTitle: 'PUGC Fee Collection',
            branch: 'University of the Punjab Gujranwala Campus'
        }
    };

    const fallbackPrograms = [
        { program_id: 1, program_name: 'BSCS', program_level: 'BS', total_semesters: 8 },
        { program_id: 2, program_name: 'BBA', program_level: 'BS', total_semesters: 8 },
        { program_id: 3, program_name: 'BS English', program_level: 'BS', total_semesters: 8 },
        { program_id: 4, program_name: 'MS CS', program_level: 'MS', total_semesters: 4 },
        { program_id: 5, program_name: 'MBA', program_level: 'MS', total_semesters: 4 },
        { program_id: 6, program_name: 'PhD', program_level: 'PhD', total_semesters: 6 }
    ];

    const demoSemesterFees = {
        BSCS: 65000,
        BBA: 58000,
        'BS English': 42000,
        'MS CS': 72000,
        MBA: 78000,
        PhD: 90000
    };

    const labels = {
        semester: 'Semester Fee',
        admission: 'Admission Fee',
        transcript: 'Transcript Fee',
        duplicate: 'Duplicate Document Fee',
        hostel: 'Hostel Fee',
        exam: 'Exam Fee',
        normal: 'Normal Transcript',
        urgent: 'Urgent Transcript',
        student_card: 'Duplicate Student Card',
        result_card: 'Duplicate Result Card',
        degree: 'Duplicate Degree',
        course_repeat: 'Course Repeat',
        resit_exam: 'Resit Exam',
        improvement_exam: 'Improvement Exam',
        event_certificate: 'Event Certificate',
        workshop: 'Workshop / Seminar',
        competition: 'Competition Entry'
    };

    const form = document.getElementById('challanForm');
    const previewPage = document.getElementById('challanPreviewPage');
    const isFormPage = Boolean(form);
    const isPreviewPage = Boolean(previewPage);

    function getElementByIds(...ids) {
        return ids.map(id => {
            if (id.startsWith('data-')) {
                return document.querySelector(`[${id}]`);
            }
            return document.getElementById(id);
        }).find(el => el);
    }

    const elements = {
        status: getElementByIds('status', 'challanStatus', 'challanStatusField', 'data-challan-status'),
        challanType: getElementByIds('challanType'),
        programLevel: getElementByIds('programLevel', 'challanProgramLevel'),
        programName: getElementByIds('programName', 'challanProgram'),
        semesterNo: getElementByIds('semesterNo', 'challanSemester'),
        option: getElementByIds('challanOption', 'challanSubType'),
        subTypeField: getElementByIds('challanSubTypeField'),
        hostel: getElementByIds('challanHostel'),
        hostelField: getElementByIds('challanHostelField'),
        studentName: getElementByIds('studentName', 'challanStudentName'),
        studentRollNo: getElementByIds('challanRollNo'),
        studentCnic: getElementByIds('challanCnic'),
        dueDate: getElementByIds('dueDate', 'challanDueDate'),
        quantity: getElementByIds('feeQuantity', 'challanQuantity'),
        reset: getElementByIds('resetChallan', 'resetChallanForm'),
        previewChallan: getElementByIds('challanPreviewId', 'data-preview-challan'),
        previewStudent: getElementByIds('challanPreviewStudent', 'data-preview-student'),
        previewProgram: getElementByIds('challanPreviewProgram', 'data-preview-program'),
        previewType: getElementByIds('challanPreviewType', 'data-preview-type'),
        previewBase: getElementByIds('challanPreviewBase', 'data-preview-base'),
        previewLate: getElementByIds('challanPreviewLate', 'data-preview-late'),
        previewTotal: getElementByIds('challanPreviewTotal', 'data-preview-total'),
        previewDue: getElementByIds('challanPreviewDue', 'data-preview-due'),
        previewBank: getElementByIds('challanPreviewBank', 'data-preview-bank'),
        previewNote: getElementByIds('challanPreviewNote', 'data-preview-note'),
        previewBody: getElementByIds('challanPreviewBody'),
        previewBarcode: getElementByIds('challanBarcode'),
        downloadButton: getElementByIds('downloadChallanPdf')
    };

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function addOption(select, value, text) {
        if (!select) return;
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
    }

    function setStatus(message, isError = false) {
        if (elements.status) {
            elements.status.textContent = message;
            elements.status.style.color = isError ? 'red' : 'green';
        }
        console.log('[Challan]', message);
    }

    function numberToWords(num) {
        if (num === 0) return 'Zero Rupees Only';
        const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const n = ('000000000' + num).slice(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return '';
        let str = '';
        str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + ' Crore ' : '';
        str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + ' Lakh ' : '';
        str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + ' Thousand ' : '';
        str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + ' Hundred ' : '';
        str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + ' ' : '';
        return str.trim() + ' Rupees Only';
    }

    function formatCurrency(amount) {
        return `Rs. ${Number(amount).toLocaleString('en-PK')}`;
    }

    function todayInput() {
        const d = new Date();
        return d.toISOString().split('T')[0];
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-PK') || dateStr;
    }

    function nextChallanNo(increment = false) {
        let seq = parseInt(localStorage.getItem(SEQUENCE_KEY) || '1000', 10);
        if (increment) {
            seq++;
            localStorage.setItem(SEQUENCE_KEY, seq.toString());
        }
        return `PUGC-${CHALLAN_YEAR}-${seq}`;
    }

    function selectedProgram() {
        if (!elements.programName) return null;
        const pid = elements.programName.value;
        return state.programs.find(p => String(p.program_id) === String(pid)) || null;
    }

    function defaultDueDate() {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toISOString().split('T')[0];
    }

    function loadStudentDefaults() {
        try {
            const user = JSON.parse(localStorage.getItem("currentUser") || "{}");
            if (elements.studentName && user.name) elements.studentName.value = user.name;
            if (elements.studentRollNo && user.email && !user.email.includes('@')) {
                elements.studentRollNo.value = user.email;
            }
        } catch(e) {}
    }

    function loadSavedDraft() {
        try {
            const raw = sessionStorage.getItem('pugcChallanDraft');
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function saveDraft(data) {
        sessionStorage.setItem('pugcChallanDraft', JSON.stringify(data));
    }

    function clearDraft() {
        sessionStorage.removeItem('pugcChallanDraft');
    }

    async function loadMeta() {
        try {
            const response = await fetch(`${API_BASE_URL}/challan/meta`);
            if (!response.ok) throw new Error('Challan reference API failed.');
            const data = await response.json();

            state.programs = data.programs?.length ? data.programs : fallbackPrograms;
            state.feeStructures = data.feeStructures || [];
            state.hostels = data.hostels || [];
            state.fixedFees = { ...state.fixedFees, ...(data.fixedFees || {}) };
            state.bank = { ...state.bank, ...(data.bank || {}) };

            setStatus('DB fees loaded');
        } catch (error) {
            state.programs = fallbackPrograms;
            state.feeStructures = [];
            state.hostels = [];
            setStatus('Demo fallback active', true);
            if (elements.previewNote) {
                elements.previewNote.textContent = 'Backend metadata was not reachable, so fixed demo amounts are being used.';
            }
        }
    }

    function populateLevels() {
        if (!elements.programLevel) return;
        elements.programLevel.innerHTML = '<option value="">Select level</option>';
        [...new Set(state.programs.map(program => program.program_level).filter(Boolean))]
            .sort()
            .forEach(level => addOption(elements.programLevel, level, level));

        if (!elements.programLevel.value && elements.programLevel.options.length > 1) {
            elements.programLevel.selectedIndex = 1;
        }
    }

    function populatePrograms() {
        if (!elements.programName) return;
        const level = elements.programLevel?.value || '';
        elements.programName.innerHTML = '<option value="">Select program</option>';

        state.programs
            .filter(program => !level || program.program_level === level)
            .forEach(program => addOption(elements.programName, program.program_id, program.program_name));

        if (!elements.programName.value && elements.programName.options.length > 1) {
            elements.programName.selectedIndex = 1;
        }

        const program = selectedProgram();
        if (program?.total_semesters && elements.semesterNo) {
            elements.semesterNo.max = program.total_semesters;
        }
    }

    function populateSpecificOptions() {
        if (!elements.challanType || !elements.option) return;
        const type = elements.challanType.value;
        elements.option.innerHTML = '';

        if (elements.subTypeField) {
            elements.subTypeField.style.display = type === 'hostel' ? '' : '';
        }
        if (elements.hostelField) {
            elements.hostelField.style.display = type === 'hostel' ? '' : 'none';
        }
        if (elements.quantity?.closest) {
            const quantityField = elements.quantity.closest('.field');
            if (quantityField) quantityField.style.display = type === 'exam' ? '' : 'none';
        }

        if (type === 'semester') {
            addOption(elements.option, 'regular', 'Regular semester fee from fee_structure');
        } else if (type === 'admission') {
            addOption(elements.option, 'processing', 'Admission processing fee');
        } else if (type === 'transcript') {
            addOption(elements.option, 'normal', `${labels.normal} - ${formatCurrency(state.fixedFees.transcript.normal)}`);
            addOption(elements.option, 'urgent', `${labels.urgent} - ${formatCurrency(state.fixedFees.transcript.urgent)}`);
        } else if (type === 'duplicate') {
            Object.entries(state.fixedFees.duplicate).forEach(([key, amount]) => {
                addOption(elements.option, key, `${labels[key]} - ${formatCurrency(amount)}`);
            });
        } else if (type === 'hostel') {
            if (elements.hostel) {
                elements.hostel.innerHTML = '<option value="">Select hostel</option>';
                if (state.hostels.length === 0) {
                    addOption(elements.hostel, 'demo', 'Demo Hostel');
                } else {
                    state.hostels.forEach(hostel => {
                        addOption(elements.hostel, hostel.hostel_id, hostel.hostel_name);
                    });
                }
            }

            addOption(elements.option, 'meal', 'Meal plan');
            addOption(elements.option, 'no_meal', 'No meal plan');
        } else if (type === 'exam') {
            Object.entries(state.fixedFees.exam).forEach(([key, amount]) => {
                addOption(elements.option, key, `${labels[key]} - ${formatCurrency(amount)} per paper/course`);
            });
        } else if (type === 'event') {
            Object.entries(state.fixedFees.event).forEach(([key, amount]) => {
                addOption(elements.option, key, `${labels[key]} - ${formatCurrency(amount)}`);
            });
        } else {
            addOption(elements.option, '', labels[type] || 'Select option');
        }

        if (elements.option && elements.option.options.length > 0) {
            elements.option.selectedIndex = 0;
        }
    }

    function calculateSemesterFee(program) {
        if (!program) return 0;
        const rows = state.feeStructures.filter(row => String(row.program_id) === String(program.program_id));
        const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        return total || demoSemesterFees[program.program_name] || 0;
    }

    function calculateHostelFee() {
        if (!elements.hostel || !elements.option) return 30000;
        const hostelId = elements.hostel.value;
        const plan = elements.option.value;
        if (!hostelId || !plan) return 30000;

        const hostel = state.hostels.find(item => String(item.hostel_id) === String(hostelId));
        if (!hostel) return 30000;

        const monthly = plan === 'meal'
            ? Number(hostel.monthly_fee_meal || 0)
            : Number(hostel.monthly_fee_no_meal || 0);

        return monthly * 6;
    }

    function getChallanData(challanNo = nextChallanNo(false)) {
        const type = elements.challanType?.value || 'semester';
        const option = elements.option?.value || '';
        const hostelId = elements.hostel?.value || '';
        const program = selectedProgram();
        const quantity = Math.max(1, Number(elements.quantity?.value || 1));
        let baseAmount = 0;

        if (type === 'semester') baseAmount = calculateSemesterFee(program);
        if (type === 'admission') baseAmount = Number(state.fixedFees.admission || 0);
        if (type === 'transcript') baseAmount = Number(state.fixedFees.transcript[option] || 0);
        if (type === 'duplicate') baseAmount = Number(state.fixedFees.duplicate[option] || 0);
        if (type === 'hostel') baseAmount = calculateHostelFee();
        if (type === 'exam') baseAmount = Number(state.fixedFees.exam[option] || 0) * quantity;
        if (type === 'event') baseAmount = Number(state.fixedFees.event[option] || 0) * quantity;

        const isLate = elements.dueDate?.value && todayInput() > elements.dueDate.value;
        const lateFee = isLate ? Number(state.fixedFees.lateFee || LATE_FEE) : 0;
        const optionLabel = type === 'hostel'
            ? `${elements.hostel?.selectedOptions?.[0]?.textContent || 'Hostel'} - ${elements.option?.selectedOptions?.[0]?.textContent || 'Plan'}`
            : (labels[option] || labels[type]);

        return {
            challanNo,
            type,
            optionValue: option,
            hostelId,
            optionLabel,
            studentName: elements.studentName?.value.trim() || 'Student Name',
            identity: elements.studentRollNo?.value.trim() || 'Roll No',
            cnic: elements.studentCnic?.value.trim() || 'CNIC',
            programName: program?.program_name || 'Program',
            programLevel: program?.program_level || 'Level',
            programId: program?.program_id || '',
            semester: elements.semesterNo?.value || '1',
            feeType: labels[type],
            baseAmount,
            lateFee,
            totalAmount: baseAmount + lateFee,
            dueDate: elements.dueDate?.value || '',
            issueDate: todayInput(),
            bank: state.bank,
            quantity
        };
    }

    function updatePreview(previewData = null) {
        const data = previewData || getChallanData();
        if (!elements.previewChallan || !elements.previewStudent || !elements.previewProgram) return;

        elements.previewChallan.textContent = data.challanNo;
        elements.previewStudent.textContent = data.studentName;
        elements.previewProgram.textContent = `${data.programName}, Semester ${data.semester}`;
        elements.previewType.textContent = data.optionLabel;
        elements.previewBase.textContent = formatCurrency(data.baseAmount);
        elements.previewLate.textContent = formatCurrency(data.lateFee);
        elements.previewTotal.textContent = formatCurrency(data.totalAmount);
        elements.previewDue.textContent = formatDate(data.dueDate);
        elements.previewBank.textContent = data.bank.name;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                existing.addEventListener('load', resolve, { once: true });
                if (window.jspdf) resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function drawBarcode(doc, value, x, y, width, height) {
        let cursor = x;
        const chars = value.split('');
        const unit = width / (chars.length * 3);
        doc.setFillColor(20, 30, 45);

        chars.forEach((char, index) => {
            const code = char.charCodeAt(0) + index;
            const bars = [code % 2, code % 3, code % 5];
            bars.forEach((bar, barIndex) => {
                const barWidth = unit * (barIndex + 1);
                if (bar !== 0) doc.rect(cursor, y, barWidth, height, 'F');
                cursor += unit * 2;
            });
        });

        doc.setFontSize(7);
        doc.text(value, x, y + height + 4);
    }

    function drawCopy(doc, data, copyLabel, x, y, width, height) {
        const pad = 8;
        const left = x + pad;
        const right = x + width - pad;
        let currentY = y + 8;

        // Outer border
        doc.setDrawColor(30, 50, 75);
        doc.setLineWidth(0.4);
        doc.rect(x, y, width, height);

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('University of the Punjab', x + width / 2, currentY, { align: 'center' });
        currentY += 4;
        doc.setFontSize(9);
        doc.text('Gujranwala Campus', x + width / 2, currentY, { align: 'center' });
        currentY += 6;
        doc.setFontSize(10);
        doc.text(copyLabel, x + width / 2, currentY, { align: 'center' });
        currentY += 8;

        // Block 1: Meta
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(`Challan ID: ${data.challanNo}`, left, currentY);
        currentY += 5;
        doc.text(`Generated: ${formatDate(data.issueDate)}`, left, currentY);
        currentY += 5;
        doc.text(`Due Date: ${formatDate(data.dueDate)}`, left, currentY);
        currentY += 8;

        // Block 2: Payment Methods
        doc.setFont('helvetica', 'bold');
        doc.text('Payment Methods', left, currentY);
        currentY += 5;
        doc.setFont('helvetica', 'normal');
        
        doc.setFont('helvetica', 'bold'); doc.text('1Bill Invoice:', left, currentY);
        doc.setFont('helvetica', 'normal'); doc.text(`100427900${data.challanNo.replace(/[^0-9]/g, '')}`, left + 21, currentY);
        currentY += 4;

        doc.setFont('helvetica', 'bold'); doc.text('HBL A/C:', left, currentY);
        doc.setFont('helvetica', 'normal'); doc.text(`PUGC-FEE-001 (PUGC Collection)`, left + 15, currentY);
        currentY += 4;

        doc.setFont('helvetica', 'bold'); doc.text('NBP A/C:', left, currentY);
        doc.setFont('helvetica', 'normal'); doc.text(`NBP-PUGC-002 (PUGC Collection)`, left + 15, currentY);
        currentY += 4;

        doc.setFont('helvetica', 'bold'); doc.text('UBL A/C:', left, currentY);
        doc.setFont('helvetica', 'normal'); doc.text(`UBL-PUGC-003 (PUGC Collection)`, left + 15, currentY);
        currentY += 6;

        // Block 3: Student Details
        doc.setFont('helvetica', 'bold');
        doc.text('Student Details', left, currentY);
        currentY += 5;
        doc.setFont('helvetica', 'normal');
        doc.text(`Name: ${data.studentName}`, left, currentY);
        currentY += 5;
        doc.text(`Roll No: ${data.identity}`, left, currentY);
        currentY += 5;
        doc.text(`CNIC: ${data.cnic}`, left, currentY);
        currentY += 5;
        doc.text(`Program: ${data.programName}`, left, currentY);
        currentY += 5;
        doc.text(`Semester: ${data.semester}`, left, currentY);
        currentY += 5;
        
        let dept = 'PUGC';
        const progLower = (data.programName || '').toLowerCase();
        if (progLower.includes('cs') || progLower.includes('it') || progLower.includes('se')) dept = 'Computer Science and IT';
        else if (progLower.includes('bba') || progLower.includes('mba') || progLower.includes('commerce')) dept = 'Commerce / Business Admin';
        else if (progLower.includes('english')) dept = 'English';
        doc.text(`Department: ${dept}`, left, currentY);
        currentY += 8;

        // Block 4: Fee Details
        doc.setFont('helvetica', 'bold');
        doc.text('Fee Details', left, currentY);
        currentY += 4;
        
        doc.setLineWidth(0.4);
        doc.line(left, currentY, right, currentY); // Top line
        currentY += 4;

        doc.text('Title', left, currentY);
        doc.text('Rs.', right - 2, currentY, { align: 'right' });
        currentY += 3;
        
        doc.setLineWidth(0.2);
        doc.line(left, currentY, right, currentY); // Header separator
        currentY += 5;

        doc.setFont('helvetica', 'normal');
        const feeTitle = data.feeType !== data.optionLabel ? `${data.feeType} (${data.optionLabel})` : data.feeType;
        const wrappedFeeTitle = doc.splitTextToSize(feeTitle, width - 35);
        doc.text(wrappedFeeTitle, left, currentY);
        doc.text(Number(data.baseAmount).toLocaleString('en-PK'), right - 2, currentY, { align: 'right' });
        currentY += Math.max(5, wrappedFeeTitle.length * 4) + 1;

        doc.text('Late Fee', left, currentY);
        doc.text(Number(data.lateFee).toLocaleString('en-PK'), right - 2, currentY, { align: 'right' });
        currentY += 4;

        doc.setLineWidth(0.4);
        doc.line(left, currentY, right, currentY); // Bottom line
        currentY += 5;

        doc.setFont('helvetica', 'bold');
        doc.text('Total Rs.', left, currentY);
        doc.text(Number(data.totalAmount).toLocaleString('en-PK'), right - 2, currentY, { align: 'right' });
        
        // Amount in words
        currentY += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        const amountWords = numberToWords(data.totalAmount);
        const wrappedWords = doc.splitTextToSize(`Amount in words: ${amountWords}`, width - pad * 2);
        doc.text(wrappedWords, left, currentY);
        
        // Footer: signatures at the bottom
        doc.setFont('helvetica', 'normal');
        const signatureY = y + height - 8;
        doc.text('Officer ________________', left + 2, signatureY);
        doc.text('Cashier ________________', right - 40, signatureY);
    }

    async function downloadPdf(data) {
        if (!window.jspdf) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 8;
        const gap = 4;
        const copyWidth = (pageWidth - margin * 2 - gap * 2) / 3;
        const copyHeight = pageHeight - margin * 2;

        drawCopy(doc, data, 'Student Copy', margin, margin, copyWidth, copyHeight);
        drawCopy(doc, data, 'Bank Copy', margin + copyWidth + gap, margin, copyWidth, copyHeight);
        drawCopy(doc, data, 'University Copy', margin + (copyWidth + gap) * 2, margin, copyWidth, copyHeight);

        doc.save(`${data.challanNo}.pdf`);
    }

    function renderPreviewPage(data) {
        if (!previewPage || !elements.previewBody || !elements.previewChallan) return;

        elements.previewChallan.textContent = data.challanNo;
        elements.previewBody.innerHTML = `
            <div class="preview-topline">
                <span>PUGC Fee Challan</span>
                <strong>${escapeHtml(data.feeType)}</strong>
            </div>
            <dl>
                <div><dt>Student</dt><dd>${escapeHtml(data.studentName)}</dd></div>
                <div><dt>Roll No</dt><dd>${escapeHtml(data.identity)}</dd></div>
                <div><dt>CNIC</dt><dd>${escapeHtml(data.cnic)}</dd></div>
                <div><dt>Program</dt><dd>${escapeHtml(data.programName)} (${escapeHtml(data.programLevel)})</dd></div>
                <div><dt>Semester</dt><dd>${escapeHtml(data.semester)}</dd></div>
                <div><dt>Fee Type</dt><dd>${escapeHtml(data.optionLabel)}</dd></div>
                <div><dt>Base Amount</dt><dd>${escapeHtml(formatCurrency(data.baseAmount))}</dd></div>
                <div><dt>Late Fee</dt><dd>${escapeHtml(formatCurrency(data.lateFee))}</dd></div>
                <div><dt>Total Rs.</dt><dd>${escapeHtml(formatCurrency(data.totalAmount))}</dd></div>
                <div><dt>Issue Date</dt><dd>${escapeHtml(formatDate(data.issueDate))}</dd></div>
                <div><dt>Due Date</dt><dd>${escapeHtml(formatDate(data.dueDate))}</dd></div>
                <div><dt>Bank</dt><dd>${escapeHtml(data.bank.name)}</dd></div>
            </dl>
        `;

        if (elements.previewBarcode) {
            elements.previewBarcode.textContent = `Verification ID: ${data.challanNo}`;
        }

        if (elements.downloadButton) {
            elements.downloadButton.disabled = false;
        }
    }

    function populateFormFromDraft(draft) {
        if (!draft || !isFormPage) return;

        if (elements.challanType && draft.type) {
            elements.challanType.value = draft.type;
        }
        if (elements.programLevel && draft.programLevel) {
            elements.programLevel.value = draft.programLevel;
        }
        if (elements.programLevel) populatePrograms();
        if (elements.programName && draft.programId) {
            elements.programName.value = draft.programId;
        }
        if (elements.semesterNo) elements.semesterNo.value = draft.semester || 1;
        if (elements.dueDate) elements.dueDate.value = draft.dueDate || defaultDueDate();
        if (elements.quantity) elements.quantity.value = draft.quantity || 1;
        if (elements.studentName) elements.studentName.value = draft.studentName || '';
        if (elements.studentRollNo) elements.studentRollNo.value = draft.identity || '';
        if (elements.studentCnic) elements.studentCnic.value = draft.cnic || '';

        populateSpecificOptions();
        if (elements.hostel && draft.hostelId) {
            elements.hostel.value = draft.hostelId;
        }
        if (elements.option && draft.optionValue) {
            elements.option.value = draft.optionValue;
        }

        updatePreview(getChallanData(draft.challanNo));
    }

    function attachEvents() {
        if (!form) return;

        elements.programLevel?.addEventListener('change', () => {
            populatePrograms();
            populateSpecificOptions();
            updatePreview();
        });

        [elements.challanType, elements.programName, elements.semesterNo, elements.option, elements.hostel, elements.studentName, elements.studentRollNo, elements.studentCnic, elements.dueDate, elements.quantity]
            .filter(Boolean)
            .forEach(element => {
                element.addEventListener('input', () => {
                    if (element === elements.challanType) populateSpecificOptions();
                    updatePreview();
                });
                element.addEventListener('change', () => {
                    if (element === elements.challanType) populateSpecificOptions();
                    updatePreview();
                });
            });

        elements.reset?.addEventListener('click', () => {
            form.reset();
            if (elements.dueDate) elements.dueDate.value = defaultDueDate();
            loadStudentDefaults();
            populateLevels();
            populatePrograms();
            populateSpecificOptions();
            updatePreview();
        });

        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!form.reportValidity()) return;

            const existingDraft = loadSavedDraft();
            const challanNo = existingDraft?.challanNo || nextChallanNo(true);
            const data = getChallanData(challanNo);
            saveDraft(data);
            window.location.href = 'challan-preview.html';
        });
    }

    function attachPreviewEvents(draft) {
        if (!elements.downloadButton) return;
        elements.downloadButton.disabled = false;

        elements.downloadButton.addEventListener('click', async () => {
            if (!draft) return;
            await downloadPdf(draft);
        });
    }

    async function initFormPage() {
        if (elements.dueDate) elements.dueDate.value = defaultDueDate();
        loadStudentDefaults();
        await loadMeta();
        populateLevels();
        populatePrograms();
        populateSpecificOptions();

        const savedDraft = loadSavedDraft();
        if (savedDraft) {
            populateFormFromDraft(savedDraft);
        } else {
            updatePreview();
        }

        attachEvents();
    }

    async function initPreviewPage() {
        const draft = loadSavedDraft();
        if (!draft) {
            if (elements.previewBody) {
                elements.previewBody.textContent = 'No challan data found. Please start from the challan generator page.';
            }
            if (elements.downloadButton) {
                elements.downloadButton.disabled = true;
            }
            return;
        }

        renderPreviewPage(draft);
        attachPreviewEvents(draft);
    }

    async function init() {
        if (isFormPage) {
            await initFormPage();
        }
        if (isPreviewPage) {
            await initPreviewPage();
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
