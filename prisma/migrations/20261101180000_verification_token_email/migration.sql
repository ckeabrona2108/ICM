-- Email changes are confirmed by a link sent to the new address; the token keeps that address.
ALTER TABLE "icecream"."verification_tokens" ADD COLUMN "email" TEXT;
