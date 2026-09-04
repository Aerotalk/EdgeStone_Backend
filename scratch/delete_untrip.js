const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Checking for 'Untrip' clients...");

  // Find all clients that match 'Untrip' case-insensitively
  const clients = await prisma.client.findMany({
    where: {
      name: {
        contains: 'Untrip',
        mode: 'insensitive',
      }
    }
  });

  console.log(`Found ${clients.length} matching clients.`);
  
  if (clients.length === 0) {
    console.log("No 'Untrip' client found in the database. It might have already been deleted.");
    return;
  }

  // Helper to delete all relations for a client before deleting client
  async function deleteClientWithRelations(clientId) {
    // tickets
    const clientTickets = await prisma.ticket.findMany({ where: { clientId }, select: { id: true } });
    const cTids = clientTickets.map(t => t.id);
    if (cTids.length > 0) {
      await prisma.reply.deleteMany({ where: { ticketId: { in: cTids } } });
      await prisma.note.deleteMany({ where: { ticketId: { in: cTids } } });
      await prisma.sLARecord.deleteMany({ where: { ticketId: { in: cTids } } });
      await prisma.activityLog.deleteMany({ where: { ticketId: { in: cTids } } });
      await prisma.workNote.deleteMany({ where: { ticketId: { in: cTids } } });
      await prisma.notification.deleteMany({ where: { ticketId: { in: cTids } } });
      await prisma.ticket.deleteMany({ where: { id: { in: cTids } } });
    }
    
    // slas
    await prisma.sla.deleteMany({ where: { customerId: clientId } });
    
    // circuits
    const clientCircuits = await prisma.circuit.findMany({ where: { clientId }, select: { id: true } });
    for (const c of clientCircuits) {
      await prisma.vendorCircuit.deleteMany({ where: { circuitId: c.id } });
      await prisma.circuitSLAValue.deleteMany({ where: { circuitId: c.id } });
      await prisma.sla.deleteMany({ where: { circuitId: c.id } });
      await prisma.circuit.delete({ where: { id: c.id } });
    }

    await prisma.client.delete({ where: { id: clientId } });
  }

  for (const client of clients) {
    console.log(`Deleting client: ${client.name} (ID: ${client.id})`);
    await deleteClientWithRelations(client.id);
  }

  console.log("Deletion completed.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
