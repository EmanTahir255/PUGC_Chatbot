const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');
const Groq = require('groq-sdk');
const { requireAuth, requireRole } = require('../middleware/auth');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Auth guard (same pattern as admin.js) ──────────────────────────
router.use(requireAuth, requireRole('admin'));

// ── Helpers ────────────────────────────────────────────────────────
function dateParam(value) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function getPriorityLabel(count) {
    if (count >= 6) return 'HIGH';
    if (count >= 3) return 'MEDIUM';
    return 'LOW';
}

function categoriseByKeyword(question) {
    const q = question.toLowerCase();
    if (/fee|tuition|challan|payment|scholarship|refund|late fee/.test(q)) return 'Fee Related';
    if (/admiss|apply|entry test|merit|documents|form|deadline/.test(q)) return 'Admissions';
    if (/hostel|transport|bus|parking|gym|cafeteria|wifi|library|lab|health/.test(q)) return 'Facilities';
    if (/exam|result|grade|cgpa|attendance|backlog|recheck|semester/.test(q)) return 'Academics';
    if (/department|hod|dean|contact|phone|email|office/.test(q)) return 'Contacts & Departments';
    return 'Other';
}

// ── AI Suggestions via Groq ────────────────────────────────────────
async function generateAISuggestions(unansweredQuestions, summaryData, dateLabel) {
    try {
        const topQuestions = unansweredQuestions.slice(0, 10)
            .map((q, i) => `${i + 1}. "${q.question_text}" — asked ${q.frequency} times`)
            .join('\n');

        const prompt = `You are an AI assistant helping improve a university chatbot for PUGC (Punjab University Gujranwala Campus).

Report period: ${dateLabel}
Total questions asked: ${summaryData.total}
Successfully answered: ${summaryData.answered}
Unanswered: ${summaryData.unanswered}
Accuracy rate: ${summaryData.accuracy}%

Top unanswered student questions:
${topQuestions}

Based on this data, provide exactly 5 specific, actionable improvement suggestions for the PUGC admin team.
Each suggestion must:
- Start with an action verb (Add, Update, Create, Expand, Fix)
- Reference a specific question or topic from the data
- Be one sentence only
- Be practical and realistic

Return ONLY a JSON array of 5 strings. No explanation, no markdown, no preamble. Example format:
["suggestion 1", "suggestion 2", "suggestion 3", "suggestion 4", "suggestion 5"]`;

        const completion = await groq.chat.completions.create({
            model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 400,
            temperature: 0.3
        });

        const raw = completion.choices?.[0]?.message?.content?.trim() || '[]';
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
    } catch (err) {
        console.error('AI suggestions error:', err.message);
        return [
            'Add detailed fee information for all programs in the database.',
            'Update admission deadline information for the current academic year.',
            'Expand hostel availability and room details in the knowledge base.',
            'Add transport route schedules and timings to the chatbot database.',
            'Review and update FAQ answers for the most frequently asked unanswered questions.'
        ];
    }
}

