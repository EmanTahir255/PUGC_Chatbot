// ============================================================
// chat_logger.js  —  place this file at:  backend/chat_logger.js
//
// Import it in routes/chat.js and call logChat() after every
// response is sent.  This keeps all logging in one place and
// does NOT change any of your existing chat logic.
// ============================================================

const { getPool, sql } = require('./db');

/**
 * Log one chatbot interaction to the chat_logs table.
 *
 * @param {string}      questionText   The original user message
 * @param {string|null} detectedIntent The Rasa / Groq intent name (or null)
 * @param {boolean}     wasAnswered    true if a real answer was returned
 * @param {string|null} answerSource   e.g. 'rasa_dynamic', 'groq_general', 'fallback'
 */
async function logChat(questionText, detectedIntent, wasAnswered, answerSource) {
    try {
        const pool = await getPool();
        await pool.request()
            .input('questionText',   sql.NVarChar(1000), String(questionText || '').slice(0, 1000))
            .input('detectedIntent', sql.NVarChar(200),  detectedIntent || null)
            .input('wasAnswered',    sql.Bit,            wasAnswered ? 1 : 0)
            .input('answerSource',   sql.NVarChar(100),  answerSource || null)
            .query(`
                INSERT INTO chat_logs
                    (question_text, detected_intent, was_answered, answer_source, created_at)
                VALUES
                    (@questionText, @detectedIntent, @wasAnswered, @answerSource, GETDATE())
            `);
    } catch (err) {
        // Never crash the chat response because of a logging failure
        console.error('chat_logger error (non-fatal):', err.message);
    }
}

module.exports = { logChat };
