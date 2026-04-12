const prisma = require('../models/index');
const logger = require('../utils/logger');

const getAllSLARecords = async () => {
    // --- BACKFILL: Ensure EVERY ticket has a corresponding SLA record ---
    const allTickets = await prisma.ticket.findMany();
    const existingRecords = await prisma.sLARecord.findMany();
    const existingTicketIds = new Set(existingRecords.map(r => r.ticketId));

    let createdAny = false;
    for (const ticket of allTickets) {
        if (!existingTicketIds.has(ticket.id)) {
            const baseTime = new Date(ticket.receivedAt || ticket.createdAt || new Date());
            const slaStart = new Date(baseTime.getTime() + 60000); 

            const startDateStr = slaStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const startTimeStr = slaStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' hrs';

            await prisma.sLARecord.create({
                data: {
                    ticketId: ticket.id,
                    startDate: startDateStr,
                    startTime: startTimeStr,
                    status: 'Safe',
                    compensation: '-',
                    statusReason: ''
                }
            });
            createdAny = true;
        }
    }

    if (createdAny) {
        logger.info('✨ Retroactively provisioned SLA records for older tickets missing them.');
    }

    const slaRecords = await prisma.sLARecord.findMany({
        include: {
            ticket: {
                select: {
                    ticketId: true
                }
            }
        },
        orderBy: {
            startDate: 'desc'
        }
    });

    return slaRecords.map(record => ({
        id: record.id,
        ticketId: record.ticket?.ticketId || 'Unknown',
        startDate: record.startDate,
        displayStartDate: record.startDate,
        startTime: record.startTime,
        closedTime: record.closedTime || '-',
        closeDate: record.closeDate || '-',
        status: record.status, 
        compensation: record.compensation || '-',
        statusReason: record.statusReason || '' 
    }));
};

const getSLARecordByTicketId = async (ticketId) => {
    return await prisma.sLARecord.findUnique({
        where: { ticketId }
    });
};

const createSLARecord = async (data) => {
    return await prisma.sLARecord.create({
        data: {
            ...data,
            status: 'Safe',
            compensation: '-',
            statusReason: ''
        }
    });
};

const updateSLAClosure = async (ticketId, closeDate, closedTime) => {
    const existingRecord = await prisma.sLARecord.findUnique({ where: { ticketId } });
    if (!existingRecord) {
        throw new Error('SLA record not found');
    }

    return await prisma.sLARecord.update({
        where: { ticketId },
        data: { closeDate, closedTime }
    });
};

const updateSLARecordStatus = async (id, status, reason, agentName) => {
    const existingRecord = await prisma.sLARecord.findUnique({ where: { id } });
    if (!existingRecord) {
        throw new Error('SLA record not found');
    }

    const updatedRecord = await prisma.sLARecord.update({
        where: { id },
        data: { 
            status, 
            statusReason: reason, 
            compensation: status === 'Safe' ? '-' : existingRecord.compensation 
        }
    });

    await prisma.activityLog.create({
        data: {
            action: 'sla_status_changed',
            description: `SLA status changed to ${status}. Reason: ${reason}`,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            author: agentName,
            oldValue: existingRecord.status,
            newValue: status,
            fieldName: 'sla_status',
            ticketId: existingRecord.ticketId
        }
    });

    return updatedRecord;
};

module.exports = {
    getAllSLARecords,
    getSLARecordByTicketId,
    createSLARecord,
    updateSLAClosure,
    updateSLARecordStatus
};
