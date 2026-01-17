/**
 * Payment Handler
 * Handles payment confirmation, approval, rejection using Supabase
 */

const wahaService = require('../services/waha.service');
const supabaseService = require('../services/supabase.service');
const sheetsService = require('../services/sheets.service');
const promptBuilder = require('../utils/prompt.builder');
const config = require('../config');

async function handlePaymentConfirmation(chatId, phoneNumber, hasMedia, conversation) {
    try {
        const paymentResult = await supabaseService.createPayment({
            chatId,
            phoneNumber,
            screenshotUrl: hasMedia ? 'pending_download' : null
        });

        await sheetsService.logPayment({
            paymentId: paymentResult.id,
            phoneNumber,
            status: 'Pending',
            screenshotUrl: hasMedia ? 'Screenshot attached' : 'No screenshot'
        });

        await notifyAdminNewPayment({
            id: paymentResult.id,
            phoneNumber,
            hasScreenshot: hasMedia
        });

        return promptBuilder.buildPaymentReceivedResponse();
    } catch (error) {
        console.error('Error handling payment:', error);
        return promptBuilder.buildErrorResponse();
    }
}

async function approvePayment(paymentId, approvedBy) {
    try {
        const payment = await supabaseService.getPayment(paymentId);

        if (!payment) {
            await wahaService.sendText(config.admin.chatId, `❌ Payment not found: ${paymentId}`);
            return { success: false, error: 'Payment not found' };
        }

        if (payment.status !== 'pending') {
            await wahaService.sendText(config.admin.chatId, `⚠️ Payment already ${payment.status}`);
            return { success: false, error: 'Payment already processed' };
        }

        await supabaseService.approvePayment(paymentId, approvedBy);
        await sheetsService.updatePaymentStatus(paymentId, 'Approved', approvedBy);

        const confirmationMessage = `🎉 *Payment Confirmed!*\n\nAapki payment verify ho gayi hai!\n\nHumari team jald hi aapke order par kaam shuru kar degi.\n\nKoi sawal ho to pooch sakte hain! 😊`;
        await wahaService.sendText(payment.chat_id, confirmationMessage);
        await wahaService.sendText(config.admin.chatId, `✅ Payment approved for ${payment.phone_number}`);

        return { success: true, paymentId };
    } catch (error) {
        console.error('Error approving payment:', error);
        return { success: false, error: error.message };
    }
}

async function rejectPayment(paymentId, reason, rejectedBy) {
    try {
        const payment = await supabaseService.getPayment(paymentId);

        if (!payment) {
            await wahaService.sendText(config.admin.chatId, `❌ Payment not found: ${paymentId}`);
            return { success: false, error: 'Payment not found' };
        }

        await supabaseService.rejectPayment(paymentId, reason, rejectedBy);
        await sheetsService.updatePaymentStatus(paymentId, 'Rejected', rejectedBy, reason);

        const rejectionMessage = promptBuilder.buildPaymentRejectedResponse(reason);
        await wahaService.sendText(payment.chat_id, rejectionMessage);
        await wahaService.sendText(config.admin.chatId, `❌ Payment rejected: ${reason}`);

        return { success: true, paymentId };
    } catch (error) {
        console.error('Error rejecting payment:', error);
        return { success: false, error: error.message };
    }
}

async function notifyAdminNewPayment(paymentData) {
    try {
        const message = `💰 *NEW PAYMENT RECEIVED*\n\n📱 Customer: ${paymentData.phoneNumber}\n📸 Screenshot: ${paymentData.hasScreenshot ? 'Yes ✅' : 'No ❌'}\n🕐 Time: ${new Date().toLocaleString('en-PK')}\n\n*Payment ID:* ${paymentData.id}\n\nReply with:\n✅ /approve ${paymentData.id}\n❌ /reject ${paymentData.id} [reason]`;
        await wahaService.sendText(config.admin.chatId, message);
    } catch (error) {
        console.error('Error notifying admin:', error);
    }
}

async function getPendingPayments() {
    return await supabaseService.getPendingPayments();
}

module.exports = {
    handlePaymentConfirmation,
    approvePayment,
    rejectPayment,
    notifyAdminNewPayment,
    getPendingPayments
};
