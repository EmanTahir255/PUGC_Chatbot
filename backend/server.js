const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '6mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Import routes
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
const subscriptionRoutes = require('./routes/subscription');
const reportRoutes = require('./routes/report');
const challanRoutes = require('./routes/challan');

app.use('/api/auth', authRoutes);
app.use('/api', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', reportRoutes); 
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/challan', challanRoutes);


// Start server
const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Backend server running on port ${PORT}`);
    });
}

module.exports = app;
