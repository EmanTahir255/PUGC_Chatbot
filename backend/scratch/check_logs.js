const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool, sql } = require('../db');

async function checkLogs() {
    try {
        const pool = await getPool();
        const result = await pool.request().query('SELECT TOP 10 log_id, question_text, detected_intent, was_answered, answer_source, created_at FROM chat_logs ORDER BY log_id DESC');
        console.table(result.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkLogs();
