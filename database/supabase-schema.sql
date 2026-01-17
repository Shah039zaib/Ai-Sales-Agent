-- WhatsApp AI Sales Agent - Supabase Database Schema
-- Run this SQL in your Supabase SQL Editor to create all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CONVERSATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    chat_id TEXT NOT NULL UNIQUE,
    phone_number TEXT NOT NULL,
    customer_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'human_handoff', 'completed', 'blocked')),
    human_agent TEXT DEFAULT NULL,
    total_messages INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_chat_id ON conversations(chat_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);

-- =====================================================
-- MESSAGES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    message_id TEXT,
    sender TEXT NOT NULL CHECK(sender IN ('customer', 'bot', 'human', 'system')),
    message TEXT NOT NULL,
    message_type TEXT DEFAULT 'text' CHECK(message_type IN ('text', 'image', 'document', 'audio', 'video')),
    media_url TEXT,
    intent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    is_read BOOLEAN DEFAULT FALSE
);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

-- =====================================================
-- PAYMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    chat_id TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    service_id TEXT,
    service_name TEXT,
    amount DECIMAL(10,2),
    currency TEXT DEFAULT 'PKR',
    payment_method TEXT,
    screenshot_url TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'refunded')),
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_chat_id ON payments(chat_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_phone ON payments(phone_number);

-- =====================================================
-- HANDOFF_QUEUE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS handoff_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    chat_id TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    customer_name TEXT,
    reason TEXT NOT NULL,
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'assigned', 'in_progress', 'resolved', 'cancelled')),
    assigned_to TEXT,
    assigned_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for handoff queue
CREATE INDEX IF NOT EXISTS idx_handoff_chat_id ON handoff_queue(chat_id);
CREATE INDEX IF NOT EXISTS idx_handoff_status ON handoff_queue(status);
CREATE INDEX IF NOT EXISTS idx_handoff_priority ON handoff_queue(priority);

-- =====================================================
-- RATE_LIMITS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    chat_id TEXT NOT NULL UNIQUE,
    message_count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_chat ON rate_limits(chat_id);

-- =====================================================
-- FUNCTIONS FOR AUTO-UPDATE TIMESTAMPS
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_handoff_updated_at ON handoff_queue;
CREATE TRIGGER update_handoff_updated_at
    BEFORE UPDATE ON handoff_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (Optional - Enable if needed)
-- =====================================================
-- ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE handoff_queue ENABLE ROW LEVEL SECURITY;
