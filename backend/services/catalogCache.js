// Fast Catalog Cache - Replaces slow loadStructuredCatalog() every request

const { getPool } = require('../db');
const { dbSchema } = require('../config/dbSchema');

class CatalogCache {
  constructor() {
    this.cache = null;
    this.lastRefresh = 0;
    this.refreshInterval = 2 * 60 * 1000; // 2 minutes
  }

  async refresh() {
    try {
      const pool = await getPool();
      const catalogs = {};

      // Load all allowed tables efficiently
      for (const table of dbSchema.allowedTables) {
        const result = await pool.request().query(
          `SELECT TOP 50 * FROM ${table} WHERE is_active = 1 ORDER BY 1`
        );
        catalogs[table] = result.recordset;
      }

      // Pre-join common views
      const programFees = await pool.request().query(`
        SELECT TOP 20 p.program_name, p.dept_name, ft.fee_type_name, fs.amount, fs.effective_from
        FROM programs p 
        JOIN fee_structure fs ON p.program_id = fs.program_id 
        JOIN fee_types ft ON fs.fee_type_id = ft.fee_type_id
        WHERE fs.effective_to IS NULL OR fs.effective_to >= CAST(GETDATE() AS DATE)
        ORDER BY p.program_name, ft.fee_type_name
      `);
      catalogs.program_fees = programFees.recordset;

      this.cache = catalogs;
      this.lastRefresh = Date.now();
      console.log('✅ Catalog refreshed:', Object.keys(catalogs).length, 'tables');
      
      return this.cache;
    } catch (error) {
      console.error('Catalog refresh error:', error.message);
      return this.cache; // Return old cache
    }
  }

  async getCatalog() {
    if (!this.cache || Date.now() - this.lastRefresh > this.refreshInterval) {
      return this.refresh();
    }
    return this.cache;
  }

  // Quick lookup helpers
  async findProgram(question) {
    const catalog = await this.getCatalog();
    // Simple fuzzy match (will integrate with queryEngine later)
    const programs = catalog.programs || [];
    return programs.find(p => 
      question.toLowerCase().includes(p.program_name.toLowerCase().split(' ')[0])
    );
  }
}

// Singleton
module.exports = new CatalogCache();
