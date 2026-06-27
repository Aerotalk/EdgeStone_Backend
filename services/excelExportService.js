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
        { header: 'Downtime (%)', key: 'downtimePct', width: 18 },
        { header: 'Availability (%)', key: 'availability', width: 18 },
        { header: 'Client Comp (%)', key: 'clientCompPct', width: 18 },
        { header: 'Client Penalty ($)', key: 'clientComp', width: 18 },
        { header: 'Vendor Comp (%)', key: 'vendorCompPct', width: 18 },
        { header: 'Vendor Penalty ($)', key: 'vendorComp', width: 18 },
        { header: 'Loss / Profit Delta ($)', key: 'delta', width: 25 },
        { header: 'Circuit SLA Rules', key: 'rulesText', width: 50 },
        { header: 'Calculation Logic', key: 'calc', width: 80 },
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
    dataSheet.autoFilter = 'A1:T1';

    // Group records by Ticket ID to pair VENDOR and CLIENT SLAs
    const groupedByTicket = records.reduce((acc, r) => {
        if (!acc[r.ticketId]) acc[r.ticketId] = [];
        acc[r.ticketId].push(r);
        return acc;
    }, {});

    let totalClientPenaltySum = 0;
    let totalVendorPenaltySum = 0;

    const allRawRecords = await prisma.sLARecord.findMany({
        where: { ticketId: { in: Object.keys(ticketMap).map(k => ticketMap[k].id) } },
        include: { ticket: true }
    });

    const rawRecordsByTicketId = allRawRecords.reduce((acc, r) => {
        if (!acc[r.ticket.ticketId]) acc[r.ticket.ticketId] = { CLIENT: null, VENDOR: null };
        acc[r.ticket.ticketId][r.type] = r;
        return acc;
    }, {});

    // Fetch SLA definitions for rules
    const slas = await prisma.sla.findMany({
        where: { circuitId: { in: circuitIds } },
        include: { rules: { orderBy: { lowerLimit: 'asc' } } }
    });

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
        const availability = parseFloat(((uptimeMins / totalMonthMins) * 100).toFixed(4));
        const downtimePct = parseFloat((100 - availability).toFixed(4));

        let clientCompPct = 0, clientCompUsd = 0;
        let vendorCompPct = 0, vendorCompUsd = 0;

        if (pairs && pairs.CLIENT) {
            const reasonMatch = (pairs.CLIENT.statusReason || '').match(/(\d+)%/);
            clientCompPct = reasonMatch ? parseFloat(reasonMatch[1]) : 0;
            clientCompUsd = parseFloat((pairs.CLIENT.compensation || '0').replace(/[^0-9.]/g, '')) || 0;
            if (slaTypeEnum === 'CLIENT') {
                totalClientPenaltySum += clientCompUsd;
            }
        }
        if (pairs && pairs.VENDOR) {
            const reasonMatch = (pairs.VENDOR.statusReason || '').match(/(\d+)%/);
            vendorCompPct = reasonMatch ? parseFloat(reasonMatch[1]) : 0;
            vendorCompUsd = parseFloat((pairs.VENDOR.compensation || '0').replace(/[^0-9.]/g, '')) || 0;
            if (slaTypeEnum === 'VENDOR') {
                totalVendorPenaltySum += vendorCompUsd;
            }
        }

        const delta = vendorCompUsd - clientCompUsd;
        if (slaTypeEnum === 'CLIENT') {
            totalDelta += delta;
        }

        if (record.status === 'Breached' || record.status === 'BREACHED') {
            breachedCount++;
        }

        const slaTypeEnum = pairs && pairs.CLIENT && pairs.CLIENT.id === record.id ? 'CLIENT' : (pairs && pairs.VENDOR && pairs.VENDOR.id === record.id ? 'VENDOR' : 'UNKNOWN');
        const slaAppliesTo = slaTypeEnum === 'CLIENT' ? 'CUSTOMER' : 'VENDOR';
        
        let rulesText = 'No rules defined';
        const matchedSla = circuit ? slas.find(s => s.circuitId === circuit.id && s.appliesTo === slaAppliesTo) : null;
        if (matchedSla && matchedSla.rules && matchedSla.rules.length > 0) {
            rulesText = matchedSla.rules.map(r => {
                let lim = '';
                if (r.lowerLimit !== null && r.upperLimit !== null) lim = `${r.lowerLimit}%-${r.upperLimit}%`;
                else if (r.lowerLimit !== null) lim = `>${r.lowerLimit}%`;
                else if (r.upperLimit !== null) lim = `<${r.upperLimit}%`;
                return `[${lim}: ${r.compensationPercentage}%]`;
            }).join(' | ');
        }

        let mrcUsed = slaTypeEnum === 'VENDOR' ? (circuit ? circuit.supplierMrc : 0) : (circuit ? circuit.mrc : 0);
        const mrcName = slaTypeEnum === 'VENDOR' ? 'Supplier MRC' : 'Customer MRC';
        let compPctUsed = slaTypeEnum === 'VENDOR' ? vendorCompPct : clientCompPct;
        let compUsdUsed = slaTypeEnum === 'VENDOR' ? vendorCompUsd : clientCompUsd;
        
        let calcText = `MRC (${mrcName}) = $${mrcUsed || 0} | Downtime = ${downtimeMins}m | Avail = ${availability}% | `;
        if (compPctUsed > 0) {
            calcText += `Rule Hit -> ${compPctUsed}% Penalty | Payout = $${compUsdUsed.toFixed(2)}`;
        } else {
            calcText += `Rule Hit -> Safe | Payout = $0.00`;
        }

        const row = dataSheet.addRow({
            ticketId: record.ticketId,
            type: slaTypeEnum,
            customerCircuitId,
            vendorCircuitId,
            startDate: `${record.startDate} ${record.startTime}`,
            closeDate: record.closeDate ? `${record.closeDate} ${record.closedTime}` : 'Open',
            totalMins: totalMonthMins,
            downtime: downtimeMins,
            uptime: uptimeMins,
            downtimePct: downtimePct,
            availability: availability,
            clientCompPct: clientCompPct,
            clientComp: clientCompUsd,
            vendorCompPct: vendorCompPct,
            vendorComp: vendorCompUsd,
            delta: delta,
            rulesText: rulesText,
            calc: calcText,
            reason: record.statusReason || 'Safe',
            status: record.status,
        });

        row.height = 25; // Give rows some breathing room

        // Apply borders, alignment, and alternating background colors to all cells
        const isBreached = record.status === 'Breached' || record.status === 'BREACHED';
        
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.font = { size: 11, name: 'Calibri', color: { argb: 'FF111827' } };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };

            // Color code entire row based on status
            if (isBreached) {
                // Light Red background for breached
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                // Keep font standard but let's make it dark red for the status cell later
            } else {
                // Light Green background for safe
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
            }
        });

        // Add conditional formatting specifically for delta (Column P is 16)
        const deltaCell = row.getCell(16);
        if (delta > 0) {
            deltaCell.font = { color: { argb: 'FF10B981' }, bold: true }; // Green
        } else if (delta < 0) {
            deltaCell.font = { color: { argb: 'FFEF4444' }, bold: true }; // Red
        }

        // Add bold formatting for Status (Column T is 20)
        const statusCell = row.getCell(20);
        statusCell.font = Object.assign({}, statusCell.font, { bold: true, color: isBreached ? { argb: 'FF991B1B' } : { argb: 'FF065F46' } });
    }

    // Apply Data Bars to Delta column (P is 16)
    if (records.length > 0) {
        dataSheet.addConditionalFormatting({
            ref: `P2:P${records.length + 1}`,
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
    dashboardSheet.getCell('C9').font = { size: 16, bold: true, color: { argb: breachedCount > 0 ? 'FFEF4444' : 'FF10B981' }, name: 'Calibri' };

    styleCardRow(11);
    dashboardSheet.getCell('B11').value = 'Overall Delta (Net Profit/Loss % Points):';
    dashboardSheet.getCell('C11').value = totalDelta + '%';
    dashboardSheet.getCell('C11').font = { size: 16, bold: true, color: { argb: totalDelta >= 0 ? 'FF10B981' : 'FFEF4444' }, name: 'Calibri' };

    // Financial Data Points section
    dashboardSheet.getCell('B14').value = 'Financial Profit / Loss Analysis';
    dashboardSheet.getCell('B14').font = { size: 18, bold: true, color: { argb: 'FF1F2937' }, name: 'Calibri' };
    
    styleCardRow(16);
    dashboardSheet.getCell('B16').value = 'Total Client Compensation Paid:';
    dashboardSheet.getCell('C16').value = `$${totalClientPenaltySum.toFixed(2)}`;
    dashboardSheet.getCell('C16').font = { size: 16, bold: true, color: { argb: 'FFEF4444' }, name: 'Calibri' }; // Red for paid

    styleCardRow(18);
    dashboardSheet.getCell('B18').value = 'Total Vendor Compensation Recv:';
    dashboardSheet.getCell('C18').value = `$${totalVendorPenaltySum.toFixed(2)}`;
    dashboardSheet.getCell('C18').font = { size: 16, bold: true, color: { argb: 'FF10B981' }, name: 'Calibri' }; // Green for received
    
    styleCardRow(20);
    const netFinancials = totalVendorPenaltySum - totalClientPenaltySum;
    dashboardSheet.getCell('B20').value = 'Net Financial Profit / Loss:';
    dashboardSheet.getCell('C20').value = `$${netFinancials.toFixed(2)}`;
    dashboardSheet.getCell('C20').font = { size: 18, bold: true, color: { argb: netFinancials >= 0 ? 'FF10B981' : 'FFEF4444' }, name: 'Calibri' };
    dashboardSheet.getCell('C20').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: netFinancials >= 0 ? 'FFD1FAE5' : 'FFFEE2E2' } };

    // Visual Data Points: Data bar chart in the cells for Top Breached tickets
    dashboardSheet.getCell('B23').value = 'Data Points: Highest Value Circuit Breaches';
    dashboardSheet.getCell('B23').font = { size: 14, bold: true, color: { argb: 'FF1F2937' }, name: 'Calibri' };

    // Fetch and sort breached tickets by highest client penalty
    const breachedData = records.filter(r => r.status === 'Breached' || r.status === 'BREACHED').map(r => {
        const pairs = rawRecordsByTicketId[r.ticketId];
        const clientVal = pairs && pairs.CLIENT ? parseFloat((pairs.CLIENT.compensation || '0').replace(/[^0-9.]/g, '')) || 0 : 0;
        return { ticketId: r.ticketId, val: clientVal, ticketObj: ticketMap[r.ticketId] };
    }).sort((a, b) => b.val - a.val).slice(0, 5);

    dashboardSheet.getCell('B25').value = 'Ticket / Circuit ID';
    dashboardSheet.getCell('C25').value = 'Client Penalty ($)';
    dashboardSheet.getCell('B25').font = { bold: true };
    dashboardSheet.getCell('C25').font = { bold: true };
    dashboardSheet.getCell('B25').border = { bottom: { style: 'thin' } };
    dashboardSheet.getCell('C25').border = { bottom: { style: 'thin' } };

    let startRow = 26;
    if (breachedData.length === 0) {
        dashboardSheet.getCell(`B${startRow}`).value = 'No breaches recorded this period.';
    } else {
        breachedData.forEach(d => {
            const cid = d.ticketObj ? d.ticketObj.circuitId : 'Unknown Circuit';
            dashboardSheet.getCell(`B${startRow}`).value = `Ticket ${d.ticketId} (${cid})`;
            dashboardSheet.getCell(`C${startRow}`).value = d.val;
            
            // Format as currency
            dashboardSheet.getCell(`C${startRow}`).numFmt = '"$"#,##0.00';
            dashboardSheet.getCell(`C${startRow}`).font = { color: { argb: 'FFEF4444' } };
            
            // Add light border
            dashboardSheet.getCell(`B${startRow}`).border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
            dashboardSheet.getCell(`C${startRow}`).border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
            startRow++;
        });
        
        // Add native exceljs databars to the top 5
        dashboardSheet.addConditionalFormatting({
            ref: `C26:C${startRow - 1}`,
            rules: [
                {
                    type: 'dataBar',
                    cfvo: [{ type: 'min' }, { type: 'max' }],
                    color: { argb: 'FFEF4444' }, // Red data bars
                    gradient: true
                }
            ]
        });
    }

    return workbook;
};
