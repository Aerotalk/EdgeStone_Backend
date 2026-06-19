const fs = require('fs');
const path = require('path');

const directories = ['controllers', 'services'];

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.js')) {
            processFile(fullPath);
        }
    }
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Fix the incorrect require path
    const relativePath = path.relative(__dirname, filePath);
    const depth = relativePath.split(path.sep).length - 1;
    let prefix = '../'.repeat(depth) + 'utils/prisma';
    if (depth === 0) {
        prefix = './utils/prisma';
    }

    // Replace the bad '../../../../../utils/prisma' generated previously
    const badRegex = /const\s+prisma\s*=\s*require\('\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/utils\/prisma'\);?/g;
    const badRegex2 = /const\s+prisma\s*=\s*require\('\.\.\/\.\.\/\.\.\/\.\.\/utils\/prisma'\);?/g;
    const badRegex3 = /const\s+prisma\s*=\s*require\('\.\.\/\.\.\/\.\.\/utils\/prisma'\);?/g;
    
    // Actually, just replace any require('.*/utils/prisma') that might be wrong
    content = content.replace(/const\s+prisma\s*=\s*require\('[\.\/]+utils\/prisma'\);?/g, `const prisma = require('${prefix}');`);
    changed = true; // Always write just in case

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

directories.forEach(dir => {
    processDirectory(path.join(__dirname, dir));
});
console.log('Done refactoring PrismaClient.');
