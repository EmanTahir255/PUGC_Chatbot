const express = require('express');
const router = express.Router();
const { getPool } = require('../db');

router.get('/meta', async (req, res) => {
    try {
        const pool = await getPool();

        const [programsResult, feesResult, hostelsResult] = await Promise.all([
            pool.request().query(`
                SELECT program_id, program_name, program_level, total_semesters, is_active
                FROM programs
                WHERE is_active = 1
                ORDER BY program_level, program_name
            `),
            pool.request().query(`
                SELECT fs.fee_structure_id, fs.program_id, fs.fee_type_id, fs.amount,
                       fs.effective_from, fs.effective_to, ft.fee_type_name
                FROM fee_structure fs
                JOIN fee_types ft ON fs.fee_type_id = ft.fee_type_id
                WHERE fs.effective_from <= CAST(GETDATE() AS date)
                  AND (fs.effective_to IS NULL OR fs.effective_to >= CAST(GETDATE() AS date))
                ORDER BY fs.program_id, ft.fee_type_name
            `),
            pool.request().query(`
                SELECT h.hostel_id, h.hostel_name, ht.type_name AS hostel_type,
                       h.monthly_fee_meal, h.monthly_fee_no_meal, h.security_deposit
                FROM hostels h
                JOIN hostel_types ht ON h.hostel_type_id = ht.hostel_type_id
                WHERE h.is_active = 1
                ORDER BY h.hostel_name
            `).catch(() => ({ recordset: [] }))
        ]);

        return res.json({
            programs: programsResult.recordset,
            feeStructures: feesResult.recordset,
            hostels: hostelsResult.recordset,
            fixedFees: {
                admission: 2000,
                transcript: {
                    normal: 3000,
                    urgent: 5000
                },
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
                lateFee: 500
            },
            bank: {
                name: 'Habib Bank Limited',
                accountTitle: 'PUGC Fee Collection',
                branch: 'University of the Punjab Gujranwala Campus'
            }
        });
    } catch (error) {
        console.error('Challan meta error:', error);
        return res.status(500).json({ error: 'Failed to load challan reference data.' });
    }
});

module.exports = router;
