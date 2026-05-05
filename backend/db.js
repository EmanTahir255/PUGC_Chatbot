require("dotenv").config();
const sql = require("mssql");

const dbConfig = {
  server: process.env.DB_SERVER || "localhost",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    instanceName: process.env.DB_INSTANCE,
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true",
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