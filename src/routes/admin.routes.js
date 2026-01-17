/**
 * Admin Routes
 * HTTP API endpoints using Supabase
 */

const express = require('express');
const router = express.Router();
const paymentHandler = require('../handlers/payment.handler');
const handoffHandler = require('../handlers/handoff.handler');
const messageHandler = require('../handlers/message.handler');
const supabaseService = require('../services/supabase.service');
const wahaService = require('../services/waha.service');
const config = require('../config');

router.post('/approve-payment', async (req, res) => {
    try {
        const { paymentId } = req.body;
        if (!paymentId) return res.status(400).json({ error: 'paymentId is required' });
        const result = await paymentHandler.approvePayment(paymentId, 'admin-api');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/reject-payment', async (req, res) => {
    try {
        const { paymentId, reason } = req.body;
        if (!paymentId) return res.status(400).json({ error: 'paymentId is required' });
        const result = await paymentHandler.rejectPayment(paymentId, reason || 'Rejected', 'admin-api');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/payments/pending', async (req, res) => {
    try {
        const payments = await paymentHandler.getPendingPayments();
        res.json({ success: true, data: payments });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/assign-handoff', async (req, res) => {
    try {
        const { handoffId, agentId } = req.body;
        if (!handoffId) return res.status(400).json({ error: 'handoffId is required' });
        const result = await handoffHandler.assignHandoff(handoffId, agentId || config.admin.phoneNumber);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/resolve-handoff', async (req, res) => {
    try {
        const { handoffId, resolution } = req.body;
        if (!handoffId) return res.status(400).json({ error: 'handoffId is required' });
        const result = await handoffHandler.resolveHandoff(handoffId, resolution);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/resume-ai', async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) return res.status(400).json({ error: 'chatId is required' });
        const result = await handoffHandler.resumeAI(chatId, 'admin-api');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/handoffs/pending', async (req, res) => {
    try {
        const handoffs = await handoffHandler.getPendingHandoffs();
        res.json({ success: true, data: handoffs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/send-message', async (req, res) => {
    try {
        const { chatId, message } = req.body;
        if (!chatId || !message) return res.status(400).json({ error: 'chatId and message required' });
        const result = await messageHandler.sendMessageToCustomer(chatId, message, 'admin-api');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const stats = await supabaseService.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/conversation/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const history = await supabaseService.getConversationHistory(chatId, limit);
        const conversation = await supabaseService.getConversation(chatId);
        res.json({ success: true, conversation, messages: history });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
