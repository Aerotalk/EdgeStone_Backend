const { PrismaClient } = require('../node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ticket = await prisma.ticket.findFirst({
    where: { ticketId: { contains: '1003' } },
    include: { replies: true, activityLogs: true }
  });
  if (!ticket) {
    console.log('Ticket not found.');
  } else {
    console.log('Ticket:', ticket.ticketId);
    console.log('Email:', ticket.email);
    console.log('\n--- Replies ---');
    ticket.replies.forEach(r => {
      console.log(`- Author: ${r.author} (Type: ${r.type})`);
      console.log(`  To: ${r.to.join(',')}`);
      console.log(`  Date: ${r.date} ${r.time}`);
      console.log(`  Text: ${r.text.substring(0, 100).replace(/\n/g, ' ')}...`);
    });
    console.log('\n--- Activity Logs ---');
    ticket.activityLogs.forEach(a => {
      if (a.action === 'replied' || a.action === 'auto_replied' || String(a.description).includes('marketing')) {
        console.log(`- [${a.date} ${a.time}] ${a.author}: ${a.action} -> ${a.description}`);
      }
    });
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
