/**
 * Webhook Routes
 * Handles incoming webhooks from WAHA (WhatsApp HTTP API)
 */

const express = require('express');
const router = express.Router();
const messageHandler = require('../handlers/message.handler');

/**
 * Main webhook endpoint - receives messages from WAHA
 * POST /webhook
 */
router.post('/', async (req, res) => {
    try {
        // Debug: Log incoming webhook
        console.log('📥 Webhook received:', JSON.stringify(req.body, null, 2));

        // Immediately acknowledge receipt
        res.status(200).json({ status: 'received' });

        // Process message asynchronously
        const result = await messageHandler.handleIncomingMessage(req.body);

        if (result.processed) {
            console.log(`✅ Message processed: Intent=${result.intent || 'N/A'}`);
        }
    } catch (error) {
        console.error('Webhook processing error:', error);
        // Already sent 200, just log the error
    }
});

/**
 * Webhook verification endpoint (if needed)
 * GET /webhook
 */
router.get('/', (req, res) => {
    res.status(200).json({
        status: 'active',
        message: 'WhatsApp AI Sales Agent webhook is running',
        timestamp: new Date().toISOString()
    });
});

/**
 * WAHA session status webhook
 * POST /webhook/session
 */
router.post('/session', async (req, res) => {
    try {
        const { event, session, payload } = req.body;
        console.log(`📱 Session event: ${event} for session: ${session}`);

        // Handle session events
        if (event === 'session.status') {
            console.log(`Session status: ${payload?.status || 'unknown'}`);
        }

        res.status(200).json({ status: 'received' });
    } catch (error) {
        console.error('Session webhook error:', error);
        res.status(200).json({ status: 'error', message: error.message });
    }
});

module.exports = router;
