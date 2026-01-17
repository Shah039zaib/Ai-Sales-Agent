/**
 * WhatsApp AI Sales Agent - Main Entry Point
 * Using Supabase PostgreSQL Database
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const supabaseService = require('./services/supabase.service');
const sheetsService = require('./services/sheets.service');
const wahaService = require('./services/waha.service');
const geminiService = require('./services/gemini.service');

const webhookRoutes = require('./routes/webhook.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// Request logging
app.use(morgan(config.server.isProduction ? 'combined' : 'dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests * 10,
    message: { error: 'Too many requests' }
});
app.use('/admin', apiLimiter);

// Health check
app.get('/health', async (req, res) => {
    try {
        const wahaHealth = await wahaService.checkHealth();
        const geminiHealth = await geminiService.checkHealth();
        const sheetsHealth = await sheetsService.checkHealth();
        const supabaseHealth = await supabaseService.checkHealth();

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            services: { waha: wahaHealth, gemini: geminiHealth, sheets: sheetsHealth, supabase: supabaseHealth }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// Stats endpoint
app.get('/stats', async (req, res) => {
    try {
        const stats = await supabaseService.getStats();
        res.json({ success: true, data: stats, timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mount routes
app.use('/webhook', webhookRoutes);
app.use('/admin', adminRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'WhatsApp AI Sales Agent',
        version: '1.0.0',
        database: 'Supabase',
        status: 'running',
        endpoints: { health: '/health', stats: '/stats', webhook: '/webhook', admin: '/admin/*' }
    });
});

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
    console.log('\n🚀 Starting WhatsApp AI Sales Agent...\n');

    try {
        // Initialize Supabase
        console.log('📦 Initializing Supabase...');
        supabaseService.initialize();

        // Initialize Google Sheets
        console.log('📊 Initializing Google Sheets...');
        await sheetsService.initialize();

        // Initialize Gemini
        console.log('🤖 Initializing Gemini AI...');
        geminiService.initialize();

        // Check WAHA connection
        console.log('📱 Checking WAHA connection...');
        const wahaHealth = await wahaService.checkHealth();
        console.log(wahaHealth.healthy ? `   ✅ WAHA connected` : `   ⚠️ WAHA not connected`);

        // Start HTTP server
        const server = app.listen(config.server.port, () => {
            console.log(`\n✅ Server running on port ${config.server.port}`);
            console.log(`📡 Webhook URL: http://localhost:${config.server.port}/webhook`);
            console.log(`📊 Admin API: http://localhost:${config.server.port}/admin`);
            console.log('\n🎉 WhatsApp AI Sales Agent is ready!\n');
        });

        // Graceful shutdown
        const shutdown = async (signal) => {
            console.log(`\n${signal} received. Shutting down...`);
            server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
            setTimeout(() => process.exit(1), 10000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        console.error('❌ Failed to start:', error);
        process.exit(1);
    }
}

startServer();
module.exports = app;
