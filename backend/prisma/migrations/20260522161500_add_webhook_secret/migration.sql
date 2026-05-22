-- AlterTable: webhookSecret nullable. Existing tenants ficam null —
-- precisam rotacionar via endpoint pra ativar HMAC. Quando
-- WEBHOOK_REQUIRE_SIGNATURE=false (default), endpoint webhook aceita
-- sem assinatura, então tenants null continuam funcionais.
ALTER TABLE "Tenant" ADD COLUMN "webhookSecret" TEXT;
