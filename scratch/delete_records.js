const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const clientsToDelete = [
    "E2E Client m7bidz2g",
    "E2E Client tmitxjw1",
    "Untrip",
    "AshishC",
    "AMD",
    "Sand Client",
    "MinClient",
    "Soumclient" // from circuit image
  ];

  const vendorsToDelete = [
    "E2E Vendor m7bidz2g",
    "E2E Vendor tmitxjw1",
    "Wow Momo",
    "RatulV",
    "intel",
    "Sand Vendor",
    "MinVend",
    "SoumVendor",
    "Neutrality2"
  ];

  const circuitsToDelete = [
    "N1/SCM/2027", "N1/SCN/2027",
    "N1/TON/2027", "N1/PON/2027",
    "N1/SDC/2027", "N1/SDV/2027",
    "N1/MC/2027",  "N1/MV/2027",
    "N1/SD/2027",  "N1/CT/2027",
    "N1/AL/2027",  "N1/AT/2027",
    "N1/AD/2027",  "N1/IL/2027",
    "N1/AC/2027",  "N1/RV/2027",
    "N1/UT/2027",  "N1/WM/2027"
  ];

  console.log("Starting deletion process...");

  // 1. Delete Tickets (In Progress and Closed)
  const ticketStatuses = ['In Progress', 'Closed', 'In-Progress', 'Resolved'];
  const ticketsToDeleteObj = await prisma.ticket.findMany({
    where: {
      status: {
        in: ticketStatuses
      }
    },
    select: { id: true }
  });
  
  const ticketIds = ticketsToDeleteObj.map(t => t.id);
  console.log(`Found ${ticketIds.length} tickets to delete.`);
  
  if (ticketIds.length > 0) {
    await prisma.reply.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.note.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.sLARecord.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.activityLog.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.workNote.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.notification.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    console.log(`Deleted tickets and their related records.`);
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

  // Helper to delete all relations for a vendor before deleting vendor
  async function deleteVendorWithRelations(vendorId) {
    // tickets
    const vendorTickets = await prisma.ticket.findMany({ where: { vendorId }, select: { id: true } });
    const vTids = vendorTickets.map(t => t.id);
    if (vTids.length > 0) {
      await prisma.reply.deleteMany({ where: { ticketId: { in: vTids } } });
      await prisma.note.deleteMany({ where: { ticketId: { in: vTids } } });
      await prisma.sLARecord.deleteMany({ where: { ticketId: { in: vTids } } });
      await prisma.activityLog.deleteMany({ where: { ticketId: { in: vTids } } });
      await prisma.workNote.deleteMany({ where: { ticketId: { in: vTids } } });
      await prisma.notification.deleteMany({ where: { ticketId: { in: vTids } } });
      await prisma.ticket.deleteMany({ where: { id: { in: vTids } } });
    }

    // slas
    await prisma.sla.deleteMany({ where: { vendorId } });
    
    // circuits
    const vendorCircuits = await prisma.circuit.findMany({ where: { vendorId }, select: { id: true } });
    for (const c of vendorCircuits) {
      await prisma.vendorCircuit.deleteMany({ where: { circuitId: c.id } });
      await prisma.circuitSLAValue.deleteMany({ where: { circuitId: c.id } });
      await prisma.sla.deleteMany({ where: { circuitId: c.id } });
      await prisma.circuit.delete({ where: { id: c.id } });
    }
    
    // vendorCircuits (if any direct)
    await prisma.vendorCircuit.deleteMany({ where: { vendorId } });

    await prisma.vendor.delete({ where: { id: vendorId } });
  }

  // 2. Delete Circuits explicitly requested
  const circuits = await prisma.circuit.findMany({
    where: {
      OR: [
        { customerCircuitId: { in: circuitsToDelete } },
        { supplierCircuitId: { in: circuitsToDelete } }
      ]
    }
  });

  console.log(`Found ${circuits.length} circuits to delete explicitly.`);
  for (const circuit of circuits) {
      await prisma.vendorCircuit.deleteMany({ where: { circuitId: circuit.id } });
      await prisma.circuitSLAValue.deleteMany({ where: { circuitId: circuit.id } });
      await prisma.sla.deleteMany({ where: { circuitId: circuit.id } });
      
      // Since tickets don't have strict foreign keys on circuitId, we can just delete the circuit
      // But let's check if we want to delete tickets attached to these circuits?
      // Prompt says: "clear all the selected Clients vendors and curcuits ... and clear all Inprogress and closed tickets"
      // If a ticket uses this circuitId (which is a string), it will just have a dangling ID. That's fine for our data integrity (Prisma won't complain).
      await prisma.circuit.delete({ where: { id: circuit.id } });
  }
  console.log(`Deleted circuits.`);

  // 3. Delete Clients
  const clients = await prisma.client.findMany({
    where: {
      name: { in: clientsToDelete }
    }
  });
  console.log(`Found ${clients.length} clients to delete.`);
  for (const client of clients) {
      await deleteClientWithRelations(client.id);
  }
  console.log(`Deleted clients.`);

  // 4. Delete Vendors
  const vendors = await prisma.vendor.findMany({
    where: {
      name: { in: vendorsToDelete }
    }
  });
  console.log(`Found ${vendors.length} vendors to delete.`);
  for (const vendor of vendors) {
      await deleteVendorWithRelations(vendor.id);
  }
  console.log(`Deleted vendors.`);

  console.log("Deletion process finished.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
