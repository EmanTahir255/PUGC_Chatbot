const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool, sql } = require('../db');

async function testUpcomingQuery() {
    try {
        const pool = await getPool();
        const query = 'SELECT event_name, event_date FROM events WHERE event_date > GETDATE() AND is_active = 1 ORDER BY event_date ASC';
        console.log('Running Query:', query);
        const result = await pool.request().query(query);
        console.table(result.recordset);
        
        const allQuery = 'SELECT event_name, event_date, is_active FROM events ORDER BY event_date ASC';
        console.log('All Events:');
        const allResult = await pool.request().query(allQuery);
        console.table(allResult.recordset);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testUpcomingQuery();
