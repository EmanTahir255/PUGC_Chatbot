const DB_SCHEMA = require('../config/db_schema');

function testQueryBuilding(params) {
    const { targetTable, filters, requiredFields, timeScope } = params;
    const schema = DB_SCHEMA[targetTable];

    const selectCols = requiredFields && requiredFields.length > 0
        ? requiredFields.filter(col => schema.columns[col] || col === schema.primary_key)
        : Object.keys(schema.columns);

    let query = `SELECT TOP 20 ${selectCols.join(', ')} FROM ${targetTable}`;
    const filterClauses = [];
    
    if (timeScope && timeScope !== 'all' && (schema.columns.event_date || schema.columns.application_deadline)) {
        const dateCol = schema.columns.event_date ? 'event_date' : 'application_deadline';
        const endDateCol = schema.columns.event_end_date ? 'event_end_date' : dateCol;
        
        if (timeScope === 'upcoming') {
            filterClauses.push(`${dateCol} > GETDATE()`);
        } else if (timeScope === 'past') {
            filterClauses.push(`${endDateCol} < GETDATE()`);
        } else if (timeScope === 'present') {
            filterClauses.push(`CAST(GETDATE() AS DATE) BETWEEN CAST(${dateCol} AS DATE) AND CAST(${endDateCol} AS DATE)`);
        }
    }

    if (filters && typeof filters === 'object') {
        Object.entries(filters).forEach(([col, val], index) => {
            if (schema.columns[col] || col === schema.primary_key || (schema.foreign_keys && schema.foreign_keys[col])) {
                const paramName = `val${index}`;
                if (typeof val === 'string') {
                    filterClauses.push(`${col} LIKE '%' + @${paramName} + '%'`);
                } else {
                    filterClauses.push(`${col} = @${paramName}`);
                }
            }
        });
    }

    if (schema.columns.is_active) {
        filterClauses.push('is_active = 1');
    }

    if (filterClauses.length > 0) {
        query += ` WHERE ${filterClauses.join(' AND ')}`;
    }

    if (schema.columns.event_date) query += ' ORDER BY event_date ASC';

    return query;
}

const params = {
  "targetTable": "events",
  "filters": {},
  "timeScope": "upcoming",
  "requiredFields": ["event_name", "event_date", "venue"]
};

console.log('Generated Query:', testQueryBuilding(params));
