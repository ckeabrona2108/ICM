CREATE TYPE icecream."SupportTicketStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'WAITING_USER',
  'RESOLVED',
  'CLOSED'
);

CREATE TYPE icecream."MessageDirection" AS ENUM (
  'INBOUND',
  'OUTBOUND'
);

CREATE TABLE icecream."SupportTicket" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
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
    FOREIGN KEY ("userId") REFERENCES icecream."user"(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE icecream."Message" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
  "ticketId" uuid,
  subject text NOT NULL,
  body text NOT NULL,
  direction icecream."MessageDirection" NOT NULL,
  "isRead" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY (id),
  CONSTRAINT "Message_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES icecream."user"(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Message_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES icecream."SupportTicket"(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SupportTicket_userId_updatedAt_idx"
  ON icecream."SupportTicket"("userId", "updatedAt");

CREATE INDEX "Message_userId_createdAt_idx"
  ON icecream."Message"("userId", "createdAt");

CREATE INDEX "Message_ticketId_createdAt_idx"
  ON icecream."Message"("ticketId", "createdAt");
