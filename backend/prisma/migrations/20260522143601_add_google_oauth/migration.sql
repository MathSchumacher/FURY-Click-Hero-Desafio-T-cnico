-- AlterTable: passwordHash agora é opcional (contas OAuth não têm senha local)
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable: campos pra contas vinculadas via Google sign-in
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;

-- CreateIndex: googleId é único (mesmo sub do Google nunca aparece em 2 users)
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
