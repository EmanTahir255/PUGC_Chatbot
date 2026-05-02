require("dotenv").config();
const sql = require("mssql");

const dbConfig = {
  server: "localhost",
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    instanceName: process.env.DB_INSTANCE,  // 🔥 dynamic
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  connectionTimeout: 30000,
};

let pool;

async function getPool() {
  try {
    if (!pool) {
      pool = await sql.connect(dbConfig);
      console.log("✅ Connected to SQL Server");
    }
    return pool;
  } catch (error) {
    console.error("❌ DB Connection Error:", error.message);
    throw error;
  }
}

module.exports = { sql, getPool };