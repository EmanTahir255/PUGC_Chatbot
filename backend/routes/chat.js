const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getPool, sql } = require('../db');
const {
    extractIntentFromQuestion,
    getGroqResponse,
    isAnswerRelevant,
    refineAnswerWithDBContext,
    getGroundedGroqResponse
} = require('../gemini');

async function getAnswerFromDB(intent, pool) {
    const result = await pool.request()
        .input('intent', sql.VarChar, intent)
        .query('SELECT answer_text FROM vw_faq_complete WHERE intent_name = @intent AND is_active = 1');
    return result.recordset.length > 0 ? result.recordset[0].answer_text : null;
}

function cleanMessageText(text = '') {
    return String(text).replace(/<[^>]*>/g, '').trim();
}

function isTransientBotMessage(msg) {
    const text = cleanMessageText(msg?.text).toLowerCase();
    return msg?.sender === 'bot' && (
        text === 'ai is thinking...' ||
        text === 'ai is thinking' ||
        text === 'typing...' ||
        text === 'loading...'
    );
}

function sanitizeHistory(history) {
    if (!Array.isArray(history)) return [];
    // Drop temporary UI messages before using history for context or Groq prompts.
    return history
        .filter(msg => msg && !isTransientBotMessage(msg))
        .map(msg => ({
            sender: msg.sender,
            text: cleanMessageText(msg.text)
        }))
        .filter(msg => msg.text.length > 0);
}

function buildConversationHistory(history) {
    if (!history || history.length === 0) return [];
    return history.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
    }));
}

function isVagueMessage(message) {
    const vaguePatterns = [
        /\bit\b/i,          // any message containing "it"
        /\bthis\b/i,        // any message containing "this"
        /\bthat\b/i,        // any message containing "that"
        /\bsame\b/i,        // any message containing "same"
        /\bits\b/i,         // any message containing "its"
        /tell me more/i,
        /what else/i,
        /elaborate/i,
        /explain more/i,
        /more details/i,
        /and the fee/i,
        /what about/i
    ];
    return vaguePatterns.some(p => p.test(message.trim()));
}

function getLastBotTopic(history) {
    if (!history || history.length === 0) return null;

    // Get last user message topic for better context
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].sender === 'bot') {
            const text = history[i].text;
            // Get first meaningful line
            const lines = text.split('\n').filter(l => l.trim().length > 3);
            if (lines.length > 0) {
                // Return first 5 words of first line as topic
                const words = lines[0].trim().split(' ').slice(0, 5).join(' ');
                return words;
            }
        }
    }
    return null;
}

async function sendDBAnswerOrRefinedResponse(
    res,
    message,
    dbAnswer,
    conversationHistory,
    source,
    allowRefinement = true
) {
    // Prefer database facts, then let Groq present them in a friendlier form.
    const relevant = await isAnswerRelevant(message, dbAnswer, conversationHistory);

    if (relevant) {
        console.log(`Source: ${source}, refining DB answer for presentation`);
        const refinedAnswer = await refineAnswerWithDBContext(message, dbAnswer, conversationHistory);
        return res.json({ reply: refinedAnswer || dbAnswer, source: `${source}_refined` });
    }

    if (!allowRefinement) {
        console.log(`Source: ${source} not relevant, using grounded Groq fallback`);
        const groqAnswer = await getGroundedGroqResponse(message, dbAnswer, conversationHistory);
        if (groqAnswer) {
            return res.json({ reply: groqAnswer, source: 'groq_grounded' });
        }

        return res.json({ reply: dbAnswer, source });
    }

    console.log(`Source: ${source} not directly relevant, refining with Groq`);
    const refinedAnswer = await refineAnswerWithDBContext(message, dbAnswer, conversationHistory);
    if (refinedAnswer) {
        return res.json({ reply: refinedAnswer, source: `${source}_refined` });
    }

    return res.json({ reply: dbAnswer, source });
}

router.post('/chat', async (req, res) => {
    const { message, history } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        const pool = await getPool();
        const cleanHistory = sanitizeHistory(history);

        // Build conversation history for Groq context
        const conversationHistory = buildConversationHistory(cleanHistory);

        // Enrich vague messages with context from history
        let enrichedMessage = message;
        if (isVagueMessage(message) && cleanHistory.length > 0) {
            const lastTopic = getLastBotTopic(cleanHistory);
            if (lastTopic) {
                enrichedMessage = `${message} ${lastTopic}`;
                console.log(`Enriched message: ${enrichedMessage}`);
            }
        }

        // LAYER 1: Rasa intent detection (use enriched message)
        const rasaResponse = await axios.post(
            `${process.env.RASA_URL}/model/parse`,
            { text: enrichedMessage }
        );

        const intent = rasaResponse.data.intent.name;
        const confidence = rasaResponse.data.intent.confidence;

        console.log(`Intent: ${intent} | Confidence: ${confidence}`);

        // LAYER 2: DB lookup with Rasa intent
        if (confidence >= 0.5) {
            const dbAnswer = await getAnswerFromDB(intent, pool);
            if (dbAnswer) {
                return await sendDBAnswerOrRefinedResponse(
                    res,
                    enrichedMessage,
                    dbAnswer,
                    conversationHistory,
                    'rasa_db',
                    true
                );
            }

            // Rasa confident but no DB answer
            if (confidence >= 0.50) {
                console.log('Rasa confident but no DB answer, Groq general...');
                const groqAnswer = await getGroqResponse(message, conversationHistory);
                if (groqAnswer) {
                    return res.json({ reply: groqAnswer, source: 'groq_general' });
                }
            }
        }

        // LAYER 3: Groq extracts intent → DB lookup
        console.log('Trying Groq intent extraction...');
        const extractedIntent = await extractIntentFromQuestion(enrichedMessage);
        console.log(`Groq extracted intent: ${extractedIntent}`);

        if (extractedIntent) {
            const dbAnswer = await getAnswerFromDB(extractedIntent, pool);
            if (dbAnswer) {
                return await sendDBAnswerOrRefinedResponse(
                    res,
                    enrichedMessage,
                    dbAnswer,
                    conversationHistory,
                    'groq_db',
                    false
                );
            }
        }

        // LAYER 4: Groq general response with conversation history
        console.log('Trying Groq general response...');
        const groqAnswer = await getGroqResponse(message, conversationHistory);
        if (groqAnswer) {
            console.log('Source: Groq general');
            return res.json({ reply: groqAnswer, source: 'groq' });
        }

        // LAYER 5: Final fallback
        return res.json({
            reply: '<b>Sorry, I could not find an answer.</b><br><br>Please contact PUGC directly:<br>Phone: <b>055-9200001</b><br>Email: info@pugc.edu.pk',
            source: 'fallback'
        });

    } catch (error) {
        console.error('Full error:', error);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

module.exports = router;
