const prisma = require('../models/index');
const logger = require('../utils/logger');

const getAllSLARecords = async ({ search, filter, customStart, customEnd, type } = {}) => {

    let queryWhere = {};
    if (type) {
        // match 'CLIENT' or 'VENDOR' based on SLARecord native type
        queryWhere = {
            type: type.toUpperCase()
        };
    }

    const slaRecords = await prisma.sLARecord.findMany({
        where: queryWhere,
        include: {
            ticket: {
                select: {
                    ticketId: true,
                    circuitId: true,
                    client: { select: { name: true } },
                    vendor: { select: { name: true } }
                }
            }
        },
        orderBy: {
            startDate: 'desc'
        }
    });

    const circuitIdsToFetch = [...new Set(slaRecords.map(r => r.ticket?.circuitId).filter(Boolean))];
    let circuits = [];
    if (circuitIdsToFetch.length > 0) {
        circuits = await prisma.circuit.findMany({
            where: {
                OR: [
                    { customerCircuitId: { in: circuitIdsToFetch } },
                    { supplierCircuitId: { in: circuitIdsToFetch } }
                ]
            },
            include: {
                client: { select: { name: true } },
                vendor: { select: { name: true } }
            }
        });
    }

    const circuitMap = {};
    for (const c of circuits) {
        if (c.customerCircuitId) circuitMap[c.customerCircuitId] = c;
        if (c.supplierCircuitId) circuitMap[c.supplierCircuitId] = c;
    }

    let mapped = slaRecords.map(record => {
        let downtimeStr = '-';
        let parsedStart = null;
        
        if (record.startDate && record.startTime) {
            const cleanStartTime = record.startTime.replace(/hrs/i, '').trim().replace(/^24:/, '00:');
            const startRawStr = `${record.startDate} ${cleanStartTime}`;
            parsedStart = new Date(startRawStr);
            
            if (record.closeDate && record.closedTime) {
                // Remove 'hrs' if present so that new Date() can parse correctly
                const cleanClosedTime = record.closedTime.replace(/hrs/i, '').trim().replace(/^24:/, '00:');
                const endRawStr = `${record.closeDate} ${cleanClosedTime}`;
                const parsedEnd = new Date(endRawStr);
                
                if (!isNaN(parsedStart.getTime()) && !isNaN(parsedEnd.getTime())) {
                    let diffMins = Math.round((parsedEnd.getTime() - parsedStart.getTime()) / 60000);
                    if (diffMins < 0) diffMins = 0;
                    downtimeStr = `${diffMins} mins`;
                }
            }
        }

        const circuit = circuitMap[record.ticket?.circuitId];
        let displayCircuitId = record.ticket?.circuitId || '-';
        
        if (circuit) {
            if (record.type === 'VENDOR' && circuit.supplierCircuitId) {
                displayCircuitId = circuit.supplierCircuitId;
            } else if (record.type === 'CLIENT' && circuit.customerCircuitId) {
                displayCircuitId = circuit.customerCircuitId;
            }
        }

        const clientName = circuit?.client?.name || record.ticket?.client?.name || '-';
        const vendorName = circuit?.vendor?.name || record.ticket?.vendor?.name || '-';

        return {
            id: record.id,
            ticketId: record.ticket?.ticketId || 'Unknown',
            circuitId: displayCircuitId,
            clientName: clientName,
            vendorName: vendorName,
            startDate: record.startDate,
            displayStartDate: record.startDate, // Native format passed safely
            startTime: record.startTime,
            timeZone: record.timeZone || 'UTC',
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

const getSLARecordsByTicketId = async (ticketId) => {
    return await prisma.sLARecord.findMany({
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

const updateSLAClosure = async (id, closeDate, closedTime, oldRecordOverride = null) => {
    const existingRecords = await prisma.sLARecord.findMany({ 
        where: { 
            OR: [
                { id: id },
                { ticketId: id }
            ]
        },
        include: { ticket: { select: { id: true, ticketId: true, circuitId: true } } }
    });

    if (!existingRecords || existingRecords.length === 0) {
        throw new Error('SLA record not found');
    }

    const updatedRecords = [];

    for (const existingRecord of existingRecords) {
        const updated = await prisma.sLARecord.update({
            where: { id: existingRecord.id },
            data: { closeDate, closedTime }
        });

        // ── Auto-trigger compensation engine when closure times are set ──────────
        try {
            const cleanStartTime = (updated.startTime || '').replace(/hrs/i, '').trim().replace(/^24:/, '00:');
            const cleanClosedTime = (updated.closedTime || '').replace(/hrs/i, '').trim().replace(/^24:/, '00:');
            const startStr = `${updated.startDate} ${cleanStartTime}`;
            const endStr   = `${updated.closeDate} ${cleanClosedTime}`;
            const sTime = new Date(startStr);
            const eTime = new Date(endStr);

            if (!isNaN(sTime.getTime()) && !isNaN(eTime.getTime())) {
                let diffMins = Math.round((eTime.getTime() - sTime.getTime()) / 60000);
                if (diffMins < 0) diffMins = 0;
                logger.info(`⏱️ [SLA] ⏱️ [SLA Closure] Downtime for Ticket ${existingRecord.ticket?.ticketId} (${existingRecord.type}): ${diffMins} mins`);

                const oldRecord = (oldRecordOverride && oldRecordOverride.id === existingRecord.id) ? oldRecordOverride : existingRecord;
                let oldDiffMins = 0;
                if (oldRecord.startDate && oldRecord.startTime && oldRecord.closeDate && oldRecord.closeDate !== '-' && oldRecord.closedTime && oldRecord.closedTime !== '-') {
                    const oldCleanStart = (oldRecord.startTime || '').replace(/hrs/i, '').trim().replace(/^24:/, '00:');
                    const oldCleanClosed = (oldRecord.closedTime || '').replace(/hrs/i, '').trim().replace(/^24:/, '00:');
                    const oldStartStr = `${oldRecord.startDate} ${oldCleanStart}`;
                    const oldEndStr = `${oldRecord.closeDate} ${oldCleanClosed}`;
                    const oldSTime = new Date(oldStartStr);
                    const oldETime = new Date(oldEndStr);
                    if (!isNaN(oldSTime.getTime()) && !isNaN(oldETime.getTime())) {
                        oldDiffMins = Math.round((oldETime.getTime() - oldSTime.getTime()) / 60000);
                        if (oldDiffMins < 0) oldDiffMins = 0;
                    }
                }

                const circuitId = existingRecord.ticket?.circuitId;
                if (circuitId && (diffMins > 0 || oldDiffMins > 0 || oldRecord.status === 'Breached')) {
                    const circuit = await prisma.circuit.findFirst({
                        where: {
                            OR: [
                                { customerCircuitId: circuitId },
                                { supplierCircuitId: circuitId }
                            ]
                        },
                        select: { id: true, mrc: true, supplierMrc: true }
                    });

                    if (circuit) {
                        const circuitSlas = await prisma.sla.findMany({ 
                            where: { 
                                circuitId: circuit.id,
                                appliesTo: { in: existingRecord.type === 'CLIENT' ? ['CLIENT', 'CUSTOMER'] : ['VENDOR'] }
                            } 
                        });

                        if (circuitSlas.length > 0) {
                            const slaService = require('./slaService');
                            const now = new Date();
                            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                            const totalUptimeMinutes = daysInMonth * 24 * 60;

                            const deltaMins = diffMins - oldDiffMins;

                            let highestCompensation = 0;
                            let highestStatus = 'SAFE';
                            for (const s of circuitSlas) {
                                const result = await slaService.calculateSla(s.id, deltaMins, totalUptimeMinutes);
                                
                                // Calculate the standalone impact of THIS ticket's downtime (diffMins)
                                const effectiveUptime = Math.max(totalUptimeMinutes - diffMins, 0);
                                const ticketAvailability = (effectiveUptime / totalUptimeMinutes) * 100;

                                const rules = result.rules || [];
                                let matchedRule = rules.find(r => {
                                    const upperOk = r.upperLimit === null || r.upperOperator === null ? true :
                                        (r.upperOperator === '>' ? r.upperLimit > ticketAvailability :
                                         r.upperOperator === '>=' ? r.upperLimit >= ticketAvailability :
                                         r.upperOperator === '<' ? r.upperLimit < ticketAvailability :
                                         r.upperOperator === '<=' ? r.upperLimit <= ticketAvailability : false);
                                    const lowerOk = r.lowerLimit === null || r.lowerOperator === null ? true :
                                        (r.lowerOperator === '>' ? ticketAvailability > r.lowerLimit :
                                         r.lowerOperator === '>=' ? ticketAvailability >= r.lowerLimit :
                                         r.lowerOperator === '<' ? ticketAvailability < r.lowerLimit :
                                         r.lowerOperator === '<=' ? ticketAvailability <= r.lowerLimit : false);
                                    return upperOk && lowerOk;
                                }) || null;

                                if (!matchedRule && rules.length > 0) {
                                    const lowestBoundRule = rules.reduce((min, r) => {
                                        if (r.lowerLimit === null) return min;
                                        if (min.lowerLimit === null) return r;
                                        return r.lowerLimit < min.lowerLimit ? r : min;
                                    }, rules[0]);
                                    if (lowestBoundRule.lowerLimit !== null && ticketAvailability < lowestBoundRule.lowerLimit) {
                                        matchedRule = rules.reduce((max, r) => r.compensationPercentage > max.compensationPercentage ? r : max, rules[0]);
                                    } else {
                                        const rulesAbove = rules.filter(r => r.lowerLimit !== null && r.lowerLimit > ticketAvailability);
                                        if (rulesAbove.length > 0) {
                                            matchedRule = rulesAbove.reduce((closest, r) => r.lowerLimit < closest.lowerLimit ? r : closest);
                                        }
                                    }
                                }

                                const compPct = matchedRule ? matchedRule.compensationPercentage : 0;
                                const status = compPct > 0 ? 'BREACHED' : 'SAFE';

                                if (compPct > highestCompensation) {
                                    highestCompensation = compPct;
                                    highestStatus = status;
                                }
                            }

                            let compensationDisplay = '-';
                            if (highestCompensation > 0) {
                                const baseMrc = existingRecord.type === 'CLIENT' ? (circuit.mrc || 0) : (circuit.supplierMrc || circuit.mrc || 0);
                                const actualValue = (highestCompensation * baseMrc) / 100;
                                compensationDisplay = `$${actualValue.toFixed(2)}`;
                            }
                            const slaStatusDisplay = highestStatus === 'BREACHED' ? 'Breached' : 'Safe';

                            const finalUpdated = await prisma.sLARecord.update({
                                where: { id: existingRecord.id },
                                data: {
                                    compensation: compensationDisplay,
                                    status: slaStatusDisplay,
                                    statusReason: highestCompensation > 0
                                        ? `Circuit SLA breached: ${highestCompensation}% compensation due`
                                        : 'Circuit availability within SLA bounds'
                                }
                            });
                            updatedRecords.push(finalUpdated);
                            logger.info(`⏱️ [SLA] 💾 [SLA Closure] SLARecord ${existingRecord.id} updated — compensation: "${compensationDisplay}", status: "${slaStatusDisplay}"`);
                        } else {
                            logger.warn(`⚠️ ⏱️ [SLA] ⚠️ [SLA Closure] Circuit ${circuit.id} has no active SLAs configured for ${existingRecord.type}.`);
                            updatedRecords.push(updated);
                        }
                    } else {
                        logger.warn(`⚠️ ⏱️ [SLA] ⚠️ [SLA Closure] No circuit found for circuitId: ${circuitId}`);
                        updatedRecords.push(updated);
                    }
                } else {
                    updatedRecords.push(updated);
                }
            } else {
                logger.warn(`⚠️ ⏱️ [SLA] ⚠️ [SLA Closure] Could not parse start/end times for downtime calculation. start="${startStr}" end="${endStr}"`);
                updatedRecords.push(updated);
            }
        } catch (err) {
            logger.error(`🚨 ⏱️ [SLA] ❌ [SLA Closure] Auto-compensation engine failed for ${existingRecord.id}: ${err.message}`);
            updatedRecords.push(updated);
        }
    }

    return updatedRecords[0];
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
    getSLARecordsByTicketId,
    createSLARecord,
    updateSLAClosure,
    updateSLARecordStatus
};
