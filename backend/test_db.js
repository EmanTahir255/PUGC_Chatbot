require("dotenv").config();
const sql = require("mssql");

const dbConfig = {
  server: "localhost",
  port: 1433,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  connectionTimeout: 5000,
};

async function test() {
  try {
    await sql.connect(dbConfig);
    console.log("Connected on port 1433!");
    process.exit(0);
  } catch (err) {
    console.error("Failed on port 1433:", err.message);
    process.exit(1);
  }
}

test();
