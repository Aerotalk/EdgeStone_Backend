const axios = require('axios');

async function checkLatestTicket() {
    try {
        console.log('Fetching tickets...');
        const response = await axios.get('http://localhost:5000/api/tickets');
        const tickets = response.data;

        if (tickets.length === 0) {
            console.log('No tickets found');
            return;
        }

        // Get the most recent ticket
        const latestTicket = tickets[0]; // Assuming default sort is new to old, otherwise check sort

        console.log('--- Latest Ticket Data ---');
        console.log('ID:', latestTicket.id);
        console.log('TicketID:', latestTicket.ticketId);
        console.log('Created At:', latestTicket.createdAt);
        console.log('Received At:', latestTicket.receivedAt);
        console.log('Received Time:', latestTicket.receivedTime);
        console.log('Date:', latestTicket.date);

        console.log('\n--- Replies ---');
        if (latestTicket.replies && latestTicket.replies.length > 0) {
            latestTicket.replies.forEach((reply, i) => {
                console.log(`Reply ${i + 1}:`);
                console.log('  Time:', reply.time);
                console.log('  Date:', reply.date);
                console.log('  Author:', reply.author);
                console.log('  Text:', reply.text.substring(0, 50) + '...');
            });
        } else {
            console.log('No replies');
        }

    } catch (error) {
        console.error('Error fetching tickets:', error.message);
    }
}

checkLatestTicket();
