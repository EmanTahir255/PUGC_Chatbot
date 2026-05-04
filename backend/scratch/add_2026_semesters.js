const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool, sql } = require('../db');

async function addSemesters() {
    try {
        const pool = await getPool();
        
        const semesters = [
            { name: 'Spring 2026', type: 'Spring', year: 2026 },
            { name: 'Fall 2026', type: 'Fall', year: 2026 },
            { name: 'Summer 2026', type: 'Summer', year: 2026 }
        ];

        for (const sem of semesters) {
            // Check if already exists
            const check = await pool.request()
                .input('name', sql.NVarChar, sem.name)
                .query('SELECT semester_id FROM semesters WHERE semester_name = @name');
            
            if (check.recordset.length === 0) {
                console.log(`Adding ${sem.name}...`);
                await pool.request()
                    .input('name', sql.NVarChar, sem.name)
                    .input('type', sql.NVarChar, sem.type)
                    .input('year', sql.Int, sem.year)
                    .query('INSERT INTO semesters (semester_name, semester_type, year) VALUES (@name, @type, @year)');
            } else {
                console.log(`${sem.name} already exists.`);
            }
        }

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Error adding semesters:', err);
        process.exit(1);
    }
}

addSemesters();
