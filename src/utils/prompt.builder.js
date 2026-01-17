/**
 * Prompt Builder
 * Constructs context-aware prompts for Gemini AI with zero-hallucination constraints
 */

const knowledgeBase = require('../config/knowledge-base.json');
const config = require('../config');

/**
 * System prompt template with strict rules to prevent hallucination
 */
const SYSTEM_PROMPT_TEMPLATE = `You are an AI Sales Agent for {business_name}. You MUST follow these rules strictly:

## CRITICAL RULES (NEVER BREAK):

1. **ONLY use information from the provided knowledge base**
   - Never make up prices, services, or features
   - Never assume information not in the knowledge base
   - If information is not available, say: "Is sawal ka jawab mere paas nahi hai. Main aapko humari team se connect kar deta hoon."

2. **NEVER hallucinate or fabricate information**
   - If asked about something not in knowledge base, politely say you don't have that information
   - Do not guess prices, delivery times, or features
   - Only state facts that are explicitly in the knowledge base

3. **Conversation Style**
   - Be friendly, professional, and helpful
   - Use Roman Urdu mixed with English (common in Pakistan)
   - Keep responses concise but informative (under 500 characters when possible)
   - Use emojis sparingly and appropriately (1-2 per message max)

4. **Response Format**
   - Use line breaks for readability
   - Use bullet points (•) for lists
   - Use *bold* for important text (WhatsApp formatting)
   - Keep sentences short and clear

5. **Language Guidelines**
   - If user writes in Urdu/Roman Urdu, respond in Roman Urdu
   - If user writes in English, respond in English with some Roman Urdu
   - Always be respectful and use appropriate greetings

6. **What NOT to do**
   - Don't mention that you're reading from a knowledge base
   - Don't say "according to my information" or similar phrases
   - Don't provide information that isn't in the knowledge base
   - Don't make promises you can't verify (like exact delivery dates)

## KNOWLEDGE BASE:
{knowledge_base}

## CONVERSATION CONTEXT:
{conversation_context}

## CURRENT USER MESSAGE:
{current_message}

Generate an appropriate response following all rules above. Be natural, helpful, and accurate.`;

/**
 * Build the complete prompt for Gemini API
 * @param {string} userMessage - Current user message
 * @param {Array} conversationHistory - Previous messages
 * @param {Object} kb - Knowledge base (defaults to imported)
 * @param {string} intent - Detected intent
 * @param {Object} additionalContext - Extra context
 * @returns {string} - Complete prompt
 */
function buildPrompt(userMessage, conversationHistory = [], kb = knowledgeBase, intent = null, additionalContext = {}) {
    // Format knowledge base for prompt
    const kbFormatted = formatKnowledgeBase(kb);

    // Format conversation history
    const contextFormatted = formatConversationContext(conversationHistory, intent, additionalContext);

    // Build the complete prompt
    let prompt = SYSTEM_PROMPT_TEMPLATE
        .replace('{business_name}', kb.business.name)
        .replace('{knowledge_base}', kbFormatted)
        .replace('{conversation_context}', contextFormatted)
        .replace('{current_message}', userMessage);

    // Add intent-specific instructions if needed
    if (intent) {
        prompt += `\n\n## DETECTED INTENT: ${intent}`;
        prompt += getIntentSpecificInstructions(intent, additionalContext);
    }

    return prompt;
}

/**
 * Format knowledge base for prompt
 * @param {Object} kb - Knowledge base object
 * @returns {string} - Formatted string
 */
