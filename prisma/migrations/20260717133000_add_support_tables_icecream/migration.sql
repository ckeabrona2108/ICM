DO $$
BEGIN
  CREATE TYPE icecream."SupportTicketStatus" AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'WAITING_USER',
    'RESOLVED',
    'CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE icecream."MessageDirection" AS ENUM (
    'INBOUND',
    'OUTBOUND'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS icecream."SupportTicket" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  status icecream."SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  priority text NOT NULL DEFAULT 'normal',
  "adminComment" text,
  "createdAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" timestamp(6),
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY (id),
  CONSTRAINT "SupportTicket_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES icecream."User"(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS icecream."Message" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" text NOT NULL,
  "ticketId" uuid,
  subject text NOT NULL,
  body text NOT NULL,
  direction icecream."MessageDirection" NOT NULL,
  "isRead" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY (id),
  CONSTRAINT "Message_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES icecream."User"(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Message_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES icecream."SupportTicket"(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SupportTicket_userId_updatedAt_idx"
  ON icecream."SupportTicket"("userId", "updatedAt");

CREATE INDEX IF NOT EXISTS "Message_userId_createdAt_idx"
  ON icecream."Message"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Message_ticketId_createdAt_idx"
  ON icecream."Message"("ticketId", "createdAt");
