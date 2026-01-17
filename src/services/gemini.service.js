/**
 * Gemini Service
 * Handles all interactions with Google Gemini AI using @google/generative-ai
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const knowledgeBase = require('../config/knowledge-base.json');
const promptBuilder = require('../utils/prompt.builder');

class GeminiService {
    constructor() {
        this.genAI = null;
        this.model = null;
        this.initialized = false;
    }

    initialize() {
        if (this.initialized) return;

        if (!config.gemini.apiKey) {
            console.warn('⚠️ Gemini API key not configured');
            return;
        }

        this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
        this.model = this.genAI.getGenerativeModel({
            model: config.gemini.model,
            generationConfig: config.gemini.generationConfig
        });
        this.initialized = true;
        console.log('✅ Gemini AI initialized');
    }

    async generateResponse(userMessage, conversationHistory = [], intent = null, additionalContext = {}) {
        try {
            if (!this.initialized) {
                this.initialize();
            }

            const prompt = promptBuilder.buildPrompt(
                userMessage,
                conversationHistory,
                knowledgeBase,
                intent,
                additionalContext
            );

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const generatedText = response.text();

            if (!generatedText) {
                return { success: false, response: this.getFallbackResponse(intent), error: 'No response generated' };
            }

            const processedResponse = this.postProcessResponse(generatedText);
            return { success: true, response: processedResponse, raw: generatedText };

        } catch (error) {
            console.error('Gemini API Error:', error.message);
            return { success: false, response: this.getFallbackResponse(intent), error: error.message };
        }
    }

    postProcessResponse(text) {
        if (!text) return '';
        let processed = text.replace(/^(Assistant:|Bot:|AI:|Response:)/i, '').trim();
        processed = processed.replace(/```[\s\S]*?```/g, '');
        processed = processed.replace(/\n{3,}/g, '\n\n');
        if (processed.length > 4000) {
            const breakPoint = processed.lastIndexOf('.', 3900);
            processed = breakPoint > 3000 ? processed.substring(0, breakPoint + 1) : processed.substring(0, 3900) + '...';
        }
        return processed.trim();
    }

    getFallbackResponse(intent) {
        const responses = knowledgeBase.responses;
        switch (intent) {
            case 'GREETING': return knowledgeBase.greetings.welcome.replace('{business_name}', knowledgeBase.business.name);
            case 'PAYMENT_CONFIRMATION': return responses.payment_received;
            case 'HUMAN_REQUEST': return responses.handoff_initiated;
            case 'OUT_OF_SCOPE': return responses.out_of_scope;
            default: return responses.error.replace('{admin_phone}', config.admin.phoneNumber);
        }
    }

    getGreeting(isReturning = false) {
        const template = isReturning ? knowledgeBase.greetings.returning : knowledgeBase.greetings.welcome;
        return template.replace('{business_name}', knowledgeBase.business.name);
    }

    getServiceInfo(serviceId) {
        const service = knowledgeBase.services.find(s =>
            s.id === serviceId || s.name.toLowerCase().includes(serviceId.toLowerCase())
        );
        if (!service) return null;

        const features = service.features.map(f => `• ${f}`).join('\n');
        const popularTag = service.popular ? ' ⭐' : '';

        return `📦 *${service.name}${popularTag}*\n\n${service.description}\n\n💰 Price: Rs. ${service.price.toLocaleString()}\n⏱️ Delivery: ${service.delivery_time}\n\n✨ *Features:*\n${features}\n\n${knowledgeBase.advance_payment.note}`;
    }

    findFAQAnswer(question) {
        const lowerQuestion = question.toLowerCase();
        for (const faq of knowledgeBase.faqs) {
            if (faq.keywords.some(keyword => lowerQuestion.includes(keyword.toLowerCase()))) {
                return faq.answer;
            }
        }
        return null;
    }

    async checkHealth() {
        if (!this.initialized) {
            return { healthy: false, error: 'Not initialized' };
        }
        try {
            const result = await this.model.generateContent('Hi');
            return { healthy: true, model: config.gemini.model };
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }
}

module.exports = new GeminiService();
