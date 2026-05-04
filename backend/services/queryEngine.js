// Dynamic Text-to-SQL Engine for PUGC Bot
// Converts "CS department fee" → safe SQL → live results

const { getPool } = require('../db');
const { runChatWithFallback } = require('../gemini'); // Reuse existing AI

const ALLOWED_TABLES = [
  'departments', 'programs', 'fee_types', 'fee_structure', 
  'scholarship_types', 'scholarships', 'events', 'event_types'
];

const SCHEMA_DESC = `
PUGC University Database Schema (MSSQL):
- departments(dept_name, head_name, contact_number, email, office_hours, block_location)
- programs(program_name, dept_name, duration_years, total_credit_hrs, total_semesters)
- fee_types(fee_type_name), fee_structure(program_name, fee_type_name, amount, effective_from)
- scholarship_types(type_name, min_cgpa_required, benefit_percentage), scholarships(type_name, application_deadline, semester_name)
- events(event_name, event_date, venue, registration_required), event_types(type_name)

Use JOINs. Filter with WHERE. Limit TOP 10. Current date: use GETDATE()
`;

class QueryEngine {
  constructor() {
    this.cache = new Map(); // Simple in-memory cache
  }

  async generateSQL(question) {
    const prompt = `Convert this question to safe MSSQL query using ONLY these tables: ${ALLOWED_TABLES.join(', ')}.

Question: "${question}"

${SCHEMA_DESC}

Rules:
- SELECT specific columns (no SELECT *)
- Use TOP 10 for lists
- JOIN related tables (programs→departments, fee_structure→programs+fee_types)
- WHERE for filters (program_name LIKE '%CS%', event_date > GETDATE())
- ORDER BY relevant field
- Return ONLY the SQL query, nothing else.

SQL:`;

    const messages = [{ role: 'user', content: prompt }];
    const sql = await runChatWithFallback(messages, 200, 0.1, 'SQL Generation');
    
    return sql?.trim() || null;
  }

  isSafeSQL(sql) {
    const upper = sql.toUpperCase();
    // Block dangerous patterns
    const banned = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE', 'EXEC', '; --', 'UNION SELECT'];
    return !banned.some(bad => upper.includes(bad)) && ALLOWED_TABLES.some(table => upper.includes(` ${table} `));
  }

  async execute(question) {
    const cacheKey = question.toLowerCase();
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    const sql = await this.generateSQL(question);
    if (!sql || !this.isSafeSQL(sql)) {
      return { error: 'Could not generate safe query', sql };
    }

    try {
      const pool = await getPool();
      const result = await pool.request().query(sql);
      
      const answer = this.formatResults(result.recordset, question);
      const response = { success: true, data: answer, sql, rows: result.recordset.length };
      
      // Cache 5min
      this.cache.set(cacheKey, response);
      setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
      
      return response;
    } catch (error) {
      return { error: error.message, sql };
    }
  }

  formatResults(rows, question) {
    if (rows.length === 0) return '<b>No matching records found</b>';
    
    const questionLower = question.toLowerCase();
    let html = '<ul>';
    
    rows.slice(0, 10).forEach(row => {
      let line = '';
      if (questionLower.includes('fee') || questionLower.includes('amount')) {
        const amount = row.amount || row.monthly_fee || 0;
        line = `<li><b>${row.program_name || row.dept_name || row.event_name}:</b> Rs. ${Number(amount).toLocaleString()}</li>`;
      } else if (questionLower.includes('hod') || questionLower.includes('head')) {
        line = `<li><b>${row.dept_name}:</b> ${row.head_name} (${row.contact_number})</li>`;
      } else if (questionLower.includes('event')) {
        line = `<li><b>${row.event_name}:</b> ${row.event_date} at ${row.venue}</li>`;
      } else {
        line = `<li>${JSON.stringify(row)}</li>`;
      }
      html += line;
    });
    
    return html + '</ul>';
  }
}

module.exports = new QueryEngine();
