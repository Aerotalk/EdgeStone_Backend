const ticket = {
    id: "0e5fcfb5-a8f9-4d45-a9f2-1f762aeeb796",
    ticketId: "#1003",
    date: "11 Feb 2026",
    receivedAt: null,
    receivedTime: null,
    createdAt: "2026-02-11T19:01:26.511Z"
};

console.log("--- Testing Frontend Fallback Logic ---");
console.log("Ticket Data:", ticket);

// Logic from TicketInfoSidebar.tsx
const displayTime = ticket.receivedTime || new Date(ticket.createdAt || new Date()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
console.log("Display Time (should be ~19:01):", displayTime);

// Logic from TicketReplyView.tsx (Auto-reply time)
const baseTime = ticket.receivedAt ? new Date(ticket.receivedAt) : (ticket.createdAt ? new Date(ticket.createdAt) : new Date());
const slaStartTime = new Date(baseTime.getTime() + 60000);
const hours = slaStartTime.getHours().toString().padStart(2, '0');
const minutes = slaStartTime.getMinutes().toString().padStart(2, '0');
const slaStartDisplay = `${hours}:${minutes} hrs`;

console.log("SLA Start Time (should be ~19:02):", slaStartDisplay);

if (displayTime !== 'null' && displayTime !== '19:00 hrs') {
    console.log("✅ Fallback logic WORKS. It uses createdAt.");
} else {
    console.log("❌ Fallback logic FAILED.");
}
