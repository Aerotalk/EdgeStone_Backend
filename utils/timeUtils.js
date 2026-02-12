/**
 * Utility functions for Indian Standard Time (IST)
 */

const getISTDate = () => {
    const now = new Date();
    return new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
};

const getISTString = () => {
    return new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).replace(',', '');
    // Format: DD/MM/YYYY HH:mm:ss
};

const getISTISOString = () => {
    // Manually construct ISO-like string for IST to avoid timezone conversion issues with .toISOString()
    const d = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(d.getTime() + istOffset);
    return istDate.toISOString().replace('Z', '+05:30');
};

module.exports = {
    getISTDate,
    getISTString,
    getISTISOString
};
