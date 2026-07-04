const html = `
    <html>
        <body>
            <p>Some text</p>
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" alt="signature">
            <div style="background-image: url('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP///////////...')"></div>
        </body>
    </html>
`;

let attachments = [];
let imgCount = 0;

const finalHtml = html.replace(/(["'])(data:(image\/[^;]+);base64,([^"']+))\1/gi, (match, quote, fullDataUrl, mimeType, base64Data) => {
    imgCount++;
    const contentId = `sig-img-\${Date.now()}-\${imgCount}`;
    const extension = mimeType.split('/')[1] || 'png';
    const filename = `signature-image-\${imgCount}.\${extension}`;

    attachments.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        "name": filename,
        "contentType": mimeType,
        "contentBytes": base64Data,
        "isInline": true,
        "contentId": contentId
    });

    return `\${quote}cid:\${contentId}\${quote}`;
});

console.log('--- FINAL HTML ---');
console.log(finalHtml);
console.log('\n--- ATTACHMENTS ---');
console.log(JSON.stringify(attachments, null, 2));
