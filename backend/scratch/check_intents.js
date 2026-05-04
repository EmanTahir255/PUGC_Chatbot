const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool, sql } = require('../db');

async function checkIntents() {
    try {
        const pool = await getPool();
        const result = await pool.request().query("SELECT TOP 20 intent_name, description FROM intents");
        console.table(result.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkIntents();
