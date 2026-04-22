const sql = require('mssql');

const config = {
    server: 'localhost',
    database: 'PUGC_ChatbotDB',
    port: 1433,
    user: 'pugc_user',
    password: 'Pugc@1234',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    connectionTimeout: 30000
};

let pool;

async function getPool() {
    if (!pool) {
        pool = await sql.connect(config);
        console.log('Connected to SQL Server successfully');
    }
    return pool;
}

module.exports = { getPool, sql };
