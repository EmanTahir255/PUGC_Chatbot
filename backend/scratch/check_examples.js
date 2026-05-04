const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool, sql } = require('../db');

async function checkExamples() {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT TOP 20 i.intent_name, te.example_text 
            FROM training_examples te
            JOIN intents i ON te.intent_id = i.intent_id
            WHERE i.intent_name IN ('ask_academic_calendar', 'ask_academic_probation', 'ask_accounts_contact')
            ORDER BY i.intent_name, te.example_id
        `);
        console.table(result.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkExamples();
