/**
 * Message Handler
 * Main message processing logic using Supabase for database
 */

const wahaService = require('../services/waha.service');
const geminiService = require('../services/gemini.service');
const supabaseService = require('../services/supabase.service');
const sheetsService = require('../services/sheets.service');
const { INTENTS, classifyIntent, shouldHandoff, parseAdminCommand } = require('../utils/intent.classifier');
const promptBuilder = require('../utils/prompt.builder');
const paymentHandler = require('./payment.handler');
const handoffHandler = require('./handoff.handler');
const config = require('../config');

async function handleIncomingMessage(webhookPayload) {
    try {
        const message = wahaService.parseWebhookPayload(webhookPayload);

        if (!message || !wahaService.isProcessableMessage(message)) {
            return { processed: false, reason: 'Message not processable' };
        }

        console.log(`📩 Message from ${message.phoneNumber}: "${message.body.substring(0, 50)}..."`);

        // Check rate limiting
        const withinRateLimit = await supabaseService.checkRateLimit(message.chatId);
        if (!withinRateLimit) {
            await wahaService.sendText(message.chatId, 'Aap bohot messages bhej rahe hain. Please thodi der wait karein. 🙏');
            return { processed: false, reason: 'Rate limit exceeded' };
        }

        // Get or create conversation
        const conversation = await supabaseService.getOrCreateConversation(message.chatId, message.phoneNumber);

        // Check for admin commands
        if (message.phoneNumber === config.admin.phoneNumber) {
            const adminCmd = parseAdminCommand(message.body);
            if (adminCmd) {
                return await handleAdminCommand(adminCmd, message.chatId);
            }
        }

        // Check if in human handoff mode
        if (conversation.status === 'human_handoff') {
            return await handleHumanHandoffMessage(message, conversation);
        }

        // Classify intent and save message
        const classification = classifyIntent(message.body, { hasMedia: message.hasMedia });
        await supabaseService.saveMessage(
            conversation.id, message.chatId, 'customer', message.body,
            message.hasMedia ? message.mediaType : 'text', classification.intent, null, message.messageId
        );

        // Check for handoff
        const handoffCheck = shouldHandoff(message.body, classification);
        if (handoffCheck.handoff) {
            return await handoffHandler.initiateHandoff(
                message.chatId, message.phoneNumber, handoffCheck.reason, handoffCheck.priority, conversation
            );
        }

        // Process based on intent
        const response = await processIntent(classification, message, conversation);

        if (response) {
            await wahaService.sendText(message.chatId, response);
            await supabaseService.saveMessage(conversation.id, message.chatId, 'bot', response, 'text', classification.intent);
        }

        return { processed: true, intent: classification.intent, confidence: classification.confidence };

    } catch (error) {
        console.error('Error handling message:', error);
        try {
            const chatId = wahaService.parseWebhookPayload(webhookPayload)?.chatId;
            if (chatId) await wahaService.sendText(chatId, promptBuilder.buildErrorResponse());
        } catch (e) { }
        return { processed: false, error: error.message };
    }
}

async function processIntent(classification, message, conversation) {
    const { intent, metadata } = classification;
    const history = await supabaseService.getConversationHistory(message.chatId, 10);
    const isReturning = history.length > 0;

    switch (intent) {
        case INTENTS.GREETING:
            return promptBuilder.getGreetingMessage(isReturning);

        case INTENTS.SERVICE_INQUIRY:
        case INTENTS.PRICING_INQUIRY:
            if (metadata.serviceId) {
                const serviceInfo = geminiService.getServiceInfo(metadata.serviceId);
                if (serviceInfo) return serviceInfo;
            }
            return await generateAIResponse(message.body, history, intent, { serviceId: metadata.serviceId });

        case INTENTS.PAYMENT_INQUIRY:
            return promptBuilder.getPaymentMethodsMessage();

        case INTENTS.PAYMENT_CONFIRMATION:
            return await paymentHandler.handlePaymentConfirmation(message.chatId, message.phoneNumber, message.hasMedia, conversation);

        case INTENTS.ORDER_INTENT:
            if (metadata.serviceId) {
                const service = geminiService.getServiceInfo(metadata.serviceId);
                const paymentMethods = promptBuilder.getPaymentMethodsMessage();
                return `${service}\n\n${paymentMethods}`;
            }
            return await generateAIResponse(message.body, history, intent, { isReturning });

        case INTENTS.FAQ:
            const faqAnswer = geminiService.findFAQAnswer(message.body);
            if (faqAnswer) return faqAnswer;
            return await generateAIResponse(message.body, history, intent);

        case INTENTS.CONFIRMATION:
            return await handleConfirmation(message, history, conversation);

        case INTENTS.REJECTION:
            return 'Koi baat nahi! 😊 Agar aapko kisi aur cheez mein madad chahiye ho to zaroor batayein.';

        case INTENTS.OUT_OF_SCOPE:
            return promptBuilder.buildOutOfScopeResponse();

        default:
            return await generateAIResponse(message.body, history, intent, { isReturning });
    }
}

