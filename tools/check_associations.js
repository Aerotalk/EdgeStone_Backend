const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  console.log("--- Checking Circuits ---");
  const circuits = await prisma.circuit.findMany({
    where: {
      OR: [
        { vendorId: null },
        { clientId: null }
      ]
    }
  });

  const allCircuits = await prisma.circuit.count();

  console.log(`Total Circuits: ${allCircuits}`);
  console.log(`Circuits missing Vendor or Client: ${circuits.length}`);
  if (circuits.length > 0) {
     console.log("Missing combinations (showing up to 10):");
     circuits.slice(0, 10).forEach(c => {
         console.log(`  - DB ID: ${c.id}, Customer Circuit ID: ${c.customerCircuitId}, vendorId: ${c.vendorId}, clientId: ${c.clientId}`);
     });
     if (circuits.length > 10) console.log("  ...and more.");
  }

  console.log("\n--- Checking Tickets ---");
  const tickets = await prisma.ticket.findMany({
    where: {
      circuitId: null
    }
  });
  
  const allTickets = await prisma.ticket.count();
  
  console.log(`Total Tickets: ${allTickets}`);
  console.log(`Tickets missing Circuit ID: ${tickets.length}`);
  if (tickets.length > 0) {
      console.log("Tickets without circuit (showing up to 10):");
      tickets.slice(0, 10).forEach(t => {
          console.log(`  - Ticket: ${t.ticketId} (Type: ${t.ticketType}, Status: ${t.status})`);
      });
      if (tickets.length > 10) console.log("  ...and more.");
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());
