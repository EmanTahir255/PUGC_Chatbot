require("dotenv").config();
const sql = require("mssql");

const dbConfig = {
  server: "localhost",
  port: 1433,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  driver: "msnodesqlv8",
  connectionTimeout: 5000,
};

async function test() {
  try {
    const pool = await sql.connect(dbConfig);
    console.log("Connected using Windows Auth on port 1433!");
    process.exit(0);
  } catch (err) {
    console.error("Failed using Windows Auth on port 1433:", err.message);
    process.exit(1);
  }
}

test();
