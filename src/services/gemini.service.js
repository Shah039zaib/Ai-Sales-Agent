/**
 * AI Service
 * Unified AI service with fallback providers: Gemini -> OpenRouter -> Groq
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const config = require('../config');
const knowledgeBase = require('../config/knowledge-base.json');
const promptBuilder = require('../utils/prompt.builder');

class GeminiService {
    constructor() {
        this.genAI = null;
        this.model = null;
        this.geminiInitialized = false;
        this.currentProvider = null;
    }

    initialize() {
        if (this.geminiInitialized) return;

        if (config.gemini.apiKey) {
            try {
                this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
                this.model = this.genAI.getGenerativeModel({
                    model: config.gemini.model,
                    generationConfig: config.gemini.generationConfig
                });
                this.geminiInitialized = true;
                console.log('✅ Gemini AI initialized');
            } catch (error) {
                console.warn('⚠️ Failed to initialize Gemini:', error.message);
            }
        } else {
            console.warn('⚠️ Gemini API key not configured');
        }

        // Log available fallback providers
        if (config.openrouter?.apiKey) {
            console.log('   📦 OpenRouter fallback available');
        }
        if (config.groq?.apiKey) {
            console.log('   📦 Groq fallback available');
        }
    }

    async generateResponse(userMessage, conversationHistory = [], intent = null, additionalContext = {}) {
        if (!this.geminiInitialized) {
            this.initialize();
        }

        const prompt = promptBuilder.buildPrompt(
            userMessage,
            conversationHistory,
            knowledgeBase,
            intent,
            additionalContext
        );

        // Try Gemini first
        if (this.geminiInitialized) {
            const geminiResult = await this.tryGemini(prompt, intent);
            if (geminiResult.success) {
                this.currentProvider = 'gemini';
                return geminiResult;
            }
            console.log('⚠️ Gemini failed, trying fallback...');
        }

        // Fallback to OpenRouter
        if (config.openrouter?.apiKey) {
            const openrouterResult = await this.tryOpenRouter(prompt, intent);
            if (openrouterResult.success) {
                this.currentProvider = 'openrouter';
                return openrouterResult;
            }
            console.log('⚠️ OpenRouter failed, trying Groq...');
        }

        // Fallback to Groq
        if (config.groq?.apiKey) {
            const groqResult = await this.tryGroq(prompt, intent);
            if (groqResult.success) {
                this.currentProvider = 'groq';
                return groqResult;
            }
            console.log('⚠️ Groq also failed');
        }

        // All providers failed, return fallback response
        return {
            success: false,
            response: this.getFallbackResponse(intent),
            error: 'All AI providers failed'
        };
    }

    async tryGemini(prompt, intent) {
        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const generatedText = response.text();

            if (!generatedText) {
                return { success: false, error: 'No response generated' };
            }

            const processedResponse = this.postProcessResponse(generatedText);
            return { success: true, response: processedResponse, provider: 'gemini' };
        } catch (error) {
            console.error('Gemini API Error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async tryOpenRouter(prompt, intent) {
        try {
            const response = await axios.post(
                `${config.openrouter.baseUrl}/chat/completions`,
                {
                    model: config.openrouter.model,
                    messages: [
                        { role: 'system', content: this.getSystemPrompt() },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 500,
                    temperature: 0.3
                },
                {
                    headers: {
                        'Authorization': `Bearer ${config.openrouter.apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://whatsapp-ai-agent.local',
                        'X-Title': 'WhatsApp AI Sales Agent'
                    },
                    timeout: 30000
                }
            );

            const generatedText = response.data.choices[0]?.message?.content;
            if (!generatedText) {
                return { success: false, error: 'No response from OpenRouter' };
            }

            const processedResponse = this.postProcessResponse(generatedText);
            console.log('✅ OpenRouter response received');
            return { success: true, response: processedResponse, provider: 'openrouter' };
        } catch (error) {
            console.error('OpenRouter API Error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async tryGroq(prompt, intent) {
        try {
            const response = await axios.post(
                `${config.groq.baseUrl}/chat/completions`,
                {
                    model: config.groq.model,
                    messages: [
                        { role: 'system', content: this.getSystemPrompt() },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 500,
                    temperature: 0.3
                },
                {
                    headers: {
                        'Authorization': `Bearer ${config.groq.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            const generatedText = response.data.choices[0]?.message?.content;
            if (!generatedText) {
                return { success: false, error: 'No response from Groq' };
            }

            const processedResponse = this.postProcessResponse(generatedText);
            console.log('✅ Groq response received');
            return { success: true, response: processedResponse, provider: 'groq' };
        } catch (error) {
            console.error('Groq API Error:', error.message);
            return { success: false, error: error.message };
        }
    }

    getSystemPrompt() {
        return `You are an AI Sales Agent for ${knowledgeBase.business.name}. 
You MUST follow these rules strictly:
1. ONLY answer based on the knowledge base provided
2. NEVER make up information not in the knowledge base
3. Always be polite and professional
4. Respond in the same language as the customer (Urdu/English mix is common)
5. Keep responses concise and helpful
6. If you don't know something, ask to connect with human support

Business: ${knowledgeBase.business.name}
Services: ${knowledgeBase.services.map(s => `${s.name} - Rs.${s.price}`).join(', ')}`;
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
        const health = {
            gemini: false,
            openrouter: false,
            groq: false,
            currentProvider: this.currentProvider
        };

        if (this.geminiInitialized) {
            try {
                await this.model.generateContent('Hi');
                health.gemini = true;
            } catch (error) {
                health.gemini = false;
            }
        }

        if (config.openrouter?.apiKey) {
            health.openrouter = true; // Assume available if configured
        }

        if (config.groq?.apiKey) {
            health.groq = true; // Assume available if configured
        }

        return {
            healthy: health.gemini || health.openrouter || health.groq,
            providers: health
        };
    }
}

module.exports = new GeminiService();
