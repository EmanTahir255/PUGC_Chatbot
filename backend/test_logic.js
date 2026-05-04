require('dotenv').config();
const { getPool, sql } = require('./db');
const { getProgramsAnswer, getDepartmentAnswer } = require('./routes/chat'); // Not exported
