-- Create chats and messages tables for Avito Messenger integration
-- This migration creates tables to store chat conversations and messages from Avito

-- Create chats table
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  avito_chat_id VARCHAR(255) NOT NULL, -- Avito chat ID (unique per account)
  avito_user_id VARCHAR(255) NOT NULL, -- Avito user_id (account number)
  avito_item_id VARCHAR(255), -- Avito item_id (advertisement ID)
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
  contact_name TEXT, -- Name of the contact (buyer/renter)
  contact_phone TEXT, -- Phone number of the contact
  contact_avatar_url TEXT, -- Avatar URL from Avito
  status VARCHAR(20) DEFAULT 'new', -- new, in_progress, closed
  unread_count INTEGER DEFAULT 0, -- Number of unread messages
  last_message_text TEXT, -- Last message preview
  last_message_at TIMESTAMPTZ, -- Timestamp of last message
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL, -- Linked booking if created from chat
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure one chat per Avito chat_id per owner
  UNIQUE(owner_id, avito_chat_id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  avito_message_id VARCHAR(255) NOT NULL, -- Avito message ID
  sender_type VARCHAR(20) NOT NULL, -- 'user' (owner) or 'contact' (buyer/renter)
  sender_name TEXT, -- Name of the sender
  text TEXT, -- Message text content
  attachments JSONB DEFAULT '[]', -- Array of attachment objects {type, url, name}
  is_read BOOLEAN DEFAULT false, -- Whether message is read
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure one message per Avito message_id per chat
  UNIQUE(chat_id, avito_message_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chats_owner_id ON chats(owner_id);
CREATE INDEX IF NOT EXISTS idx_chats_property_id ON chats(property_id);
CREATE INDEX IF NOT EXISTS idx_chats_integration_id ON chats(integration_id);
CREATE INDEX IF NOT EXISTS idx_chats_status ON chats(status);
CREATE INDEX IF NOT EXISTS idx_chats_last_message_at ON chats(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_unread_count ON chats(unread_count) WHERE unread_count > 0;
CREATE INDEX IF NOT EXISTS idx_chats_booking_id ON chats(booking_id);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_avito_message_id ON messages(avito_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read) WHERE is_read = false;

-- Enable RLS on chats table
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

-- RLS policies for chats
CREATE POLICY "Users can view their own chats"
ON chats FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Users can create their own chats"
ON chats FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own chats"
ON chats FOR UPDATE
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Users can delete their own chats"
ON chats FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- Enable RLS on messages table
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for messages
CREATE POLICY "Users can view messages in their chats"
ON messages FOR SELECT
TO authenticated
USING (chat_id IN (SELECT id FROM chats WHERE owner_id = auth.uid()));

CREATE POLICY "Users can create messages in their chats"
ON messages FOR INSERT
TO authenticated
WITH CHECK (chat_id IN (SELECT id FROM chats WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update messages in their chats"
ON messages FOR UPDATE
TO authenticated
USING (chat_id IN (SELECT id FROM chats WHERE owner_id = auth.uid()));

CREATE POLICY "Users can delete messages in their chats"
ON messages FOR DELETE
TO authenticated
USING (chat_id IN (SELECT id FROM chats WHERE owner_id = auth.uid()));

-- Function to update chat's last_message_at and last_message_text
CREATE OR REPLACE FUNCTION update_chat_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chats
  SET 
    last_message_text = NEW.text,
    last_message_at = NEW.created_at,
    updated_at = NOW()
  WHERE id = NEW.chat_id;
  
  -- Increment unread count if message is from contact
  IF NEW.sender_type = 'contact' AND NEW.is_read = false THEN
    UPDATE chats
    SET unread_count = unread_count + 1
    WHERE id = NEW.chat_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update chat when new message is inserted
DROP TRIGGER IF EXISTS trigger_update_chat_last_message ON messages;
CREATE TRIGGER trigger_update_chat_last_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_last_message();

-- Function to update unread count when message is marked as read
CREATE OR REPLACE FUNCTION update_chat_unread_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_read = true AND OLD.is_read = false AND NEW.sender_type = 'contact' THEN
    UPDATE chats
    SET unread_count = GREATEST(0, unread_count - 1)
    WHERE id = NEW.chat_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update unread count when message is read
DROP TRIGGER IF EXISTS trigger_update_chat_unread_count ON messages;
CREATE TRIGGER trigger_update_chat_unread_count
  AFTER UPDATE OF is_read ON messages
  FOR EACH ROW
  WHEN (NEW.is_read IS DISTINCT FROM OLD.is_read)
  EXECUTE FUNCTION update_chat_unread_count();

-- Add chat_id column to bookings table for linking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS chat_id UUID REFERENCES chats(id) ON DELETE SET NULL;

-- Create index for booking chat lookup
CREATE INDEX IF NOT EXISTS idx_bookings_chat_id ON bookings(chat_id);

-- Add comments for documentation
COMMENT ON TABLE chats IS 'Stores chat conversations from Avito Messenger API';
COMMENT ON TABLE messages IS 'Stores individual messages within chats';
COMMENT ON COLUMN chats.avito_chat_id IS 'Unique chat identifier from Avito API';
COMMENT ON COLUMN chats.status IS 'Chat status: new, in_progress, closed';
COMMENT ON COLUMN chats.unread_count IS 'Number of unread messages from contact';
COMMENT ON COLUMN messages.sender_type IS 'Message sender: user (owner) or contact (buyer/renter)';
COMMENT ON COLUMN messages.attachments IS 'JSON array of attachment objects with type, url, name';
