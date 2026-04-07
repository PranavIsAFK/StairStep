
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'qr_samples');

if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir);
}

const floors = Array.from({ length: 16 }, (_, i) => i);

async function generate() {
    console.log("Generating QR codes for floors...");
    for (const f of floors) {
        const textToEncode = `FLOOR:${f}`;
        const fileName = `floor_${f}.png`;
        const filePath = path.join(targetDir, fileName);
        
        try {
            await QRCode.toFile(filePath, textToEncode, {
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                },
                width: 300
            });
            console.log(`✅ Generated ${fileName}: "${textToEncode}"`);
        } catch (err) {
            console.error(`❌ Error generating ${fileName}:`, err);
        }
    }
}

generate();
