-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
  'USER_REGISTER',
  'USER_LOGIN_SUCCESS',
  'USER_LOGIN_FAIL',
  'USER_LOGOUT',
  'USER_PASSWORD_CHANGE',
  'USER_PASSWORD_RESET_REQUEST',
  'USER_PASSWORD_RESET_COMPLETE',
  'USER_EMAIL_VERIFY_REQUEST',
  'USER_EMAIL_VERIFY_COMPLETE',
  'USER_GOOGLE_LINK',
  'USER_GOOGLE_SIGNUP',
  'TENANT_CREATE',
  'TENANT_SETTINGS_UPDATE',
  'MEMBERSHIP_INVITE',
  'MEMBERSHIP_REMOVE',
  'MEMBERSHIP_ROLE_CHANGE',
  'INTEGRATION_CONNECT',
  'INTEGRATION_DISCONNECT',
  'WEBHOOK_SECRET_ROTATE'
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt" DESC);
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt" DESC);
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt" DESC);
