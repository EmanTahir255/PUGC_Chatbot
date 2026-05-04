const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool, sql } = require('../db');

async function checkSchema() {
    try {
        const pool = await getPool();
        const faqCols = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'faq_answers'");
        const trainingCols = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'training_examples'");
        const intentCols = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'intents'");
        
        console.log('FAQ_ANSWERS:', faqCols.recordset.map(c => c.COLUMN_NAME));
        console.log('TRAINING_EXAMPLES:', trainingCols.recordset.map(c => c.COLUMN_NAME));
        console.log('INTENTS:', intentCols.recordset.map(c => c.COLUMN_NAME));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
