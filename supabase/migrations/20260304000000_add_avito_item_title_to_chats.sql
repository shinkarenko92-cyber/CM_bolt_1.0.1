-- Add avito_item_title to chats for displaying ad title in message list (from Avito getChats context.value.title)
ALTER TABLE chats ADD COLUMN IF NOT EXISTS avito_item_title TEXT;
COMMENT ON COLUMN chats.avito_item_title IS 'Title of the Avito listing (ad) from getChats API context.value.title';
