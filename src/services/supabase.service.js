/**
 * Supabase Service
 * Handles all database operations using Supabase PostgreSQL
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

class SupabaseService {
    constructor() {
        this.supabase = null;
        this.initialized = false;
    }

    /**
     * Initialize Supabase client
     */
    initialize() {
        if (this.initialized) return;

        if (!config.supabase.url || !config.supabase.anonKey) {
            throw new Error('Supabase URL and Anon Key are required');
        }

        this.supabase = createClient(config.supabase.url, config.supabase.anonKey);
        this.initialized = true;
        console.log('✅ Supabase client initialized');
    }

    // =====================================================
    // CONVERSATION METHODS
    // =====================================================

    async getOrCreateConversation(chatId, phoneNumber) {
        // First try to get existing conversation
        const { data: existing } = await this.supabase
            .from('conversations')
            .select('*')
            .eq('chat_id', chatId)
            .single();

        if (existing) {
            return existing;
        }

        // Create new conversation
        const { data, error } = await this.supabase
            .from('conversations')
            .insert({ chat_id: chatId, phone_number: phoneNumber, status: 'active' })
            .select()
            .single();

        if (error) {
            console.error('Error creating conversation:', error);
            throw error;
        }

        return data;
    }

    async getConversation(chatId) {
        const { data, error } = await this.supabase
            .from('conversations')
            .select('*')
            .eq('chat_id', chatId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error getting conversation:', error);
        }

        return data;
    }

    async updateConversationStatus(chatId, status, humanAgent = null) {
        const { error } = await this.supabase
            .from('conversations')
            .update({ status, human_agent: humanAgent })
            .eq('chat_id', chatId);

        if (error) console.error('Error updating conversation status:', error);
        return !error;
    }

    async updateCustomerName(chatId, name) {
        const { error } = await this.supabase
            .from('conversations')
            .update({ customer_name: name })
            .eq('chat_id', chatId);

        return !error;
    }

    async getHandoffConversations() {
        const { data, error } = await this.supabase
            .from('conversations')
            .select('*')
            .eq('status', 'human_handoff')
            .order('updated_at', { ascending: false });

        return data || [];
    }

    // =====================================================
    // MESSAGE METHODS
    // =====================================================

    async saveMessage(conversationId, chatId, sender, message, messageType = 'text', intent = null, mediaUrl = null, messageId = null) {
        const { data, error } = await this.supabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                chat_id: chatId,
                message_id: messageId,
                sender,
                message,
                message_type: messageType,
                intent,
                media_url: mediaUrl
            })
            .select()
            .single();

        if (error) {
            console.error('Error saving message:', error);
            return null;
        }

        // Update conversation message count
        await this.supabase.rpc('increment_message_count', { p_chat_id: chatId }).catch(() => {
            // If RPC doesn't exist, do manual update
            this.supabase
                .from('conversations')
                .update({ last_message_at: new Date().toISOString() })
                .eq('chat_id', chatId);
        });

        return data?.id;
    }

    async getConversationHistory(chatId, limit = 20) {
        const { data, error } = await this.supabase
            .from('messages')
            .select('sender, message, message_type, timestamp, intent')
            .eq('chat_id', chatId)
            .order('timestamp', { ascending: true })
            .limit(limit);

        if (error) {
            console.error('Error getting conversation history:', error);
            return [];
        }

        return data || [];
    }

    async getMessageCount(chatId) {
        const { count, error } = await this.supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chatId);

        return count || 0;
    }

    // =====================================================
    // PAYMENT METHODS
    // =====================================================

    async createPayment(data) {
        const conversation = await this.getConversation(data.chatId);

        const { data: payment, error } = await this.supabase
            .from('payments')
            .insert({
                conversation_id: conversation?.id || null,
                chat_id: data.chatId,
                phone_number: data.phoneNumber,
                service_id: data.serviceId || null,
                service_name: data.serviceName || null,
                amount: data.amount || null,
                currency: data.currency || 'PKR',
                payment_method: data.paymentMethod || null,
                screenshot_url: data.screenshotUrl || null,
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating payment:', error);
            throw error;
        }

        return { id: payment.id, uuid: payment.id };
    }

    async getPayment(paymentId) {
        const { data, error } = await this.supabase
            .from('payments')
            .select('*')
            .eq('id', paymentId)
            .single();

        return data;
    }

    async getPendingPayments() {
        const { data, error } = await this.supabase
            .from('payments')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        return data || [];
    }

    async getPaymentsByChatId(chatId) {
        const { data, error } = await this.supabase
            .from('payments')
            .select('*')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false });

        return data || [];
    }

    async approvePayment(paymentId, approvedBy) {
        const { error } = await this.supabase
            .from('payments')
            .update({
                status: 'approved',
                approved_by: approvedBy,
                approved_at: new Date().toISOString()
            })
            .eq('id', paymentId);

        return !error;
    }

    async rejectPayment(paymentId, reason, rejectedBy) {
        const { error } = await this.supabase
            .from('payments')
            .update({
                status: 'rejected',
                rejection_reason: reason,
                approved_by: rejectedBy
            })
            .eq('id', paymentId);

        return !error;
    }

    // =====================================================
    // HANDOFF METHODS
    // =====================================================

    async createHandoff(chatId, phoneNumber, reason, priority = 'normal') {
        const conversation = await this.getConversation(chatId);

        // Update conversation status
        await this.updateConversationStatus(chatId, 'human_handoff');

        const { data, error } = await this.supabase
            .from('handoff_queue')
            .insert({
                conversation_id: conversation?.id || null,
                chat_id: chatId,
                phone_number: phoneNumber,
                customer_name: conversation?.customer_name || null,
                reason,
                priority,
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating handoff:', error);
            throw error;
        }

        return { id: data.id, uuid: data.id };
    }

    async getHandoff(handoffId) {
        const { data, error } = await this.supabase
            .from('handoff_queue')
            .select('*')
            .eq('id', handoffId)
            .single();

        return data;
    }

    async getPendingHandoffs() {
        const { data, error } = await this.supabase
            .from('handoff_queue')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        return data || [];
    }

    async getActiveHandoff(chatId) {
        const { data, error } = await this.supabase
            .from('handoff_queue')
            .select('*')
            .eq('chat_id', chatId)
            .in('status', ['pending', 'assigned', 'in_progress'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        return data;
    }

    async assignHandoff(handoffId, agentId) {
        const { error } = await this.supabase
            .from('handoff_queue')
            .update({
                status: 'assigned',
                assigned_to: agentId,
                assigned_at: new Date().toISOString()
            })
            .eq('id', handoffId);

        return !error;
    }

    async resolveHandoff(handoffId, resolutionNotes = null) {
        const handoff = await this.getHandoff(handoffId);
        if (handoff) {
            await this.updateConversationStatus(handoff.chat_id, 'active');
        }

        const { error } = await this.supabase
            .from('handoff_queue')
            .update({
                status: 'resolved',
                resolution_notes: resolutionNotes,
                resolved_at: new Date().toISOString()
            })
            .eq('id', handoffId);

        return !error;
    }

    async resumeAI(chatId) {
        await this.updateConversationStatus(chatId, 'active');

        const { error } = await this.supabase
            .from('handoff_queue')
            .update({
                status: 'resolved',
                resolution_notes: 'AI resumed by admin',
                resolved_at: new Date().toISOString()
            })
            .eq('chat_id', chatId)
            .in('status', ['pending', 'assigned', 'in_progress']);

        return !error;
    }

    // =====================================================
    // RATE LIMITING
    // =====================================================

    async checkRateLimit(chatId) {
        const windowMs = config.rateLimit.windowMs;
        const maxRequests = config.rateLimit.maxRequests;
        const windowStart = new Date(Date.now() - windowMs).toISOString();

        // Get or create rate limit record
        const { data: record } = await this.supabase
            .from('rate_limits')
            .select('*')
            .eq('chat_id', chatId)
            .single();

        if (!record) {
            await this.supabase
                .from('rate_limits')
                .insert({ chat_id: chatId, message_count: 1 });
            return true;
        }

        // Check if window expired
        if (new Date(record.window_start) < new Date(windowStart)) {
            await this.supabase
                .from('rate_limits')
                .update({ message_count: 1, window_start: new Date().toISOString() })
                .eq('chat_id', chatId);
            return true;
        }

        // Check limit
        if (record.message_count >= maxRequests) {
            return false;
        }

        // Increment counter
        await this.supabase
            .from('rate_limits')
            .update({ message_count: record.message_count + 1 })
            .eq('chat_id', chatId);

        return true;
    }

    // =====================================================
    // STATISTICS
    // =====================================================

    async getStats() {
        const [convResult, activeResult, handoffResult, paymentResult, msgResult] = await Promise.all([
            this.supabase.from('conversations').select('*', { count: 'exact', head: true }),
            this.supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
            this.supabase.from('handoff_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            this.supabase.from('payments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            this.supabase.from('messages').select('*', { count: 'exact', head: true })
        ]);

        return {
            totalConversations: convResult.count || 0,
            activeConversations: activeResult.count || 0,
            pendingHandoffs: handoffResult.count || 0,
            pendingPayments: paymentResult.count || 0,
            totalMessages: msgResult.count || 0
        };
    }

    async checkHealth() {
        try {
            const { data, error } = await this.supabase.from('conversations').select('id').limit(1);
            return { healthy: !error, initialized: this.initialized };
        } catch {
            return { healthy: false, initialized: this.initialized };
        }
    }
}

module.exports = new SupabaseService();