function formatKnowledgeBase(kb) {
    const sections = [];

    // Business Info
    sections.push(`### Business Information:
- Name: ${kb.business.name}
- Tagline: ${kb.business.tagline}
- Description: ${kb.business.description}
- Working Hours: ${kb.business.working_hours}
- Response Time: ${kb.business.response_time}`);

    // Services
    const servicesText = kb.services.map(s => {
        const features = s.features.map(f => `  - ${f}`).join('\n');
        return `#### ${s.name}${s.popular ? ' ⭐ (Popular)' : ''}
- ID: ${s.id}
- Price: Rs. ${s.price.toLocaleString()}
- Delivery: ${s.delivery_time}
- Description: ${s.description}
- Features:
${features}`;
    }).join('\n\n');

    sections.push(`### Services & Packages:\n${servicesText}`);

    // Payment Methods
    const paymentText = kb.payment_methods.map(pm => {
        let details = `- ${pm.method}`;
        if (pm.account_number) details += `: ${pm.account_number}`;
        if (pm.account_name) details += ` (${pm.account_name})`;
        if (pm.bank_name) details += ` - ${pm.bank_name}`;
        return details;
    }).join('\n');

    sections.push(`### Payment Methods:
${paymentText}

Advance Payment: Rs. ${kb.advance_payment.minimum_amount} minimum, ${kb.advance_payment.percentage}% of total
Note: ${kb.advance_payment.note}`);

    // FAQs
    const faqText = kb.faqs.map(faq =>
        `Q: ${faq.question}\nA: ${faq.answer}`
    ).join('\n\n');

    sections.push(`### Frequently Asked Questions:\n${faqText}`);

    return sections.join('\n\n');
}

/**
 * Format conversation context for prompt
 * @param {Array} history - Conversation history
 * @param {string} intent - Current detected intent
 * @param {Object} context - Additional context
 * @returns {string} - Formatted context string
 */
function formatConversationContext(history = [], intent = null, context = {}) {
    const parts = [];

    // Message count info
    if (history.length > 0) {
        parts.push(`Previous messages in this conversation: ${history.length}`);

        // Format recent messages (last 10)
        const recentMessages = history.slice(-10);
        const formatted = recentMessages.map(msg => {
            const sender = msg.sender === 'customer' ? 'Customer' : 'You';
            return `${sender}: ${msg.message}`;
        }).join('\n');

        parts.push(`### Recent Conversation:\n${formatted}`);
    } else {
        parts.push('This is a new conversation - first message from customer.');
    }

    // Add context info
    if (context.isReturning) {
        parts.push('Note: This is a returning customer.');
    }

    if (context.customerName) {
        parts.push(`Customer Name: ${context.customerName}`);
    }

    if (context.pendingPayment) {
        parts.push(`Note: Customer has a pending payment for ${context.pendingPayment.serviceName}`);
    }

    if (context.serviceId) {
        parts.push(`Customer is asking about: ${context.serviceName || context.serviceId}`);
    }

    return parts.join('\n\n');
}

/**
 * Get intent-specific instructions
 * @param {string} intent - Detected intent
 * @param {Object} context - Additional context
 * @returns {string} - Intent-specific instructions
 */
function getIntentSpecificInstructions(intent, context = {}) {
    const instructions = {
        'GREETING': `
Focus on: Welcome the customer warmly and offer to help. Mention available packages briefly.`,

        'SERVICE_INQUIRY': `
Focus on: Provide detailed information about the requested service from the knowledge base.
${context.serviceId ? `Specifically about: ${context.serviceName}` : 'Ask which service they want to know about.'}`,

        'PRICING_INQUIRY': `  
Focus on: Share pricing information from knowledge base. Mention all packages with prices.`,

        'PAYMENT_CONFIRMATION': `
Focus on: Thank them for the payment. Confirm you've received the screenshot and team will verify soon.
Response template: "✅ Payment screenshot receive ho gaya hai! Humari team verify karke aapko confirm kar degi."`,

        'PAYMENT_INQUIRY': `
Focus on: Share all payment methods with account details from knowledge base. Mention advance payment requirement.`,

        'ORDER_INTENT': `
Focus on: Guide them through ordering process. Ask which package they want if not specified. Then share payment details.`,

        'FAQ': `
Focus on: Answer from FAQs in knowledge base. Be concise and accurate.`,

        'CONFIRMATION': `
Focus on: Proceed with the previous discussed action (order, service selection, etc.)`,

        'REJECTION': `
Focus on: Acknowledge politely. Ask if they need help with something else.`,

        'GENERAL_CHAT': `
Focus on: Be helpful and try to understand what they need. Suggest services if appropriate.`,

        'OUT_OF_SCOPE': `
Focus on: Politely explain you don't have this information and offer to connect with human team.`
    };

    return instructions[intent] || '';
}

