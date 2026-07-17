-- Idempotence du rangement GED tenue en base : une meme piece d'un meme
-- message ne peut etre rangee qu'une fois (deux onglets, retry). Les
-- depots directs (messageId NULL) ne sont pas contraints (NULLs distincts).
CREATE UNIQUE INDEX IF NOT EXISTS "AffaireDocument_affaireId_messageId_fichier_key" ON "AffaireDocument"("affaireId", "messageId", "fichier");
