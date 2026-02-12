/*
  Warnings:

  - You are about to drop the column `customerId` on the `Circuit` table. All the data in the column will be lost.
  - You are about to drop the column `supplierId` on the `Circuit` table. All the data in the column will be lost.
  - You are about to drop the `Customer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Supplier` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Circuit" DROP CONSTRAINT "Circuit_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Circuit" DROP CONSTRAINT "Circuit_supplierId_fkey";

-- AlterTable
ALTER TABLE "Circuit" DROP COLUMN "customerId",
DROP COLUMN "supplierId",
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "vendorId" TEXT;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "messageId" TEXT;

-- DropTable
DROP TABLE "Customer";

-- DropTable
DROP TABLE "Supplier";

-- AddForeignKey
ALTER TABLE "Circuit" ADD CONSTRAINT "Circuit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Circuit" ADD CONSTRAINT "Circuit_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
