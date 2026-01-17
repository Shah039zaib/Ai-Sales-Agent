/**
 * Handoff Handler
 * Manages human handoff using Supabase
 */

const wahaService = require('../services/waha.service');
const supabaseService = require('../services/supabase.service');
const sheetsService = require('../services/sheets.service');
const promptBuilder = require('../utils/prompt.builder');
const config = require('../config');

async function initiateHandoff(chatId, phoneNumber, reason, priority = 'normal', conversation = null) {
    try {
        const handoffResult = await supabaseService.createHandoff(chatId, phoneNumber, reason, priority);

        await sheetsService.logHandoff({
            handoffId: handoffResult.id,
            phoneNumber,
            customerName: conversation?.customer_name || '',
            reason,
            priority,
            status: 'Pending'
        });

        await notifyAdminHandoff({
            id: handoffResult.id,
            phoneNumber,
            customerName: conversation?.customer_name,
            reason,
            priority
        });

        const response = promptBuilder.buildHandoffResponse();
        await wahaService.sendText(chatId, response);

        if (conversation) {
            await supabaseService.saveMessage(conversation.id, chatId, 'bot', response, 'text', 'HUMAN_HANDOFF');
        }

        console.log(`🙋 Handoff initiated for ${phoneNumber}`);
        return { success: true, handoffId: handoffResult.id, response };
    } catch (error) {
        console.error('Error initiating handoff:', error);
        return { success: false, error: error.message };
    }
}

async function notifyAdminHandoff(handoffData) {
    try {
        const priorityEmoji = { 'urgent': '🔴', 'high': '🟠', 'normal': '🟡', 'low': '🟢' };
        const message = `🙋 *HUMAN HANDOFF REQUEST*\n\n${priorityEmoji[handoffData.priority] || '🟡'} Priority: ${handoffData.priority.toUpperCase()}\n📱 Customer: ${handoffData.phoneNumber}\n${handoffData.customerName ? `👤 Name: ${handoffData.customerName}\n` : ''}📝 Reason: ${handoffData.reason}\n🕐 Time: ${new Date().toLocaleString('en-PK')}\n\n*Handoff ID:* ${handoffData.id}\n\nUse /resume_ai ${handoffData.phoneNumber}@c.us to resume AI.`;
        await wahaService.sendText(config.admin.chatId, message);
    } catch (error) {
        console.error('Error notifying admin:', error);
    }
}

async function resumeAI(chatIdOrPhone, adminPhone) {
    try {
        let chatId = chatIdOrPhone;
        if (!chatId.includes('@')) chatId = `${chatId}@c.us`;

        await supabaseService.resumeAI(chatId);
        await wahaService.sendText(chatId, 'AI assistant dobara active ho gaya hai. Main aapki madad ke liye hazir hoon! 🤖');
        await wahaService.sendText(config.admin.chatId, `✅ AI resumed for ${chatId}`);

        console.log(`🤖 AI resumed for ${chatId}`);
        return { success: true };
    } catch (error) {
        console.error('Error resuming AI:', error);
        await wahaService.sendText(config.admin.chatId, `❌ Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function assignHandoff(handoffId, agentId) {
    try {
        await supabaseService.assignHandoff(handoffId, agentId);
        await wahaService.sendText(config.admin.chatId, `✅ Handoff ${handoffId} assigned to ${agentId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function resolveHandoff(handoffId, resolution) {
    try {
        await supabaseService.resolveHandoff(handoffId, resolution);
        await wahaService.sendText(config.admin.chatId, `✅ Handoff ${handoffId} resolved`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function getPendingHandoffs() {
    return await supabaseService.getPendingHandoffs();
}

function isInHandoffMode(chatId) {
    return supabaseService.getConversation(chatId).then(c => c?.status === 'human_handoff');
}

module.exports = {
    initiateHandoff,
    notifyAdminHandoff,
    resumeAI,
    assignHandoff,
    resolveHandoff,
    getPendingHandoffs,
    isInHandoffMode
};
