const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Import routes
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
const subscriptionRoutes = require('./routes/subscription');
const reportRoutes = require('./routes/report');

app.use('/api', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', reportRoutes); 
app.use('/api/subscription', subscriptionRoutes);


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});
