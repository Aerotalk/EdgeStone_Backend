const prisma = require('../models/index');
const logger = require('../utils/logger');

const getAllSLARecords = async ({ search, filter, customStart, customEnd } = {}) => {
    // --- BACKFILL: Ensure EVERY ticket has a corresponding SLA record ---
    const allTickets = await prisma.ticket.findMany();
    const existingRecords = await prisma.sLARecord.findMany();
    const existingTicketIds = new Set(existingRecords.map(r => r.ticketId));

    let createdAny = false;
    for (const ticket of allTickets) {
        if (!existingTicketIds.has(ticket.id)) {
            const baseTime = new Date(ticket.receivedAt || ticket.createdAt || new Date());
            const slaStart = new Date(baseTime.getTime() + 60000); 

            const startDateStr = slaStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
            const startTimeStr = slaStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });

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

    let mapped = slaRecords.map(record => {
        let downtimeStr = '-';
        let parsedStart = null;
        
        if (record.startDate && record.startTime) {
            const startRawStr = `${record.startDate} ${record.startTime}`;
            parsedStart = new Date(startRawStr);
            
            if (record.closeDate && record.closedTime) {
                const endRawStr = `${record.closeDate} ${record.closedTime}`;
                const parsedEnd = new Date(endRawStr);
                
                if (!isNaN(parsedStart.getTime()) && !isNaN(parsedEnd.getTime())) {
                    const diffMins = Math.round((parsedEnd.getTime() - parsedStart.getTime()) / 60000);
                    downtimeStr = `${diffMins} mins`;
                }
            }
        }

        return {
            id: record.id,
            ticketId: record.ticket?.ticketId || 'Unknown',
            startDate: record.startDate,
            displayStartDate: record.startDate, // Native format passed safely
            startTime: record.startTime,
            closedTime: record.closedTime || '-',
            closeDate: record.closeDate || '-',
            status: record.status, 
            compensation: record.compensation || '-',
            statusReason: record.statusReason || '',
            downtime: downtimeStr,
            _parsedStart: parsedStart // internal use for filtering
        };
    });

    // Filtering logic translated from UI to Backend
    if (search) {
        const s = search.toLowerCase();
        mapped = mapped.filter(r => r.ticketId.toLowerCase().includes(s));
    }

    if (filter && filter !== 'all') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        mapped = mapped.filter(item => {
            if (!item._parsedStart || isNaN(item._parsedStart.getTime())) return true;
            
            const itemDate = new Date(item._parsedStart);
            itemDate.setHours(0, 0, 0, 0);

            if (filter === 'today') {
                return itemDate.getTime() === today.getTime();
            }

            if (filter === 'yesterday') {
                const yesterday = new Date(today);
                yesterday.setDate(today.getDate() - 1);
                return itemDate.getTime() === yesterday.getTime();
            }

            if (filter === 'last7') {
                const sevenDaysAgo = new Date(today);
                sevenDaysAgo.setDate(today.getDate() - 7);
                return itemDate >= sevenDaysAgo && itemDate <= today;
            }

            if (filter === 'custom' && customStart && customEnd) {
                const start = new Date(customStart);
                start.setHours(0, 0, 0, 0);
                const end = new Date(customEnd);
                end.setHours(23, 59, 59, 999);
                return itemDate >= start && itemDate <= end;
            }

            return true;
        });
    }

    // Cleanup internal keys
    mapped.forEach(m => delete m._parsedStart);

    return mapped;
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
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }),
            date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
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
