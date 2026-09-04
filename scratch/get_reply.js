const prisma = require('../models/index');

async function get() { 
  const t = await prisma.ticket.findFirst({where:{ticketId:'#1003'}}); 
  const replies = await prisma.reply.findMany({where:{ticketId:t.id, author:'EdgeStone Marketing'}}); 
  console.log(replies.map(r => ({author: r.author, to: r.to}))); 
} 

get().finally(() => prisma.$disconnect());
