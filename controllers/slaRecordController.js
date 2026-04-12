const SLARecordModel = require('../models/slaRecord');
const logger = require('../utils/logger');
const prisma = require('../models/index');

exports.getAllSLARecords = async (req, res) => {
    try {
        logger.debug('📝 Request received: getAllSLARecords');
        
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

        // Format to match frontend structure
        const formattedRecords = slaRecords.map(record => ({
            id: record.id,
            ticketId: record.ticket?.ticketId || 'Unknown',
            startDate: record.startDate,
            displayStartDate: record.startDate,  // Frontend expects this
            startTime: record.startTime,
            closedTime: record.closedTime || '-',
            closeDate: record.closeDate || '-',
            status: record.status, // 'Breached' | 'Safe'
            compensation: record.compensation || '-',
            statusReason: record.statusReason || '' 
        }));

        res.status(200).json({ success: true, data: formattedRecords });
    } catch (error) {
        logger.error('❌ Error fetching SLA records:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch SLA records' });
    }
};

exports.getSLARecordByTicketId = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const record = await prisma.sLARecord.findUnique({
            where: { ticketId }
        });

        if (!record) {
            return res.status(404).json({ success: false, message: 'SLA record not found' });
        }

        res.status(200).json({ success: true, data: record });
    } catch (error) {
        logger.error('❌ Error fetching SLA record by ticket:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch SLA record' });
    }
};

exports.createSLARecord = async (req, res) => {
    try {
        const { id, ticketId, startDate, startTime } = req.body;

        const newRecord = await prisma.sLARecord.create({
            data: {
                id,
                ticketId,
                startDate,
                startTime,
                status: 'Safe',
                compensation: '-',
                statusReason: ''
            }
        });

        res.status(201).json({ success: true, data: newRecord });
    } catch (error) {
        logger.error('❌ Error creating SLA record:', error);
        res.status(500).json({ success: false, message: 'Failed to create SLA record' });
    }
};

exports.updateSLAClosure = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { closeDate, closedTime } = req.body;

        const existingRecord = await prisma.sLARecord.findUnique({ where: { ticketId } });
        if (!existingRecord) {
            return res.status(404).json({ success: false, message: 'SLA record not found' });
        }

        const updatedRecord = await prisma.sLARecord.update({
            where: { ticketId },
            data: { closeDate, closedTime }
        });

        res.status(200).json({ success: true, data: updatedRecord });
    } catch (error) {
        logger.error('❌ Error updating SLA closure:', error);
        res.status(500).json({ success: false, message: 'Failed to update SLA closure' });
    }
};

exports.updateSLARecordStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;

        if (!status || !['Breached', 'Safe'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        if (!reason) {
            return res.status(400).json({ success: false, message: 'Reason is required for status change' });
        }

        const agentName = req.user ? req.user.name : 'Agent';
        logger.info(`🔄 ${agentName} updating SLA record ${id} status to ${status}. Reason: ${reason}`);
        
        const existingRecord = await prisma.sLARecord.findUnique({ where: { id } });
        if (!existingRecord) {
            return res.status(404).json({ success: false, message: 'SLA record not found' });
        }

        const updatedRecord = await prisma.sLARecord.update({
            where: { id },
            data: { status, statusReason: reason, compensation: status === 'Safe' ? '-' : existingRecord.compensation }
        });

        // Log the change into the ActivityLog
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

        res.status(200).json({ success: true, message: 'SLA record updated successfully', data: updatedRecord });
    } catch (error) {
        logger.error('❌ Error updating SLA record:', error);
        res.status(500).json({ success: false, message: 'Failed to update SLA record' });
    }
};