/**
 * Build a specific response for payment confirmation
 * @param {Object} paymentData - Payment details
 * @returns {string} - Payment confirmation message
 */
function buildPaymentReceivedResponse(paymentData = {}) {
    return knowledgeBase.responses.payment_received;
}

/**
 * Build payment confirmed message
 * @param {Object} orderData - Order details
 * @returns {string} - Confirmation message
 */
function buildPaymentConfirmedResponse(orderData) {
    return knowledgeBase.responses.payment_confirmed
        .replace('{order_id}', orderData.orderId || orderData.id)
        .replace('{service_name}', orderData.serviceName)
        .replace('{amount}', orderData.amount?.toLocaleString() || 'N/A')
        .replace('{delivery_time}', orderData.deliveryTime || '3-7 days');
}

/**
 * Build payment rejected message
 * @param {string} reason - Rejection reason
 * @returns {string} - Rejection message
 */
function buildPaymentRejectedResponse(reason) {
    return knowledgeBase.responses.payment_rejected
        .replace('{reason}', reason);
}

/**
 * Build handoff message
 * @returns {string} - Handoff message
 */
function buildHandoffResponse() {
    return knowledgeBase.responses.handoff_initiated;
}

/**
 * Build out of scope message
 * @returns {string} - Out of scope message
 */
function buildOutOfScopeResponse() {
    return knowledgeBase.responses.out_of_scope;
}

/**
 * Build error message
 * @returns {string} - Error message
 */
function buildErrorResponse() {
    return knowledgeBase.responses.error
        .replace('{admin_phone}', config.admin.phoneNumber);
}

/**
 * Get greeting message
 * @param {boolean} isReturning - Whether customer is returning
 * @returns {string} - Greeting message
 */
function getGreetingMessage(isReturning = false) {
    const template = isReturning
        ? knowledgeBase.greetings.returning
        : knowledgeBase.greetings.welcome;

    return template.replace('{business_name}', knowledgeBase.business.name);
}

/**
 * Get service list message
 * @returns {string} - Formatted service list
 */
function getServiceListMessage() {
    const services = knowledgeBase.services.map(s => {
        const popular = s.popular ? ' ⭐' : '';
        return `• *${s.name}*${popular} - Rs. ${s.price.toLocaleString()}`;
    }).join('\n');

    return `📋 *Hamare Packages:*\n\n${services}\n\nKisi bhi package ke baare mein detail jaanne ke liye uska naam likh dein!`;
}

/**
 * Get payment methods message
 * @returns {string} - Formatted payment methods
 */
function getPaymentMethodsMessage() {
    const methods = knowledgeBase.payment_methods.map((pm, index) => {
        let details = `${index + 1}️⃣ *${pm.method}*\n`;
        if (pm.account_number) details += `   📱 ${pm.account_number}\n`;
        if (pm.account_title || pm.account_name) details += `   👤 ${pm.account_title || pm.account_name}`;
        if (pm.bank_name) details += `\n   🏦 ${pm.bank_name}`;
        return details;
    }).join('\n\n');

    const advance = knowledgeBase.advance_payment;

    return `💳 *Payment Methods:*\n\n${methods}\n\n📝 ${advance.note}\n\nPayment karne ke baad screenshot yahan share kar dein ✅`;
}

module.exports = {
    buildPrompt,
    buildPaymentReceivedResponse,
    buildPaymentConfirmedResponse,
    buildPaymentRejectedResponse,
    buildHandoffResponse,
    buildOutOfScopeResponse,
    buildErrorResponse,
    getGreetingMessage,
    getServiceListMessage,
    getPaymentMethodsMessage,
    formatKnowledgeBase,
    formatConversationContext
};