async function generateAIResponse(userMessage, history = [], intent = null, context = {}) {
    try {
        const result = await geminiService.generateResponse(userMessage, history, intent, context);
        return result.success && result.response ? result.response : geminiService.getFallbackResponse(intent);
    } catch (error) {
        console.error('Error generating AI response:', error);
        return promptBuilder.buildErrorResponse();
    }
}

async function handleConfirmation(message, history, conversation) {
    const lastBotMessage = history.filter(m => m.sender === 'bot').pop();
    if (!lastBotMessage) return await generateAIResponse(message.body, history, INTENTS.CONFIRMATION);

    const lastBotText = lastBotMessage.message.toLowerCase();
    if (lastBotText.includes('order') || lastBotText.includes('chahenge')) {
        return promptBuilder.getPaymentMethodsMessage();
    }
    if (lastBotText.includes('connect') || lastBotText.includes('team')) {
        return await handoffHandler.initiateHandoff(
            message.chatId, wahaService.extractPhoneNumber(message.chatId), 'Customer confirmed request for human agent', 'normal', conversation
        );
    }
    return await generateAIResponse(message.body, history, INTENTS.CONFIRMATION);
}

async function handleHumanHandoffMessage(message, conversation) {
    await supabaseService.saveMessage(conversation.id, message.chatId, 'customer', message.body, message.hasMedia ? message.mediaType : 'text', 'HUMAN_HANDOFF');
    await wahaService.sendText(config.admin.chatId, `📨 Message from ${message.phoneNumber}:\n\n${message.body}`);
    return { processed: true, handoff: true, forwarded: true };
}

async function handleAdminCommand(command, chatId) {
    console.log(`🔧 Admin command: ${command.action}`);
    try {
        switch (command.action) {
            case 'approve_payment': return await paymentHandler.approvePayment(command.id, config.admin.phoneNumber);
            case 'reject_payment': return await paymentHandler.rejectPayment(command.id, command.args.slice(1).join(' ') || 'Payment could not be verified', config.admin.phoneNumber);
            case 'resume_ai': return await handoffHandler.resumeAI(command.id, config.admin.phoneNumber);
            case 'get_stats': return await sendStats(chatId);
            case 'admin_help': return await sendAdminHelp(chatId);
            default:
                await wahaService.sendText(chatId, '❌ Unknown command. Type /help');
                return { processed: true, unknown: true };
        }
    } catch (error) {
        await wahaService.sendText(chatId, `❌ Error: ${error.message}`);
        return { processed: false, error: error.message };
    }
}

async function sendStats(chatId) {
    const stats = await supabaseService.getStats();
    const message = `📊 *System Statistics*\n\n📱 Total Conversations: ${stats.totalConversations}\n✅ Active: ${stats.activeConversations}\n🙋 Pending Handoffs: ${stats.pendingHandoffs}\n💰 Pending Payments: ${stats.pendingPayments}\n💬 Total Messages: ${stats.totalMessages}`;
    await wahaService.sendText(chatId, message);
    return { processed: true, action: 'stats' };
}

async function sendAdminHelp(chatId) {
    const message = `🔧 *Admin Commands*\n\n💰 /approve [id] - Approve payment\n❌ /reject [id] [reason] - Reject payment\n🤖 /resume_ai [chatId] - Resume AI\n📊 /stats - View statistics\n❓ /help - Show this help`;
    await wahaService.sendText(chatId, message);
    return { processed: true, action: 'help' };
}

async function sendMessageToCustomer(customerChatId, message, adminPhone) {
    const conversation = await supabaseService.getConversation(customerChatId);
    if (!conversation) throw new Error('Conversation not found');
    await wahaService.sendText(customerChatId, message);
    await supabaseService.saveMessage(conversation.id, customerChatId, 'human', message, 'text', 'HUMAN_REPLY');
    return { success: true };
}

module.exports = { handleIncomingMessage, sendMessageToCustomer, generateAIResponse, handleAdminCommand };
