const fs = require('fs');
const path = require('path');

const ticketServicePath = path.join(__dirname, 'services', 'ticketService.js');

try {
    const content = fs.readFileSync(ticketServicePath, 'utf8');
    if (content.includes('PERMAN is fetching time')) {
        console.log('✅ SUCCESS: ticketService.js contains the PERMAN logs.');
    } else {
        console.log('❌ FAILURE: ticketService.js DOES NOT contain the PERMAN logs.');
    }
} catch (error) {
    console.error('Error reading file:', error);
}
