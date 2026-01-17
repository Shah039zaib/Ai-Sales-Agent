/**
 * Intent Classifier
 * Detects user intent from messages to route to appropriate handlers
 * Implements pattern matching and keyword detection for intent classification
 */

const knowledgeBase = require('../config/knowledge-base.json');

/**
 * Intent types enumeration
 */
const INTENTS = {
    GREETING: 'GREETING',
    SERVICE_INQUIRY: 'SERVICE_INQUIRY',
    PRICING_INQUIRY: 'PRICING_INQUIRY',
    PAYMENT_CONFIRMATION: 'PAYMENT_CONFIRMATION',
    PAYMENT_INQUIRY: 'PAYMENT_INQUIRY',
    ORDER_INTENT: 'ORDER_INTENT',
    HUMAN_REQUEST: 'HUMAN_REQUEST',
    FAQ: 'FAQ',
    FRUSTRATION: 'FRUSTRATION',
    CONFIRMATION: 'CONFIRMATION',
    REJECTION: 'REJECTION',
    OUT_OF_SCOPE: 'OUT_OF_SCOPE',
    GENERAL_CHAT: 'GENERAL_CHAT'
};

/**
 * Pattern definitions for intent detection
 */
const PATTERNS = {
    [INTENTS.GREETING]: [
        /^(hi|hello|hey|assalam|salam|aoa|asc|good morning|good evening|good afternoon)[\s!.,]*$/i,
        /^(hi|hello|hey|salam|aoa)\s*(there|everyone|all)?[\s!.,]*$/i,
        /^(assalam\s*o?\s*alaikum|wa\s*alaikum\s*assalam)[\s!.,]*$/i,
        /^(kia|kya)\s*(hal|haal)[\s?]*$/i
    ],

    [INTENTS.SERVICE_INQUIRY]: [
        /\b(service|package|offer|plan|what\s+do\s+you\s+(do|offer))\b/i,
        /\b(tell|show|explain|describe)\s+(me\s+)?(about\s+)?(your\s+)?(service|package|offer)/i,
        /\b(basic|standard|premium)\s*(package|plan)?/i,
        /\b(kya|konsi)\s+(service|package)/i,
        /\bservice\s*(list|details?|info)/i,
        /\b(features?|include|kya\s+milega)\b/i
    ],

    [INTENTS.PRICING_INQUIRY]: [
        /\b(price|pricing|cost|rate|kitne|kitna|charge|fee|paisa|rupee|rs\.?|pkr)\b/i,
        /\b(how\s+much|kya\s+rate|konsi\s+price)\b/i,
        /\b(budget|affordable|cheap|expensive|discount)\b/i
    ],

    [INTENTS.PAYMENT_CONFIRMATION]: [
        /\b(paid|payment\s+(done|sent|kiya|kar\s*diya|ho\s*gaya))\b/i,
        /\b(bhej\s*(diya|di)|transfer\s*(kiya|kar\s*diya))\b/i,
        /\b(screenshot|receipt|slip)\b/i,
        /\b(check\s+kar(ein|o)?|verify\s+kar(ein|o)?)\b/i
    ],

    [INTENTS.PAYMENT_INQUIRY]: [
        /\b(how\s+to\s+pay|payment\s+method|kaise\s+pay)\b/i,
        /\b(jazzcash|easypaisa|bank\s+transfer|account\s+(number|details?))\b/i,
        /\b(advance|deposit|token)\s*(payment|amount)?/i,
        /\b(payment\s+details?|where\s+to\s+send|kahan\s+bhejun)\b/i
    ],

    [INTENTS.ORDER_INTENT]: [
        /\b(order|book|buy|purchase|khareed|lena\s+hai|chahiye)\b/i,
        /\b(want\s+to\s+(order|buy|get)|mujhe\s+chahiye)\b/i,
        /\b(proceed|confirm|finalize)\b/i,
        /\b(i('ll|\s+will)\s+(take|get|order))\b/i
    ],

    [INTENTS.HUMAN_REQUEST]: knowledgeBase.human_handoff_triggers.map(
        trigger => new RegExp(`\\b${trigger.replace(/\s+/g, '\\s+')}\\b`, 'i')
    ),

    [INTENTS.FRUSTRATION]: knowledgeBase.frustration_indicators.map(
        indicator => new RegExp(`\\b${indicator.replace(/\s+/g, '\\s+')}\\b`, 'i')
    ),

    [INTENTS.CONFIRMATION]: [
        /^(yes|yeah|yep|ok|okay|sure|alright|theek|thik|haan|ji|hnji|bilkul|zaroor)[\s!.,]*$/i,
        /\b(sounds?\s+good|perfect|great|done|agreed)\b/i
    ],

    [INTENTS.REJECTION]: [
        /^(no|nope|nah|nahi|na|cancel|stop)[\s!.,]*$/i,
        /\b(not\s+interested|don't\s+want|nahi\s+chahiye)\b/i
    ],

    [INTENTS.FAQ]: [
        /\b(refund|money\s+back|cancel|cancellation)\b/i,
        /\b(delivery|how\s+long|kitne\s+din|time\s+lagega)\b/i,
        /\b(revision|change|modify|update|edit)\b/i,
        /\b(support|after\s+service|help)\b/i,
        /\b(sample|portfolio|example|previous\s+work)\b/i,
        /\b(guarantee|warranty)\b/i
    ]
};

/**
 * Service name patterns for detecting specific service inquiries
 */
const SERVICE_PATTERNS = knowledgeBase.services.map(service => ({
    id: service.id,
    name: service.name,
    pattern: new RegExp(`\\b${service.name.replace(/\s+/g, '\\s+')}\\b`, 'i')
}));

/**
 * Classify the intent of a message
 * @param {string} message - The message text to classify
 * @param {Object} context - Additional context (conversation history, etc.)
 * @returns {Object} - Classification result with intent, confidence, and metadata
 */
function classifyIntent(message, context = {}) {
    if (!message || typeof message !== 'string') {
        return {
            intent: INTENTS.GENERAL_CHAT,
            confidence: 0.5,
            metadata: {}
        };
    }

    const cleanMessage = message.trim().toLowerCase();

    // Check for media (payment screenshot likely)
    if (context.hasMedia) {
        return {
            intent: INTENTS.PAYMENT_CONFIRMATION,
            confidence: 0.85,
            metadata: { hasMedia: true }
        };
    }

    // Check each intent pattern
    const matches = [];

    for (const [intent, patterns] of Object.entries(PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(cleanMessage)) {
                matches.push({
                    intent,
                    pattern: pattern.toString(),
                    confidence: calculateConfidence(intent, cleanMessage, pattern)
                });
                break; // One match per intent is enough
            }
        }
    }

    // If no patterns matched
    if (matches.length === 0) {
        return {
            intent: INTENTS.GENERAL_CHAT,
            confidence: 0.6,
            metadata: {}
        };
    }

    // Sort by confidence and get the highest
    matches.sort((a, b) => b.confidence - a.confidence);
    const bestMatch = matches[0];

    // Check for specific service mentioned
    const serviceMatch = SERVICE_PATTERNS.find(sp => sp.pattern.test(cleanMessage));

    const result = {
        intent: bestMatch.intent,
        confidence: bestMatch.confidence,
        metadata: {
            allMatches: matches.map(m => m.intent),
            matchedPattern: bestMatch.pattern
        }
    };

    // Add service info if detected
    if (serviceMatch) {
        result.metadata.serviceId = serviceMatch.id;
        result.metadata.serviceName = serviceMatch.name;

        // If asking about specific service, upgrade intent
        if (bestMatch.intent === INTENTS.GENERAL_CHAT) {
            result.intent = INTENTS.SERVICE_INQUIRY;
            result.confidence = 0.8;
        }
    }

    // Handle frustration - upgrade to human handoff
    if (bestMatch.intent === INTENTS.FRUSTRATION) {
        result.intent = INTENTS.HUMAN_REQUEST;
        result.metadata.frustrated = true;
        result.confidence = 0.9;
    }

    return result;
}

/**
 * Calculate confidence score for a match
 * @param {string} intent - The matched intent
 * @param {string} message - The original message
 * @param {RegExp} pattern - The matched pattern
 * @returns {number} - Confidence score between 0 and 1
 */
function calculateConfidence(intent, message, pattern) {
    let confidence = 0.7; // Base confidence

    // Short, direct messages have higher confidence for greetings
    if (intent === INTENTS.GREETING && message.length < 20) {
        confidence = 0.95;
    }

    // Explicit human requests are very confident
    if (intent === INTENTS.HUMAN_REQUEST) {
        confidence = 0.95;
    }

    // Frustration patterns are very clear indicators
    if (intent === INTENTS.FRUSTRATION) {
        confidence = 0.9;
    }

    // Payment with keywords is high confidence
    if (intent === INTENTS.PAYMENT_CONFIRMATION) {
        confidence = 0.85;
    }

    // Longer messages with service terms are moderately confident
    if (intent === INTENTS.SERVICE_INQUIRY && message.length > 30) {
        confidence = 0.75;
    }

    return confidence;
}

/**
 * Check if message requires human handoff
 * @param {string} message - The message to check
 * @param {Object} classification - The classification result
 * @returns {Object} - Handoff decision with reason
 */
function shouldHandoff(message, classification) {
    // Explicit human request
    if (classification.intent === INTENTS.HUMAN_REQUEST) {
        return {
            handoff: true,
            reason: classification.metadata.frustrated
                ? 'Customer frustration detected'
                : 'Customer requested human agent',
            priority: classification.metadata.frustrated ? 'high' : 'normal'
        };
    }

    // Out of scope questions after multiple attempts
    if (classification.intent === INTENTS.OUT_OF_SCOPE) {
        return {
            handoff: true,
            reason: 'Query outside knowledge base',
            priority: 'normal'
        };
    }

    return {
        handoff: false,
        reason: null,
        priority: null
    };
}

/**
 * Check if a message is an admin command
 * @param {string} message - The message to check
 * @returns {Object|null} - Admin command details or null
 */
function parseAdminCommand(message) {
    if (!message || !message.startsWith('/')) {
        return null;
    }

    const parts = message.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    const commands = {
        '/approve': { action: 'approve_payment', requiresId: true },
        '/reject': { action: 'reject_payment', requiresId: true },
        '/resume_ai': { action: 'resume_ai', requiresId: true },
        '/resumeai': { action: 'resume_ai', requiresId: true },
        '/assign': { action: 'assign_handoff', requiresId: true },
        '/resolve': { action: 'resolve_handoff', requiresId: true },
        '/status': { action: 'get_status', requiresId: false },
        '/stats': { action: 'get_stats', requiresId: false },
        '/help': { action: 'admin_help', requiresId: false }
    };

    const cmdInfo = commands[command];
    if (!cmdInfo) {
        return null;
    }

    return {
        command: command,
        action: cmdInfo.action,
        id: args[0] || null,
        args: args,
        raw: message
    };
}

/**
 * Detect language preference from message
 * @param {string} message - The message to analyze
 * @returns {string} - Detected language: 'urdu', 'english', or 'mixed'
 */
function detectLanguage(message) {
    // Common Urdu/Roman Urdu words
    const urduPatterns = [
        /\b(kya|kia|hai|hain|ho|mujhe|aap|tum|ye|yeh|wo|woh|chahiye|nahi|haan|ji|kaise|kyun|kahaan|kab|kaun)\b/i,
        /\b(shukriya|meherbani|acha|theek|bilkul|zaroor)\b/i,
        /\b(bhai|yaar|dost)\b/i
    ];

    const urduCount = urduPatterns.filter(p => p.test(message)).length;
    const wordCount = message.split(/\s+/).length;

    if (urduCount >= 2 || urduCount / wordCount > 0.3) {
        return 'urdu';
    } else if (urduCount > 0) {
        return 'mixed';
    }

    return 'english';
}

module.exports = {
    INTENTS,
    classifyIntent,
    shouldHandoff,
    parseAdminCommand,
    detectLanguage
};
