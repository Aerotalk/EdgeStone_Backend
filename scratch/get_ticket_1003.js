const prisma = require('../models/index');

async function getLogs() {
  const t = await prisma.ticket.findFirst({
    where: { ticketId: '#1003' },
    include: {
      replies: true,
      activityLogs: { orderBy: { createdAt: 'asc' } },
      workNotes: { orderBy: { createdAt: 'asc' } }
    }
  });

  if (!t) {
    console.log('Ticket #1003 not found.');
    return;
  }

  console.log('--- Ticket ---');
  console.log(`ID: ${t.ticketId}`);
  console.log(`Header: ${t.header}`);
  console.log(`Status: ${t.status}`);
  console.log(`Email: ${t.email}`);

  console.log('\n--- Activity Logs ---');
  t.activityLogs.forEach(l => {
    console.log(`[${l.date} ${l.time}] ${l.author}: ${l.action} - ${l.description}`);
  });

  console.log('\n--- Replies ---');
  t.replies.forEach(r => {
    console.log(`[${r.date} ${r.time}] ${r.author} (${r.type}): ${r.text.substring(0, 100).replace(/\n/g, ' ')}...`);
  });

  console.log('\n--- Work Notes ---');
  t.workNotes.forEach(w => {
    console.log(`[${w.createdAt.toISOString()}] ${w.author}: ${w.text.replace(/\n/g, ' ')}`);
  });
}

getLogs()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
