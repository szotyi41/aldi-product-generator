const getPixels = require('get-pixels');
const Clipper = require('image-clipper');
const canvas = require('canvas');
const download = require('download-file');
const fs = require('fs');


function cutBadges() {

    try {

        const nearTo = (r, g, b, r2, g2, b2, delay = 10) => {
            return (((r > r2 - delay) && (g > g2 - delay) && (b > b2 - delay)) && ((r < r2 + delay) && (g < g2 + delay) && (b < b2 + delay)));
        }

        fs.mkdir('badges-cutted', err => console.log(err));

        Clipper.configure('canvas', canvas);

        fs.readdirSync('badges').forEach(fileName => {
            const filePath = 'badges/' + fileName;

            if (filePath.includes('.DS_Store')) return;
            
            console.log('Image', filePath);
            getPixels(filePath, function(err, pixels) {

                if (err) {
                    console.log("Bad image path", filePath);
                    return;
                }

                var whiteLinesToEachOther = 0,
                    hasNonWhitePixelInRow = false,
                    magyartermekX = 0,
                    needToCutAtX = 0;

                for (let x = 32; x < pixels.shape[0]; x++) {
                    hasNonWhitePixelInRow = false;
                    for (let y = 0; y < pixels.shape[1]; y++) {
                        const r = pixels.get(x, y, 0);
                        const g = pixels.get(x, y, 1);
                        const b = pixels.get(x, y, 2);

                        // if (nearTo(r, g, b, 227, 178, 179)) {
                        //    console.log(filePath, ' seems like has magyar termék logo at x', x);
                        //    magyartermekX = x;
                        // }

                        if ((r < 240 || g < 240 || b < 240)) {
                            hasNonWhitePixelInRow = true;
                            whiteLinesToEachOther = 0;
                        }
                    }

                    // Count white lines
                    if (!hasNonWhitePixelInRow) {
                        whiteLinesToEachOther++;
                    }

                    if (whiteLinesToEachOther == 8) {
                        whiteLinesToEachOther = 0;
                        needToCutAtX = x;
                        break;
                    }
                }

                /*if (magyartermekX !== 0) {
                    Clipper(filePath, function() {
                        console.log('Clipping magyartermekX ', magyartermekX);
                        this.crop(0, 0, magyartermekX, pixels.shape[1]).quality(100).toFile('badgescut/' + fileName, () => {
                            console.log('Kész', 'badgescut/' + fileName);
                        });
                    });
                }*/

                if (needToCutAtX !== 0) {
                    Clipper(filePath, function() {
                        console.log('Clipping', fileName, needToCutAtX);
                        this.crop(0, 0, needToCutAtX, pixels.shape[1]).quality(100).toFile('badges-cutted/' + fileName, () => {
                            console.log('Clipped to', 'badges-cutted/' + fileName);
                        });
                    });
                }
            });
        });
    } catch (error) {
        console.log(error)
    }

}

cutBadges()
