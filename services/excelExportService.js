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
    
    // Set column widths
    dashboardSheet.columns = [
        { header: '', key: 'colA', width: 5 },  // padding
        { header: '', key: 'colB', width: 45 },
        { header: '', key: 'colC', width: 30 },
        { header: '', key: 'colD', width: 5 }   // padding
    ];

    // Title
    dashboardSheet.mergeCells('B2:C3');
    const titleCell = dashboardSheet.getCell('B2');
    titleCell.value = 'SLA Financial & Performance Dashboard';
    titleCell.font = { size: 22, bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Deep Blue
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    
    // Function to style a "Card" row
    const styleCardRow = (rowNum) => {
        dashboardSheet.getRow(rowNum).height = 40;
        
        const labelCell = dashboardSheet.getCell(`B${rowNum}`);
        labelCell.font = { size: 14, bold: true, color: { argb: 'FF374151' }, name: 'Calibri' }; // Gray 700
        labelCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        labelCell.border = { left: { style: 'medium', color: { argb: 'FFD1D5DB' } }, top: { style: 'medium', color: { argb: 'FFD1D5DB' } }, bottom: { style: 'medium', color: { argb: 'FFD1D5DB' } } };
        labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; // Gray 100

        const valueCell = dashboardSheet.getCell(`C${rowNum}`);
        valueCell.font = { size: 16, bold: true, color: { argb: 'FF111827' }, name: 'Calibri' };
        valueCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
        valueCell.border = { right: { style: 'medium', color: { argb: 'FFD1D5DB' } }, top: { style: 'medium', color: { argb: 'FFD1D5DB' } }, bottom: { style: 'medium', color: { argb: 'FFD1D5DB' } } };
        valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; // White
    };

    // Card 1: Total Tickets
    styleCardRow(5);
    dashboardSheet.getCell('B5').value = 'Total Tickets Analyzed:';
    dashboardSheet.getCell('C5').value = records.length;
    
    // Card 2: Generation Date
    styleCardRow(7);
    dashboardSheet.getCell('B7').value = 'Report Generated At:';
    dashboardSheet.getCell('C7').value = new Date().toLocaleString();

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
        { header: 'Total Month (Mins)', key: 'totalMins', width: 20 },
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
    const headerRow = dataSheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12, name: 'Calibri' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }; // Deep Slate 800
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            top: { style: 'medium', color: { argb: 'FF4B5563' } },
            left: { style: 'thin', color: { argb: 'FF4B5563' } },
            bottom: { style: 'medium', color: { argb: 'FF4B5563' } },
            right: { style: 'thin', color: { argb: 'FF4B5563' } }
        };
    });
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

    // SORT RECORDS: Professional SLA reports should be strictly sorted by Ticket ID (Descending)
    records.sort((a, b) => {
        const idA = parseInt(a.ticketId.replace(/[^0-9]/g, ''), 10) || 0;
        const idB = parseInt(b.ticketId.replace(/[^0-9]/g, ''), 10) || 0;
        return idB - idA;
    });

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
            const reasonMatch = (pairs.CLIENT.statusReason || '').match(/(\d+)%/);
            clientComp = reasonMatch ? parseFloat(reasonMatch[1]) : (parseFloat((pairs.CLIENT.compensation || '0').replace(/[^0-9.]/g, '')) || 0);
        }
        if (pairs && pairs.VENDOR) {
            const reasonMatch = (pairs.VENDOR.statusReason || '').match(/(\d+)%/);
            vendorComp = reasonMatch ? parseFloat(reasonMatch[1]) : (parseFloat((pairs.VENDOR.compensation || '0').replace(/[^0-9.]/g, '')) || 0);
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
            totalMins: totalMonthMins,
            downtime: downtimeMins,
            uptime: uptimeMins,
            availability: parseFloat(availability),
            clientComp: clientComp,
            vendorComp: vendorComp,
            delta: delta,
            reason: record.statusReason || 'Safe',
            status: record.status,
        });

        row.height = 25; // Give rows some breathing room

        // Apply borders, alignment, and alternating background colors to all cells
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.font = { size: 11, name: 'Calibri', color: { argb: 'FF111827' } };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };

            // Alternating row colors (Zebra Striping)
            if (row.number % 2 === 0) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }; // Light Gray
            } else {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; // White
            }
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

    // Populate Dashboard Data using the new card styling
    styleCardRow(9);
    dashboardSheet.getCell('B9').value = 'Total SLA Breaches:';
    dashboardSheet.getCell('C9').value = breachedCount;
    dashboardSheet.getCell('C9').font = { size: 16, bold: true, color: { argb: breachedCount > 0 ? 'FFEF4444' : 'FF10B981' }, name: 'Calibri' }; // Red if > 0, else Green

    styleCardRow(11);
    dashboardSheet.getCell('B11').value = 'Overall Delta (Net Profit/Loss % Points):';
    dashboardSheet.getCell('C11').value = totalDelta;
    dashboardSheet.getCell('C11').font = { size: 16, bold: true, color: { argb: totalDelta >= 0 ? 'FF10B981' : 'FFEF4444' }, name: 'Calibri' };

    return workbook;
};
