const slaRecordService = require('../services/slaRecordService');
const logger = require('../utils/logger');

exports.getAllSLARecords = async (req, res) => {
    try {
        const { search, filter, customStart, customEnd } = req.query;
        logger.debug('🐞 ⏱️ [SLA] 📝 Request received: getAllSLARecords');
        const data = await slaRecordService.getAllSLARecords({ search, filter, customStart, customEnd });
        res.status(200).json({ success: true, data });
    } catch (error) {
        logger.error('🚨 ⏱️ [SLA] ❌ Error fetching SLA records:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch SLA records' });
    }
};

exports.exportSLARecords = async (req, res) => {
    try {
        const { search, filter, customStart, customEnd } = req.query;
        logger.debug('🐞 ⏱️ [SLA] 📝 Request received: exportSLARecords');
        const data = await slaRecordService.getAllSLARecords({ search, filter, customStart, customEnd });

        const headers = [
            'Ticket ID',
            'SLA Start Date',
            'SLA Start Time',
            'SLA Closed Time',
            'SLA Close Date',
            'Downtime',
            'SLA Status',
            'Status Reason',
            'Compensation'
        ];

        const rows = data.map(record => [
            record.ticketId,
            record.displayStartDate,
            record.startTime,
            record.closedTime,
            record.closeDate,
            record.downtime,
            record.status,
            record.statusReason || '',
            record.compensation
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="SLA_Report_${new Date().toISOString().split('T')[0]}.csv"`);
        
        res.status(200).send(csvContent);
    } catch (error) {
        logger.error('🚨 ⏱️ [SLA] ❌ Error exporting SLA records:', error);
        res.status(500).json({ success: false, message: 'Failed to export SLA records' });
    }
};

exports.getSLARecordByTicketId = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const record = await slaRecordService.getSLARecordByTicketId(ticketId);

        if (!record) {
            return res.status(404).json({ success: false, message: 'SLA record not found' });
        }

        res.status(200).json({ success: true, data: record });
    } catch (error) {
        logger.error('🚨 ⏱️ [SLA] ❌ Error fetching SLA record by ticket:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch SLA record' });
    }
};

exports.createSLARecord = async (req, res) => {
    try {
        const { id, ticketId, startDate, startTime } = req.body;
        const newRecord = await slaRecordService.createSLARecord({ id, ticketId, startDate, startTime });

        res.status(201).json({ success: true, data: newRecord });
    } catch (error) {
        logger.error('🚨 ⏱️ [SLA] ❌ Error creating SLA record:', error);
        res.status(500).json({ success: false, message: 'Failed to create SLA record' });
    }
};

exports.updateSLAClosure = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { closeDate, closedTime } = req.body;

        const updatedRecord = await slaRecordService.updateSLAClosure(ticketId, closeDate, closedTime);

        res.status(200).json({ success: true, data: updatedRecord });
    } catch (error) {
        logger.error('🚨 ⏱️ [SLA] ❌ Error updating SLA closure:', error);
        if (error.message === 'SLA record not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Failed to update SLA closure' });
    }
};

exports.manualUpdate = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { startDate, startTime, closeDate, closedTime, timeZone } = req.body;
        
        const agentName = req.user ? req.user.name : 'Agent';
        logger.info(`⏱️ [SLA] 🔄 ${agentName} manually updating SLA for ticket ${ticketId}`);
        
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        
        const existing = await prisma.sLARecord.findUnique({ where: { ticketId } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'SLA record not found' });
        }
        
        const updatedRecord = await prisma.sLARecord.update({
            where: { ticketId },
            data: {
                ...(startDate !== undefined && { startDate }),
                ...(startTime !== undefined && { startTime }),
                ...(closeDate !== undefined && { closeDate }),
                ...(closedTime !== undefined && { closedTime }),
                ...(timeZone !== undefined && { timeZone })
            }
        });
        
        res.status(200).json({ success: true, data: updatedRecord });
    } catch (error) {
        logger.error('🚨 ⏱️ [SLA] ❌ Error manually updating SLA:', error);
        res.status(500).json({ success: false, message: 'Failed to manually update SLA' });
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
        logger.info(`⏱️ [SLA] 🔄 ${agentName} updating SLA record ${id} status to ${status}. Reason: ${reason}`);
        
        const updatedRecord = await slaRecordService.updateSLARecordStatus(id, status, reason, agentName);

        res.status(200).json({ success: true, message: 'SLA record updated successfully', data: updatedRecord });
    } catch (error) {
        logger.error('🚨 ⏱️ [SLA] ❌ Error updating SLA record:', error);
        if (error.message === 'SLA record not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Failed to update SLA record' });
    }
};
