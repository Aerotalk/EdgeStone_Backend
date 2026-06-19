const prisma = require('../utils/prisma');

const logger = require('../utils/logger');
const aiService = require('../services/aiService');

exports.getRoadmap = async (req, res) => {
    try {
        // Fetch all circuits with their clients and vendors
        const circuits = await prisma.circuit.findMany({
            include: {
                client: true,
                vendor: true
            }
        });

        // Fetch all tickets with SLA records and Replies count
        const tickets = await prisma.ticket.findMany({
            include: {
                slaRecords: true,
                _count: {
                    select: { replies: true }
                }
            }
        });

        // We will construct nodes and edges for React Flow
        const nodes = [];
        const edges = [];

        // Track positions roughly
        let x = 100;
        let y = 100;
        let spacingX = 350;
        let spacingY = 150;

        // Create Circuit Nodes
        circuits.forEach((circuit, index) => {
            nodes.push({
                id: `circuit-${circuit.id}`,
                type: 'default',
                data: {
                    label: `Circuit: ${circuit.customerCircuitId}\nSupplier ID: ${circuit.supplierCircuitId}\n\nClient: ${circuit.client?.name || 'N/A'}\nClient Emails: ${circuit.client?.emails?.join(', ') || 'N/A'}\n\nVendor: ${circuit.vendor?.name || 'N/A'}\nVendor Emails: ${circuit.vendor?.emails?.join(', ') || 'N/A'}`,
                    type: 'circuit',
                    status: circuit.type, // PROTECTED | UNPROTECTED
                    details: circuit
                },
                position: { x: x + (index * spacingX), y },
                style: { backgroundColor: '#e2e8f0', border: '1px solid #94a3b8', borderRadius: '8px', padding: '10px' }
            });
        });

        // Create Ticket Nodes
        y += spacingY;
        tickets.forEach((ticket, index) => {
            const isCircuitLinked = ticket.circuitId !== null;
            const parentCircuit = circuits.find(c => c.id === ticket.circuitId);
            
            // Determine Color based on Status
            let bgColor = '#bae6fd'; // Default Open/Progress (Blue)
            let borderColor = '#38bdf8';
            if (ticket.status === 'Closed') {
                bgColor = '#dcfce3'; // Green
                borderColor = '#4ade80';
            }

            nodes.push({
                id: `ticket-${ticket.id}`,
                type: 'default',
                data: {
                    label: `Ticket: ${ticket.ticketId}\n${ticket.status}`,
                    type: 'ticket',
                    status: ticket.status,
                    details: ticket
                },
                position: { x: x + (index * (spacingX / 2)), y },
                style: { backgroundColor: bgColor, border: `2px solid ${borderColor}`, borderRadius: '8px', padding: '10px' }
            });

            // Edge from Circuit to Ticket
            if (isCircuitLinked) {
                edges.push({
                    id: `edge-c${ticket.circuitId}-t${ticket.id}`,
                    source: `circuit-${ticket.circuitId}`,
                    target: `ticket-${ticket.id}`,
                    type: 'smoothstep',
                    animated: true
                });
            }

            // Create SLA Nodes linked to Ticket
            if (ticket.slaRecords && ticket.slaRecords.length > 0) {
                ticket.slaRecords.forEach((sla, slaIndex) => {
                    let slaColor = '#fef08a'; // Safe (Yellow)
                    let slaBorder = '#eab308';
                    if (sla.status === 'Breached') {
                        slaColor = '#fecaca'; // Breached (Red)
                        slaBorder = '#f87171';
                    }

                    const slaNodeId = `sla-${sla.id}`;
                    nodes.push({
                        id: slaNodeId,
                        type: 'default',
                        data: {
                            label: `SLA: ${sla.type}\n${sla.status}`,
                            type: 'sla',
                            status: sla.status,
                            details: sla
                        },
                        position: { x: x + (index * (spacingX / 2)) - 50 + (slaIndex * 100), y: y + spacingY },
                        style: { backgroundColor: slaColor, border: `2px solid ${slaBorder}`, borderRadius: '8px', padding: '10px' }
                    });

                    edges.push({
                        id: `edge-t${ticket.id}-s${sla.id}`,
                        source: `ticket-${ticket.id}`,
                        target: slaNodeId,
                        type: 'smoothstep'
                    });
                });
            }

            // Create Conversations Summary Node
            if (ticket._count.replies > 0) {
                const convNodeId = `conv-${ticket.id}`;
                nodes.push({
                    id: convNodeId,
                    type: 'default',
                    data: {
                        label: `Replies: ${ticket._count.replies}`,
                        type: 'conversation'
                    },
                    position: { x: x + (index * (spacingX / 2)) + 50, y: y + spacingY * 1.5 },
                    style: { backgroundColor: '#f3e8ff', border: '1px solid #c084fc', borderRadius: '8px', padding: '10px' }
                });

                edges.push({
                    id: `edge-t${ticket.id}-c${ticket.id}`,
                    source: `ticket-${ticket.id}`,
                    target: convNodeId,
                    type: 'dashed'
                });
            }
        });

        res.status(200).json({ nodes, edges });
    } catch (error) {
        logger.error('Error fetching roadmap:', error);
        res.status(500).json({ message: 'Error fetching roadmap data', error: error.message });
    }
};

exports.analyzeRoadmap = async (req, res) => {
    try {
        const circuits = await prisma.circuit.findMany({
            include: { client: true, vendor: true }
        });
        const tickets = await prisma.ticket.findMany({
            where: { status: { not: 'Closed' } }, // Only analyze open/progress tickets for health
            include: { slaRecords: true }
        });

        const analysis = await aiService.analyzeRoadmapState({ circuits, tickets });
        res.status(200).json({ insight: analysis });
    } catch (error) {
        logger.error('Error analyzing roadmap:', error);
        res.status(500).json({ message: 'Error generating AI insight', error: error.message });
    }
};