// ── Main Report Endpoint ───────────────────────────────────────────
router.get('/report', async (req, res) => {
    try {
        const pool = await getPool();

        // Date range from query params
        const range = req.query.range || '7';
        let startDate, endDate, dateLabel;

        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);

        if (req.query.startDate && req.query.endDate) {
            startDate = new Date(req.query.startDate);
            startDate.setHours(0, 0, 0, 0);
            const customEnd = new Date(req.query.endDate);
            customEnd.setHours(23, 59, 59, 999);
            endDate = customEnd;
            dateLabel = `${req.query.startDate} to ${req.query.endDate}`;
        } else {
            const days = parseInt(range, 10) || 7;
            startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            startDate.setHours(0, 0, 0, 0);
            dateLabel = `Last ${days} days`;
        }

        const startStr = startDate.toISOString().slice(0, 19).replace('T', ' ');
        const endStr = endDate.toISOString().slice(0, 19).replace('T', ' ');

        // Previous period for trend comparison
        const periodMs = endDate - startDate;
        const prevEnd = new Date(startDate.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - periodMs);
        const prevStartStr = prevStart.toISOString().slice(0, 19).replace('T', ' ');
        const prevEndStr = prevEnd.toISOString().slice(0, 19).replace('T', ' ');

        // ── Run all DB queries in parallel ──────────────────────────
        const [
            summaryResult,
            prevSummaryResult,
            unansweredResult,
            dailyResult,
            intentResult
        ] = await Promise.all([

            // 1. Summary for current period
            pool.request()
                .input('start', sql.VarChar, startStr)
                .input('end', sql.VarChar, endStr)
                .query(`
                    SELECT
                        COUNT(*) AS total,
                        SUM(CASE WHEN was_answered = 1 THEN 1 ELSE 0 END) AS answered,
                        SUM(CASE WHEN was_answered = 0 THEN 1 ELSE 0 END) AS unanswered
                    FROM chat_logs
                    WHERE created_at BETWEEN @start AND @end
                `),

            // 2. Summary for previous period (for trend)
            pool.request()
                .input('prevStart', sql.VarChar, prevStartStr)
                .input('prevEnd', sql.VarChar, prevEndStr)
                .query(`
                    SELECT
                        COUNT(*) AS total,
                        SUM(CASE WHEN was_answered = 1 THEN 1 ELSE 0 END) AS answered,
                        SUM(CASE WHEN was_answered = 0 THEN 1 ELSE 0 END) AS unanswered
                    FROM chat_logs
                    WHERE created_at BETWEEN @prevStart AND @prevEnd
                `),

            // 3. Top unanswered questions ranked by frequency
            pool.request()
                .input('start', sql.VarChar, startStr)
                .input('end', sql.VarChar, endStr)
                .query(`
                    SELECT TOP 15
                        question_text,
                        COUNT(*) AS frequency
                    FROM chat_logs
                    WHERE was_answered = 0
                      AND created_at BETWEEN @start AND @end
                    GROUP BY question_text
                    ORDER BY frequency DESC
                `),

            // 4. Daily activity for chart (last 30 days max)
            pool.request()
                .input('start', sql.VarChar, startStr)
                .input('end', sql.VarChar, endStr)
                .query(`
                    SELECT
                        CONVERT(VARCHAR(10), created_at, 120) AS day,
                        COUNT(*) AS total,
                        SUM(CASE WHEN was_answered = 1 THEN 1 ELSE 0 END) AS answered,
                        SUM(CASE WHEN was_answered = 0 THEN 1 ELSE 0 END) AS unanswered
                    FROM chat_logs
                    WHERE created_at BETWEEN @start AND @end
                    GROUP BY CONVERT(VARCHAR(10), created_at, 120)
                    ORDER BY day ASC
                `),

            // 5. Intent breakdown — which intents fired most
            pool.request()
                .input('start', sql.VarChar, startStr)
                .input('end', sql.VarChar, endStr)
                .query(`
                    SELECT TOP 10
                        detected_intent,
                        COUNT(*) AS count
                    FROM chat_logs
                    WHERE detected_intent IS NOT NULL
                      AND created_at BETWEEN @start AND @end
                    GROUP BY detected_intent
                    ORDER BY count DESC
                `)
        ]);

        // ── Process summary data ─────────────────────────────────
        const curr = summaryResult.recordset[0] || { total: 0, answered: 0, unanswered: 0 };
        const prev = prevSummaryResult.recordset[0] || { total: 0, answered: 0, unanswered: 0 };

        const total = curr.total || 0;
        const answered = curr.answered || 0;
        const unanswered = curr.unanswered || 0;
        const accuracy = total > 0 ? Math.round((answered / total) * 100) : 0;

        const prevTotal = prev.total || 0;
        const trendPct = prevTotal > 0
            ? Math.round(((total - prevTotal) / prevTotal) * 100)
            : (total > 0 ? 100 : 0);
        const trendDirection = trendPct >= 0 ? 'up' : 'down';

        // ── Process unanswered questions ─────────────────────────
        const unansweredList = unansweredResult.recordset.map(row => ({
            question_text: row.question_text,
            frequency: row.frequency,
            priority: getPriorityLabel(row.frequency),
            category: categoriseByKeyword(row.question_text)
        }));

        // ── Category breakdown from unanswered questions ─────────
        const categoryMap = {};
        unansweredList.forEach(item => {
            categoryMap[item.category] = (categoryMap[item.category] || 0) + item.frequency;
        });
        const categoryBreakdown = Object.entries(categoryMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        // ── Priority counts ──────────────────────────────────────
        const priorityCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
        unansweredList.forEach(item => priorityCounts[item.priority]++);

        // ── Daily chart data ─────────────────────────────────────
        const dailyData = dailyResult.recordset.map(row => ({
            day: row.day,
            total: row.total,
            answered: row.answered,
            unanswered: row.unanswered
        }));

        // ── Intent breakdown ─────────────────────────────────────
        const intentBreakdown = intentResult.recordset.map(row => ({
            intent: (row.detected_intent || '').replace(/_/g, ' '),
            count: row.count
        }));

        // ── AI suggestions (Groq) ────────────────────────────────
        const summaryForAI = { total, answered, unanswered, accuracy };
        const aiSuggestions = await generateAISuggestions(unansweredList, summaryForAI, dateLabel);

        // ── Build final response ─────────────────────────────────
        return res.json({
            meta: {
                dateLabel,
                generatedAt: new Date().toISOString(),
                range: req.query.range || '7'
            },
            summary: {
                total,
                answered,
                unanswered,
                accuracy,
                trend: { pct: Math.abs(trendPct), direction: trendDirection }
            },
            unansweredQuestions: unansweredList,
            categoryBreakdown,
            priorityCounts,
            dailyActivity: dailyData,
            intentBreakdown,
            aiSuggestions
        });

    } catch (error) {
        console.error('Report error:', error);
        return res.status(500).json({ error: 'Failed to generate report. Please try again.' });
    }
});

module.exports = router;
