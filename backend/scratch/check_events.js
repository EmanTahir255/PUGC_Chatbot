const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool, sql } = require('../db');

async function checkEvents() {
    try {
        const pool = await getPool();
        const result = await pool.request().query('SELECT event_id, event_name, event_date, event_end_date FROM events ORDER BY event_date');
        console.log('--- Current Events in DB ---');
        console.table(result.recordset);
        
        const nowResult = await pool.request().query('SELECT GETDATE() as current_db_time');
        console.log('Current DB Time:', nowResult.recordset[0].current_db_time);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkEvents();
