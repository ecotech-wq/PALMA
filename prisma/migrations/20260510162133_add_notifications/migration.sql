CREATE TYPE "NotificationType" AS ENUM (
  'RAPPORT_CREE',
  'INCIDENT_OUVERT',
  'INCIDENT_RESOLU',
  'DEMANDE_CREEE',
  'DEMANDE_APPROUVEE',
  'DEMANDE_REFUSEE',
  'DEMANDE_COMMANDEE',
  'PAIEMENT_GENERE',
  'USER_PENDING',
  'AUTRE'
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT,
  "link" TEXT,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt" DESC);

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
