/**
 * WAHA Service
 * Handles all interactions with the WAHA (WhatsApp HTTP API) self-hosted instance
 */

const axios = require('axios');
const config = require('../config');

class WahaService {
    constructor() {
        this.baseUrl = config.waha.apiUrl;
        this.session = config.waha.session;
        this.timeout = config.timeouts.wahaRequest;

        // Build headers with API key if provided
        const headers = {
            'Content-Type': 'application/json'
        };
        if (config.waha.apiKey) {
            headers['X-Api-Key'] = config.waha.apiKey;
        }

        // Create axios instance with default config
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: this.timeout,
            headers: headers
        });

        // Add response interceptor for error handling
        this.client.interceptors.response.use(
            response => response,
            error => {
                console.error('WAHA API Error:', {
                    url: error.config?.url,
                    status: error.response?.status,
                    message: error.message
                });
                throw error;
            }
        );
    }

    /**
     * Send a text message to a chat
     * @param {string} chatId - The WhatsApp chat ID (e.g., "923001234567@c.us")
     * @param {string} text - The message text to send
     * @returns {Promise<Object>} - The API response
     */
    async sendText(chatId, text) {
        try {
            const response = await this.client.post(config.waha.endpoints.sendText, {
                chatId: chatId,
                text: text,
                session: this.session
            });

            console.log(`📤 Message sent to ${chatId.split('@')[0]}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error(`❌ Failed to send message to ${chatId}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send an image with optional caption
     * @param {string} chatId - The WhatsApp chat ID
     * @param {string} imageUrl - URL of the image to send
     * @param {string} caption - Optional caption for the image
     * @returns {Promise<Object>} - The API response
     */
    async sendImage(chatId, imageUrl, caption = '') {
        try {
            const response = await this.client.post(config.waha.endpoints.sendImage, {
                chatId: chatId,
                file: {
                    url: imageUrl
                },
                caption: caption,
                session: this.session
            });

            console.log(`🖼️ Image sent to ${chatId.split('@')[0]}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error(`❌ Failed to send image to ${chatId}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send a document/file
     * @param {string} chatId - The WhatsApp chat ID
     * @param {string} documentUrl - URL of the document to send
     * @param {string} filename - Name for the document
     * @param {string} caption - Optional caption
     * @returns {Promise<Object>} - The API response
     */
    async sendDocument(chatId, documentUrl, filename, caption = '') {
        try {
            const response = await this.client.post(config.waha.endpoints.sendDocument, {
                chatId: chatId,
                file: {
                    url: documentUrl,
                    filename: filename
                },
                caption: caption,
                session: this.session
            });

            console.log(`📄 Document sent to ${chatId.split('@')[0]}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error(`❌ Failed to send document to ${chatId}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send multiple messages with delay between them
     * @param {string} chatId - The WhatsApp chat ID
     * @param {string[]} messages - Array of message texts
     * @param {number} delayMs - Delay between messages in milliseconds
     */
    async sendMultipleMessages(chatId, messages, delayMs = 1000) {
        const results = [];

        for (let i = 0; i < messages.length; i++) {
            const result = await this.sendText(chatId, messages[i]);
            results.push(result);

            // Add delay between messages (except for the last one)
            if (i < messages.length - 1) {
                await this.delay(delayMs);
            }
        }

        return results;
    }

    /**
     * Send typing indicator (if supported by WAHA version)
     * @param {string} chatId - The WhatsApp chat ID
     */
    async sendTyping(chatId) {
        try {
            await this.client.post('/api/startTyping', {
                chatId: chatId,
                session: this.session
            });
        } catch (error) {
            // Typing indicator is optional, don't throw error
            console.debug('Typing indicator not supported or failed');
        }
    }

    /**
     * Stop typing indicator
     * @param {string} chatId - The WhatsApp chat ID
     */
    async stopTyping(chatId) {
        try {
            await this.client.post('/api/stopTyping', {
                chatId: chatId,
                session: this.session
            });
        } catch (error) {
            // Optional feature
            console.debug('Stop typing not supported or failed');
        }
    }

    /**
     * Check if WAHA is connected and healthy
     * @returns {Promise<Object>} - Health status
     */
    async checkHealth() {
        try {
            const response = await this.client.get(`/api/sessions/${this.session}`);
            const sessionData = response.data;

            return {
                healthy: true,
                status: sessionData.status || 'unknown',
                session: this.session,
                data: sessionData
            };
        } catch (error) {
            return {
                healthy: false,
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Get session information
     * @returns {Promise<Object>} - Session info
     */
    async getSessionInfo() {
        try {
            const response = await this.client.get(`/api/sessions/${this.session}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Download media from a message (for payment screenshots, etc.)
     * @param {string} messageId - The message ID containing media
     * @returns {Promise<Object>} - Media data
     */
    async downloadMedia(messageId) {
        try {
            const response = await this.client.get(`/api/messages/${messageId}/download`, {
                params: { session: this.session }
            });
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('Failed to download media:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get chat information
     * @param {string} chatId - The chat ID
     * @returns {Promise<Object>} - Chat info
     */
    async getChatInfo(chatId) {
        try {
            const response = await this.client.get(`/api/chats/${chatId}`, {
                params: { session: this.session }
            });
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Extract phone number from chat ID
     * @param {string} chatId - The WhatsApp chat ID
     * @returns {string} - Phone number without @c.us suffix
     */
    extractPhoneNumber(chatId) {
        if (!chatId) return '';
        return chatId.replace('@c.us', '').replace('@s.whatsapp.net', '');
    }

    /**
     * Format phone number to chat ID
     * @param {string} phoneNumber - Phone number (with or without country code)
     * @returns {string} - Formatted chat ID
     */
    formatToChatId(phoneNumber) {
        // Remove any non-digit characters
        let cleaned = phoneNumber.replace(/\D/g, '');

        // Ensure it ends with @c.us
        if (!cleaned.includes('@')) {
            cleaned = `${cleaned}@c.us`;
        }

        return cleaned;
    }

    /**
     * Utility: Delay execution
     * @param {number} ms - Milliseconds to delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Parse incoming webhook payload from WAHA
     * @param {Object} payload - The webhook payload
     * @returns {Object|null} - Parsed message data or null if invalid
     */
    parseWebhookPayload(payload) {
        try {
            // Check if this is a message event
            if (payload.event !== 'message' && payload.event !== 'message.any') {
                return null;
            }

            const message = payload.payload;

            // Ignore own messages
            if (message.fromMe === true) {
                return null;
            }

            // Ignore status broadcasts
            if (message.chatId === 'status@broadcast') {
                return null;
            }

            return {
                messageId: message.id,
                chatId: message.chatId || message.from,
                from: message.from,
                phoneNumber: this.extractPhoneNumber(message.from),
                body: message.body || '',
                timestamp: message.timestamp,
                hasMedia: message.hasMedia || false,
                mediaType: message.type || 'text',
                isGroup: message.chatId?.includes('@g.us') || false,
                quotedMessage: message.quotedMessage || null,
                session: payload.session
            };
        } catch (error) {
            console.error('Error parsing webhook payload:', error);
            return null;
        }
    }

    /**
     * Validate that a message is processable
     * @param {Object} parsedMessage - Parsed message from webhook
     * @returns {boolean} - True if message should be processed
     */
    isProcessableMessage(parsedMessage) {
        if (!parsedMessage) return false;

        // Skip group messages (can be enabled later)
        if (parsedMessage.isGroup) return false;

        // Skip empty messages
        if (!parsedMessage.body && !parsedMessage.hasMedia) return false;

        return true;
    }
}

// Export singleton instance
module.exports = new WahaService();
