'use strict';

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

// ── Shared include block ──────────────────────────────────────────────────────
const CIRCUIT_INCLUDE = {
    vendor: { select: { id: true, name: true, status: true } },
    client: { select: { id: true, name: true, status: true } },
};

// ── Shared serialiser ─────────────────────────────────────────────────────────
const serialize = (circuit) => ({
    id:                   circuit.id,
    type:                 circuit.type,
    customerCircuitId:    circuit.customerCircuitId,
    supplierCircuitId:    circuit.supplierCircuitId,
    poNumber:             circuit.poNumber,
    serviceDescription:   circuit.serviceDescription,
    contractTermMonths:   circuit.contractTermMonths,
    contractType:         circuit.contractType,
    mrc:                  circuit.mrc,
    supplierPoNumber:     circuit.supplierPoNumber,
    supplierServiceDescription: circuit.supplierServiceDescription,
    supplierContractTermMonths: circuit.supplierContractTermMonths,
    supplierContractType: circuit.supplierContractType,
    billingStartDate:     circuit.billingStartDate,
    supplierMrc:          circuit.supplierMrc,
    clientId:             circuit.clientId,
    vendorId:             circuit.vendorId,
    vendor:               circuit.vendor,
    client:               circuit.client,
});

// ── GET /api/circuits ─────────────────────────────────────────────────────────
const getCircuits = async (req, res, next) => {
    try {
        logger.debug('📝 Request received: getCircuits');
        const circuits = await prisma.circuit.findMany({
            include: CIRCUIT_INCLUDE,
            orderBy: { createdAt: 'desc' },
        });
        logger.info(`✅ Successfully fetched ${circuits.length} circuits`);
        res.status(200).json({ success: true, data: circuits.map(serialize) });
    } catch (error) {
        logger.error(`❌ Error fetching circuits: ${error.message}`, { stack: error.stack });
        next(error);
    }
};

// ── POST /api/circuits ────────────────────────────────────────────────────────
const createCircuit = async (req, res, next) => {
    try {
        logger.debug('📝 Request received: createCircuit');

        const {
            customerCircuitId,
            supplierCircuitId,
            type = 'UNPROTECTED',
            vendorId,
            clientId,
            // optional detail fields
            poNumber,
            serviceDescription,
            contractTermMonths,
            contractType,
            mrc,
            supplierPoNumber,
            supplierServiceDescription,
            supplierContractTermMonths,
            supplierContractType,
            billingStartDate,
            supplierMrc,
        } = req.body;

        if (!customerCircuitId || !customerCircuitId.trim()) {
            return res.status(400).json({ success: false, message: 'customerCircuitId is required.' });
        }

        // supplierCircuitId must be unique — auto-generate if not provided
        const resolvedSupplierCircuitId = supplierCircuitId?.trim()
            || `SUP-${customerCircuitId.trim()}-${Date.now()}`;

        // Check for duplicate customerCircuitId
        const existing = await prisma.circuit.findUnique({
            where: { customerCircuitId: customerCircuitId.trim() },
        });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: `Circuit with ID "${customerCircuitId.trim()}" already exists.`,
            });
        }

        const circuit = await prisma.circuit.create({
            data: {
                customerCircuitId:          customerCircuitId.trim(),
                supplierCircuitId:          resolvedSupplierCircuitId,
                type:                       ['PROTECTED', 'UNPROTECTED'].includes(type) ? type : 'UNPROTECTED',
                vendorId:                   vendorId   || null,
                clientId:                   clientId   || null,
                poNumber:                   poNumber   || null,
                serviceDescription:         serviceDescription || null,
                contractTermMonths:         contractTermMonths ? Number(contractTermMonths) : null,
                contractType:               contractType || null,
                mrc:                        mrc != null ? Number(mrc) : 1000,
                supplierPoNumber:           supplierPoNumber || null,
                supplierServiceDescription: supplierServiceDescription || null,
                supplierContractTermMonths: supplierContractTermMonths ? Number(supplierContractTermMonths) : null,
                supplierContractType:       supplierContractType || null,
                billingStartDate:           billingStartDate || null,
                supplierMrc:                supplierMrc != null ? Number(supplierMrc) : 800,
            },
            include: CIRCUIT_INCLUDE,
        });

        logger.info(`✅ Circuit created: ${circuit.customerCircuitId} (id: ${circuit.id})`);
        res.status(201).json({ success: true, data: serialize(circuit) });
    } catch (error) {
        logger.error(`❌ Error creating circuit: ${error.message}`, { stack: error.stack });
        next(error);
    }
};

