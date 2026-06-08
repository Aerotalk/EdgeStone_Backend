const slaRecordService = require('./services/slaRecordService');
async function test() {
    try {
        await slaRecordService.updateSLAClosure('43d25627-d831-464a-b10b-842948ac6e42', '30 Jun 2026', '07:45 hrs');
        console.log('Success');
    } catch (e) {
        console.error('Error:', e);
    }
}
test();
