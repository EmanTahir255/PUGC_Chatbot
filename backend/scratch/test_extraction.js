const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { extractQueryParameters } = require('../gemini');
const DB_SCHEMA = require('../config/db_schema');

async function testExtraction() {
    const message = 'any upcoming events';
    const hints = {
        event_name: ['Job Fair', 'AI Chatbot Development Workshop']
    };
    
    console.log('Testing extraction for:', message);
    const params = await extractQueryParameters(message, DB_SCHEMA, hints);
    console.log('Extracted Params:', JSON.stringify(params, null, 2));
    
    process.exit(0);
}

testExtraction();