// ── PUT /api/circuits/:id ─────────────────────────────────────────────────────
const updateCircuit = async (req, res, next) => {
    try {
        const { id } = req.params;
        logger.debug(`📝 Request received: updateCircuit (id: ${id})`);

        const existing = await prisma.circuit.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: `Circuit not found: ${id}` });
        }

        const {
            customerCircuitId,
            supplierCircuitId,
            type,
            vendorId,
            clientId,
            poNumber,
            serviceDescription,
            contractTermMonths,
            contractType,
            mrc,
            supplierPoNumber,
            supplierServiceDescription,
            supplierContractTermMonths,
            supplierContractType,
            billingStartDate,
            supplierMrc,
        } = req.body;

        // Check duplicate customerCircuitId only if it's changing
        if (customerCircuitId && customerCircuitId.trim() !== existing.customerCircuitId) {
            const conflict = await prisma.circuit.findUnique({
                where: { customerCircuitId: customerCircuitId.trim() },
            });
            if (conflict) {
                return res.status(409).json({
                    success: false,
                    message: `Circuit ID "${customerCircuitId.trim()}" is already in use.`,
                });
            }
        }

        const updated = await prisma.circuit.update({
            where: { id },
            data: {
                ...(customerCircuitId    != null && { customerCircuitId:          customerCircuitId.trim() }),
                ...(supplierCircuitId    != null && { supplierCircuitId:          supplierCircuitId.trim() }),
                ...(type                != null && { type:                        type }),
                ...(vendorId            !== undefined && { vendorId:              vendorId   || null }),
                ...(clientId            !== undefined && { clientId:              clientId   || null }),
                ...(poNumber            !== undefined && { poNumber:              poNumber   || null }),
                ...(serviceDescription  !== undefined && { serviceDescription:    serviceDescription || null }),
                ...(contractTermMonths  !== undefined && { contractTermMonths:    contractTermMonths != null ? Number(contractTermMonths) : null }),
                ...(contractType        !== undefined && { contractType:          contractType || null }),
                ...(mrc                 !== undefined && { mrc:                   mrc != null ? Number(mrc) : existing.mrc }),
                ...(supplierPoNumber    !== undefined && { supplierPoNumber:      supplierPoNumber || null }),
                ...(supplierServiceDescription !== undefined && { supplierServiceDescription: supplierServiceDescription || null }),
                ...(supplierContractTermMonths !== undefined && { supplierContractTermMonths: supplierContractTermMonths != null ? Number(supplierContractTermMonths) : null }),
                ...(supplierContractType !== undefined && { supplierContractType: supplierContractType || null }),
                ...(billingStartDate    !== undefined && { billingStartDate:      billingStartDate || null }),
                ...(supplierMrc         !== undefined && { supplierMrc:           supplierMrc != null ? Number(supplierMrc) : existing.supplierMrc }),
            },
            include: CIRCUIT_INCLUDE,
        });

        logger.info(`✅ Circuit updated: ${updated.customerCircuitId} (id: ${updated.id})`);
        res.status(200).json({ success: true, data: serialize(updated) });
    } catch (error) {
        logger.error(`❌ Error updating circuit: ${error.message}`, { stack: error.stack });
        next(error);
    }
};

module.exports = { getCircuits, createCircuit, updateCircuit };
