/**
 * Configuration Module
 * Loads and exports all environment variables and configuration settings
 */

require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`Warning: ${envVar} is not set in environment variables`);
  }
}

const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT, 10) || 4000,
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production'
  },

  // WAHA (WhatsApp HTTP API) Configuration
  waha: {
    apiUrl: process.env.WAHA_API_URL || 'http://localhost:3000',
    session: process.env.WAHA_SESSION || 'default',
    apiKey: process.env.WAHA_API_KEY || '',
    endpoints: {
      sendText: '/api/sendText',
      sendImage: '/api/sendImage',
      sendDocument: '/api/sendDocument',
      sessions: '/api/sessions'
    }
  },

  // Supabase Configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY
  },

  // Google Gemini API Configuration (Primary)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 500,
      topP: 0.8,
      topK: 40
    }
  },

  // OpenRouter Configuration (Fallback 1)
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.1-8b-instruct:free'
  },

  // Groq Configuration (Fallback 2)
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-8b-instant'
  },

  // Google Sheets Configuration
  sheets: {
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    serviceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT || './service-account.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    sheetNames: {
      payments: 'Payments',
      handoff: 'Human Handoff'
    }
  },

  // Admin Configuration
  admin: {
    phoneNumber: process.env.ADMIN_PHONE || '923001234567',
    get chatId() {
      return `${this.phoneNumber}@c.us`;
    }
  },

  // Rate Limiting Configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 30
  },

  // Timeouts
  timeouts: {
    wahaRequest: 30000,
    geminiRequest: 60000,
    sheetsRequest: 15000
  }
};

module.exports = config;
