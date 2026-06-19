const exceljs = require('exceljs');
const prisma = require('../models/index');
const logger = require('../utils/logger');

/**
 * Generate a rich, mathematical Excel report containing all SLA financial data.
 */
exports.generateRichSLAExcel = async ({ search, filter, customStart, customEnd, type }) => {
    // 1. Fetch SLARecords similar to getAllSLARecords
    const slaRecordsService = require('./slaRecordService');
    const records = await slaRecordsService.getAllSLARecords({ search, filter, customStart, customEnd, type });

    // 2. Fetch full Ticket and Circuit data to merge
    const ticketIds = records.map(r => r.ticketId).filter(Boolean);
    const tickets = await prisma.ticket.findMany({
        where: { ticketId: { in: ticketIds } },
        include: { client: true, vendor: true }
    });
    const ticketMap = tickets.reduce((acc, t) => { acc[t.ticketId] = t; return acc; }, {});

    const circuitIds = tickets.map(t => t.circuitId).filter(Boolean);
    const circuits = await prisma.circuit.findMany({
        where: { id: { in: circuitIds } }
    });
    const circuitMap = circuits.reduce((acc, c) => { acc[c.id] = c; return acc; }, {});

    // 3. Initialize Workbook
    const workbook = new exceljs.Workbook();
    workbook.creator = 'EdgeStone SLA Engine';
    workbook.lastModifiedBy = 'EdgeStone System';
    workbook.created = new Date();
    workbook.modified = new Date();

    // --- Sheet 1: Dashboard ---
    const dashboardSheet = workbook.addWorksheet('Financial Dashboard', { views: [{ showGridLines: false }] });
    
    // Title
    dashboardSheet.getCell('B2').value = 'SLA Financial & Performance Dashboard';
    dashboardSheet.getCell('B2').font = { size: 20, bold: true, color: { argb: 'FF1F2937' } };
    
    // Dashboard Stats placeholders
    dashboardSheet.getCell('B4').value = 'Total Tickets Analyzed:';
    dashboardSheet.getCell('C4').value = records.length;
    
    dashboardSheet.getCell('B5').value = 'Report Generated At:';
    dashboardSheet.getCell('C5').value = new Date().toLocaleString();

    // We will use Data Bars via Conditional Formatting for Profits/Losses
    // But first, let's prepare the Detailed Data sheet
    
    // --- Sheet 2: Detailed Data ---
    const dataSheet = workbook.addWorksheet('Detailed SLA Data');
    
    dataSheet.columns = [
        { header: 'Ticket ID', key: 'ticketId', width: 15 },
        { header: 'SLA Type', key: 'type', width: 12 },
        { header: 'Customer Circuit ID', key: 'customerCircuitId', width: 25 },
        { header: 'Vendor Circuit ID', key: 'vendorCircuitId', width: 25 },
        { header: 'Start Date', key: 'startDate', width: 18 },
        { header: 'Close Date', key: 'closeDate', width: 18 },
        { header: 'Downtime (Mins)', key: 'downtime', width: 18 },
        { header: 'Uptime (Mins)', key: 'uptime', width: 18 },
        { header: 'Availability (%)', key: 'availability', width: 18 },
        { header: 'Client Compensation %', key: 'clientComp', width: 22 },
        { header: 'Vendor Compensation %', key: 'vendorComp', width: 22 },
        { header: 'Loss / Profit Delta %', key: 'delta', width: 22 },
        { header: 'Rule Hit / Reason', key: 'reason', width: 35 },
        { header: 'Status', key: 'status', width: 15 },
    ];

    // Style the header row
    dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    dataSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }; // Dark Gray
    dataSheet.autoFilter = 'A1:N1';

    // Group records by Ticket ID to pair VENDOR and CLIENT SLAs
    const groupedByTicket = records.reduce((acc, r) => {
        if (!acc[r.ticketId]) acc[r.ticketId] = [];
        acc[r.ticketId].push(r);
        return acc;
    }, {});

    let totalClientPenaltySum = 0;
    let totalVendorPenaltySum = 0;

    for (const [tId, tRecords] of Object.entries(groupedByTicket)) {
        const ticket = ticketMap[tId];
        const circuit = ticket ? circuitMap[ticket.circuitId] : null;

        const customerCircuitId = circuit ? circuit.customerCircuitId : 'N/A';
        const vendorCircuitId = circuit ? (circuit.supplierCircuitId || 'N/A') : 'N/A';

        // Find Client and Vendor specific records
        // Note: the `slaRecordsService.getAllSLARecords` doesn't expose the `type` in the mapped object directly unless we add it!
        // We'll need to re-fetch the raw records or just guess from the overall DB
        // Let's fetch raw SLARecords for these tickets to get the exact `type`
    }

    // ACTUALLY, let's just query SLARecords directly here to have full control over data shape
    const allRawRecords = await prisma.sLARecord.findMany({
        where: { ticketId: { in: Object.keys(ticketMap).map(k => ticketMap[k].id) } },
        include: { ticket: true }
    });

    const rawRecordsByTicketId = allRawRecords.reduce((acc, r) => {
        if (!acc[r.ticket.ticketId]) acc[r.ticket.ticketId] = { CLIENT: null, VENDOR: null };
        acc[r.ticket.ticketId][r.type] = r;
        return acc;
    }, {});

    let totalDelta = 0;
    let breachedCount = 0;

    for (const record of records) {
        // Find the raw paired data
        const pairs = rawRecordsByTicketId[record.ticketId];
        const ticket = ticketMap[record.ticketId];
        const circuit = ticket ? circuitMap[ticket.circuitId] : null;

        const customerCircuitId = circuit ? circuit.customerCircuitId : 'N/A';
        const vendorCircuitId = circuit ? (circuit.supplierCircuitId || 'N/A') : 'N/A';

        // Calculate Availability & Uptime
        // Default assuming 30 days total uptime for the month if not provided
        let downtimeMins = 0;
        if (record.downtime && record.downtime !== '-') {
            downtimeMins = parseInt(record.downtime.replace(' mins', '')) || 0;
        }

        const totalMonthMins = 43200; // 30 days
        const uptimeMins = Math.max(totalMonthMins - downtimeMins, 0);
        const availability = ((uptimeMins / totalMonthMins) * 100).toFixed(4);

        let clientComp = 0;
        let vendorComp = 0;

        if (pairs && pairs.CLIENT) {
            clientComp = parseFloat((pairs.CLIENT.compensation || '0').replace('%', '')) || 0;
        }
        if (pairs && pairs.VENDOR) {
            vendorComp = parseFloat((pairs.VENDOR.compensation || '0').replace('%', '')) || 0;
        }

        // Logic: If Vendor compensates us 60%, and we compensate Client 30%, we have a +30% profit delta.
        const delta = vendorComp - clientComp;
        totalDelta += delta;

        if (record.status === 'Breached' || record.status === 'BREACHED') {
            breachedCount++;
        }

        const row = dataSheet.addRow({
            ticketId: record.ticketId,
            type: pairs && pairs.CLIENT && pairs.CLIENT.id === record.id ? 'CLIENT' : (pairs && pairs.VENDOR && pairs.VENDOR.id === record.id ? 'VENDOR' : 'UNKNOWN'),
            customerCircuitId,
            vendorCircuitId,
            startDate: `${record.startDate} ${record.startTime}`,
            closeDate: record.closeDate ? `${record.closeDate} ${record.closedTime}` : 'Open',
            downtime: downtimeMins,
            uptime: uptimeMins,
            availability: parseFloat(availability),
            clientComp: clientComp,
            vendorComp: vendorComp,
            delta: delta,
            reason: record.statusReason || 'Safe',
            status: record.status,
        });

        // Add conditional formatting specifically for delta
        const deltaCell = row.getCell('L');
        if (delta > 0) {
            deltaCell.font = { color: { argb: 'FF10B981' }, bold: true }; // Green
        } else if (delta < 0) {
            deltaCell.font = { color: { argb: 'FFEF4444' }, bold: true }; // Red
        }
    }

    // Apply Data Bars to Delta column (L)
    if (records.length > 0) {
        dataSheet.addConditionalFormatting({
            ref: `L2:L${records.length + 1}`,
            rules: [
                {
                    type: 'dataBar',
                    cfvo: [{ type: 'min' }, { type: 'max' }],
                    color: { argb: 'FF3B82F6' }, // Blue data bars
                    gradient: true
                }
            ]
        });
    }

    // Populate Dashboard Data
    dashboardSheet.getCell('B7').value = 'Total SLA Breaches:';
    dashboardSheet.getCell('C7').value = breachedCount;

    dashboardSheet.getCell('B8').value = 'Overall Delta (Net Profit/Loss % Points):';
    dashboardSheet.getCell('C8').value = totalDelta;
    dashboardSheet.getCell('C8').font = { bold: true, color: { argb: totalDelta >= 0 ? 'FF10B981' : 'FFEF4444' } };

    return workbook;
};
