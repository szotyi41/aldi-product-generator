const fetch = require('node-fetch');
const fs = require('fs');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const download = require('download-file');
const menu = require('console-menu');


String.prototype.splice = function(idx, rem, str) {
    return this.slice(0, idx) + str + this.slice(idx + Math.abs(rem));
};

var DCO = false;

//
/*
TODO 
Product name: remove uppercases ✅
Add Ft before amount ✅
Date format: HH.NN. ✅
If the prodcut price -100 ft - 499 ft -> % százalék kerekítés lefelé floor() ✅
git

TODO:
base priceot <br/> ezni okosba
Hiányzó fieldek
filebamentés
beszorzod kettővel fele product fele packshot
*/
function convertToCSV(arr) {

    var arr = typeof arr !== 'object' ? JSON.parse(arr) : arr;
    var str = `${Object.keys(arr[0])
        .map((value) => `"${value}"`)
        .join(',')}` + '\r\n';

    var csvContent = arr.reduce((st, next) => {
        st += `${Object.values(next)
          .map((value) => `"${value}"`)
          .join(',')}` + '\r\n';
        return st;
    }, str);

    return csvContent;
}

function formatDate(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
}

function formatNumber(num) {
    return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1 ')
}

function getNumber(num) {
    return parseInt(num.toString().replace(' ', ''));
}

function processFeed(json, downloadImages) {

    //await fs.mkdir('badges', err => console.log(err));
    //await fs.mkdir('products', err => console.log(err));

    const products = Object.values(json.lists).reduce((i, j) => ([...i, ...j.content]), []);

    console.log(products.length, 'products found in feed');

    const feed = products.map((content) => {

        // Product name
        const productName = content.product?.texts?.default ?? '';
        const uppercasesWordsInProductName = (productName.match(/([A-Z\-\!\ÁŰÚŐÓÜÖÉ\'\-]{1,})\s/g) ?? []).map(a => a.trim());
        const productNameWithoutUppercaseWords = productName.split(' ').filter(w => !uppercasesWordsInProductName.includes(w)).join(' ');
        const productUrl = content.product?.refs?.default;
        
        if (!productUrl || !productUrl.includes('https://www.aldi.hu/hu/ajanlatok/akciok-aldi-aron')) {
            return {
                no_action_url: null
            }
        }

        // Images
        const jsonString = JSON.stringify(content.product) ?? '';
        const badgeImage = content.product?.media?.assets?.[0]?.versions?.desktop.src ?? jsonString.match(/\"(https\:\/\/www\.aldi\.hu\/fileadmin[^"]{0,}badge[^\\"]{0,})/)?.[1] ?? '';
        const productImage = jsonString.match(/\"(https\:\/\/www\.aldi\.hu\/fileadmin[^"]{0,}nagy[^\\"]{0,})/)?.[1] ?? jsonString.match(/\"(https\:\/\/www\.aldi\.hu\/fileadmin[^"]{0,}\.jpg[^\\"]{0,})/)?.[1];
        
        // Download images
        if (badgeImage.length && downloadImages) download(badgeImage, { directory: './badges/' });
        if (productImage.length && downloadImages) download(productImage, { directory: './products/' });

        // Prices
        const amount = content.product?.price?.amount ?? '';
        const price = content.product?.price?.formattedPrice ?? content.product?.price?.price;
        const formerPrice = (content.product?.price?.formattedFormerPrice ?? content.product?.price?.formerPrice);
        const basePrice = content.product?.price?.basePrice ?? '';

        // Generate base price
        const basePriceBreaksArray = basePrice.match(/([0-9, ]{1,} \/ [0-9,]{1,})/g) ?? [];
        var start = basePrice;
        basePriceBreaksArray.forEach((a, id) => {
            const indexof = start.indexOf(a);

            if (id % 2 === 0) {
                start = start.splice(indexof, 0, '<br/>');
            }
        });

        const basePriceFormatted = start.replace('<br/>', '');


        // Has no former price
        if (!formerPrice || !getNumber(formerPrice)) {
            return {
                no_former_price: formerPrice ?? null
            };
        }

        const formattedFormerPrice = formatNumber(getNumber(formerPrice)) + 'Ft';
        const priceDifference = getNumber(formerPrice) - getNumber(price);
        const priceInPercent = (Math.floor(100 - ((getNumber(price) / getNumber(formerPrice)) * 100)));

        // Show Price when
        // Price is integer when divide by 100 -> not allowed: 999, 620, 320 | allowed: 100, 200, 300, 400
        // AND Price is larger than 100 -> do not write -30Ft, show instead: -18%
        // OR the percent is smaller than 15% -> do not show -8% instead: -8Ft
        // ELSE
        // Show percent
        const priceDifferenceFormatted =  (priceInPercent < 11) ? '' : 
            (((Number.isInteger(priceDifference / 100) && priceDifference.toString().length < 4)) ? 
            ('-' + priceDifference.toString().split(' ').join('') + 'Ft') : 
            ('-' + priceInPercent + "<span style='font-size:14px'>%</span>"));
       
        // Dates
        const regexDates = content.product?.texts?.descriptionHtml.match(/([0-9]{4}(-|.)[0-9]{2}(-|.)[0-9]{2}).*([0-9]{4}(-|.)[0-9]{2}(-|.)[0-9]{2})\-ig/i);
        const startDate = regexDates?.[1]; // content.product?.validFrom ?? 
        if (!startDate) {
            return {
                no_start_date: null
            }
        }
        const startDateFormat = new Date(startDate);
        let endDate = regexDates?.[4] ?? null;
        const endDateFormat = new Date(endDate);

        function isValidDate(d) {
            return d instanceof Date && !isNaN(d);
        }

        // Where no end date skip
        if (endDate === null || endDate === NaN || !isValidDate(endDateFormat)) {
            return {
                no_end_date: null
            };
        }

        // Add zeros before 03 08 etc
        const startDateMonth = (startDateFormat.getMonth() + 1).toString().length === 2 ? (startDateFormat.getMonth() + 1) : '0' + (startDateFormat.getMonth() + 1).toString();
        const endDateMonth = (endDateFormat.getMonth() + 1).toString().length === 2 ? (endDateFormat.getMonth() + 1) : '0' + (endDateFormat.getMonth() + 1).toString();
        const startDateDay = (startDateFormat.getDate()).toString().length === 2 ? (startDateFormat.getDate()) : '0' + (startDateFormat.getDate()).toString();
        const endDateDay = (endDateFormat.getDate()).toString().length === 2 ? (endDateFormat.getDate()) : '0' + (endDateFormat.getDate()).toString();
        const inAction = (getNumber(formerPrice) ?? 0) > (getNumber(price) ?? 0);

        if (!inAction) {
            return {
                not_in_action: null
            }
        }

        return {
            product_name: productName,
            product_name_formatted: productNameWithoutUppercaseWords,
            product_image_1_url: productImage,
            product_image_1: (productImage?.length ? 'hu-HU/product/' : '') + baseName(productImage) + (productImage?.length ? '.jpg' : ''),
            product_badge_image_url: badgeImage,
            product_badge_image: (badgeImage?.length ? 'hu-HU/sticker/' : '') + baseName(badgeImage) + (badgeImage?.length ? '.jpg' : ''),
            product_amount: ('Ft' + amount),
            product_price: price,
            product_price_base: basePriceFormatted,
            product_price_formatted: parseInt(price.split(' ').join('')),
            product_former_price: formerPrice,
            product_former_price_formatted: formattedFormerPrice.split(' ').join(''),
            product_price_difference: priceDifference,
            product_price_difference_formatted: priceDifferenceFormatted,
            product_url: productUrl ?? '',
            start_date: startDate ?? '',
            start_date_object: startDateFormat,
            start_date_formatted: startDateMonth + '.' + startDateDay + '.',
            end_date: endDate ?? '',
            end_date_object: endDateFormat,
            end_date_formatted: endDateMonth + '.' + endDateDay + '.',
            in_action: inAction,
            product_description: content.product?.texts?.descriptionHtml ?? ''
        }
    });

    console.log(feed.filter(p => p.no_former_price === null).length + ' products has no former price');
    console.log(feed.filter(p => p.no_start_date === null).length + ' has no start date');
    console.log(feed.filter(p => p.no_end_date === null).length + ' has no end date');
    console.log(feed.filter(p => p.not_in_action === null).length + ' not in action');

    const resultFeed = feed.filter(p => p.no_former_price !== null && p.no_start_date !== null && p.no_end_date !== null && p.not_in_action !== null && p.no_action_url !== null);
    console.log('\x1b[32m' + resultFeed.length + '\x1b[0m/' + products.length + ' products imported', 'color: green');

    return resultFeed;
}

function baseName(url) {
    if (url) {
        var m = url.toString().match(/.*\/(.+?)\./);
        if (m && m.length > 1) {
            return m[1];
        }
    }
    return "";
}

function mixFeed(products) {

    const types = ['product', 'packshot'];
    const days_start = ['vasárnaptól', 'hétfőtől', 'keddtől', 'szerdától', 'csütörtöktől', 'péntektől', 'szombattól'];
    const days_end = ['vasárnapig', 'hétfőig', 'keddig', 'szerdáig', 'csütörtökig', 'péntekig', 'szombatig'];

    const productsGroupBy = products.reduce((groups, product) => {
        const groupBy = product.start_date_formatted + product.end_date_formatted;

        if (groups[groupBy]?.length) {
            groups[groupBy].push(product);
        } else {
            groups[groupBy] = [product];
        }

        return groups;
    }, {});


    let result = [];

    types.forEach(type => {

        Object.keys(productsGroupBy).forEach((dateInerval) => {

            const mixedAdvertsInOneGroup = productsGroupBy[dateInerval].map((product, productIndex) => {

                const p1 = productsGroupBy[dateInerval][productIndex];
                const p2 = productsGroupBy[dateInerval]?.[productIndex + 1] ?? productsGroupBy[dateInerval]?.[productIndex - 1] ?? productsGroupBy[dateInerval]?.[productIndex];
                
                const start_day = days_start[p1.start_date_object.getDay()];
                const end_day = days_end[p1.end_date_object.getDay()];
                const start_date = '2021-' + (p1.start_date_formatted).replace(/\./g, '-').slice(0, -1);
                const end_date = '2021-' + (p1.end_date_formatted).replace(/\./g, '-').slice(0, -1);


                const advert_id = DCO ? '' : p1.product_name + '_' + p2.product_name + '_' + type;
                const advert_name = DCO ? start_date + ' ' + end_date : type;
                const reporting_label = p1.product_image_1_url.replace(/(.*)\//, '') + '_' + p2.product_image_1_url.replace(/(.*)\//, '') + '_' + type;

                const subheadline = 'Érvényes: <b>' + p1.start_date_formatted + '</b> ' + start_day + ' <b>' + p1.end_date_formatted + '</b> ' + end_day + '.';
                
                const sticker_image_1 = DCO ? p1.product_badge_image : ((p1.product_badge_image_url) ? ('DRM_Asset:Aldi/badges/' + baseName(p1.product_badge_image_url) + '.jpg') : 'DRM_Asset:Aldi/1x1.png');
                const sticker_image_2 = DCO ? p2.product_badge_image : ((p2.product_badge_image_url) ? ('DRM_Asset:Aldi/badges/' + baseName(p2.product_badge_image_url) + '.jpg') : 'DRM_Asset:Aldi/1x1.png');

                const product_image_1 = DCO ? p1.product_image_1 : p1.product_image_1_url;
                const product_image_2 = DCO ? p2.product_image_1 : p2.product_image_1_url;

                const brand_image_1 = DCO ? 'hu-HU/brand/logo.svg' : 'DRM_Asset:Aldi/logo.svg';
                const brand_image_2 = DCO ? 'hu-HU/brand/logo_2.svg' : 'DRM_Asset:Aldi/logo_2.svg'

                if (p1.start_date !== p2.start_date) {
                    console.error('\x1b[31mAfter mixing the two product in same creative has different START dates\x1b[0m');
                }

                if (p1.end_date !== p2.end_date) {
                    console.error('\x1b[31mAfter mixing the two product in same creative has different END dates\x1b[0m');
                }

                return {
                    advert_id: advert_id,
                    reporting_label: reporting_label,
                    theme: 'KW3',
                    is_default: 'false',
                    active: 'true',
                    start_date: start_date,
                    end_date: end_date,
                    advert_name: advert_name,
                    subheadline: subheadline,
                    subheadline_report: start_day + ' - ' + end_day,

                    slide_class_1: 'slide_1',
                    product_name_1: p1.product_name_formatted,
                    click_url_1: p1.product_url,
                    sticker_image_1: sticker_image_1,
                    product_image_1: product_image_1,
                    product_description_1: p1.product_price_base,
                    price_offer_1: p1.product_price_difference_formatted,
                    price_new_1: p1.product_price_formatted,
                    price_old_1: p1.product_former_price_formatted,
                    price_unit_1: p1.product_amount,
                    product_date_1: p1.start_date,

                    slide_class_2: type === 'product' ? ' slide_2_stop' : ' slide_2_continue',

                    product_name_2: p2.product_name_formatted,
                    click_url_2: p2.product_url,
                    sticker_image_2: sticker_image_2,
                    product_image_2: product_image_2,
                    product_description_2: p2.product_price_base,
                    price_offer_2: p2.product_price_difference_formatted,
                    price_new_2: p2.product_price_formatted,
                    price_old_2: p2.product_former_price_formatted,
                    price_unit_2: p2.product_amount,
                    product_date_2: p2.start_date,

                    slide_class_3: type === 'product' ? ' slide_3_continue' : ' slide_3_stop',

                    click_url_3: 'https://www.aldi.hu/hu/ajanlatok/akciok-aldi-aron/',
                    cta_1: 'Ajánlatok megtekintése',
                    brand_image_1: brand_image_1,
                    brand_image_2: brand_image_2,
                    /*description_1: p1.product_description,
                    description_2: p2.product_description,*/
                };
            });

            //result[dateInerval] = mixedAdvertsInOneGroup; 
            result = [...result, ...mixedAdvertsInOneGroup];

        }, []);

    });

    // Create default
    if (DCO !== true) {
        const def = Object.assign({}, result[0]);
        def.advert_id = def.advert_id + '_default';
        def.is_default = 'true';
        def.start_date = '2021-01-01';
        def.end_date = '2023-01-01';
        result.unshift(def);
    }

    return result;

    // advert_id: random
    // reporting_label: product image filenevekből _packshot -> slide3stop _product -> slide2stop
    // advert_name: product packshot
    // brand_image_1 aldi logo mindenkép
    // subheadline: Érvényes: <b>08.01.</b> csütörtöktől <b>08.04.</b> szerdáig
    // subheadline_report: csütörtöktől szerdáig
    // click_url_1: 
    // sticker_image_1: 
    // product_name_1: 
    // product_description_1: base price with brake "okosba"
    // price_offer_1: product_price different formatted
    // prive_new_1: price_formatted
    // price_old_1: price former formatted
    // price_unit: amount
    // slide_2: slide_2 / slide_2_stop
    // slide_3
    // click_url_3: aldiáron
    // brand_image_2: logo 2
    // cta_1: ugyanaz
    // packshot / product * 2
}


async function writeToSpreadsheet(arrayOfObjects) {

    const today = new Date();
    const doc = new GoogleSpreadsheet('1Bs7eib38Gh6nLOHd3KnauJOMPRbRFJ0adUYAVHv1Q9Q');
    const sheetTitle = 'aldi.' + (today.getMonth() + 1) + '.' + today.getDate() + (DCO ? '.dco' : '');
    const clientEmail = 'triumphspreadsheetserviceaccou@triumphspreadsheetfeedexport.iam.gserviceaccount.com';
    const privateKey = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCjIecy8+AMCJE3\nR4p0BJ87VL/SQH/jI0NUxnVnhGAlyhBifJizQ3jBQ3jY+sCBB/KDNKnJjvq2mtye\n0Ma6vkZI2a4RsIlyz6gLfFvaldHRrIKTmfRpAIVWhHR4FJo443pVVUMcxY+RmyCk\n9osDzYtOy71MWPFDDOTFjZeZ4ToyO9Z2tZ/KmyFLrG7xuiJhICDartlO7+UUrzVO\nJrR7QTCfI9OvlR2crsKD1+CB8iOi3UNARQZThY4sqirMTSPkufUuMze9MDfKmAi/\nZYMovl786nqOnt9os0NlFzWa5Tqk2BYhP4xzDjtNY0YGBITK7YIS97NUh6X74RE7\nbWF6SvOlAgMBAAECggEACAFR5x4wkGabOas5EBhp9+9gumCP5gWE+FQEzt+gGDqi\nMzMKC0H0WweElqE3cR2CuQ2Mh2eMxgkzale0aNWNfWWxNQ0Esa2fAXFI0KEperCM\nd9HGPKDZ6jT1wi7AoqoHBsj4UiEfunVyVKYEjFs5ytQUpfp3XGL1lvwrxFFZGb3h\n07+mGcKB/VfQAk3EJoFoE58wJhYP/WFCAH4Vn1fv1o37uz8Bi6k4cqkpz6N52n6P\ntuwCrAKCDG9I4ZJM9bhiw0r86/dWVGSnPc7l0VnA//CCTCrxHE4s9qyJchSyIP03\nSO2F81tCld+6SVaZy5+tw8w51etxyJf7xcgP9D9iAQKBgQDgNuZgcDhmB1s9TKp8\nzyl/F3AK5DwPXWhSohmDQFecv5Xk0V2SfPAh3O38ed3WyxMAyhhpu0cAcM/w9V9c\nsCcrQlT10oH9HOJ5Yl9pim6Q7UZ+ayy7ExhOGiiDKKwZyZ+XjaZh1OJ98FSbd3Rm\n9WEjY2w1l6MEzhhF849Z5gCD2QKBgQC6Qj1E+OeHD1FnmwyV8lEsMDMLIZxtAQxY\n+wKEOI83BKnFYIvbyY3nB5TWmDc0zjRumi0fI+54Ko1ihxLUk6uWC+NVvcOyvWRl\nIzjBt9GHPV8H3Z2pfSUL1QCEtJmW2f/Lx2851Nc0/p/Y9agQ67gzGwIgl4mWqxiv\ncFF5OepqrQKBgQCYIUfw+VObDrS+g+1Nn/ZE8G8qRK/nsPYe0zPCVX7csTWQOupl\ngXYhU9j6LOnzWnh7WaR04QgM6X59vM9GgZMiC/C/lmRyjA2yVKfuYWoh1Yy2LBv+\nlrcwDxmb3JXhLWemmgrhaGOBFfciQUvuq+GL9GKwfkGy+e+ITvjeA2woCQKBgACM\na2PFm+Dw8ZttgHb8lLKdnbjdq3lCtIeajaJYDEvsLpfPNfo6uLlCc3TCU/9K0Cq3\nN4TM9UnTTkFJBowrtyik9lFtUqM3HZGSrfscEHjmfF4oj+tM3AwR34OEiKNCFxfB\niZlRACU+zrez2X/bQdqcrL/t0lDoRhVWLlc+DWutAoGACNH0z1KPz7L5mjIhn/A2\nIIiQsFuIFn2k1nXTvMQ7WDbv2xrUgASjqPgeTLNQTYhyPoFYY4iY0KqKid86hOqd\n/b8rk5LXUWnryxM891lArwnBEHi3/ebpV2E87Rt491Fu5pQqZg2DXUlmjEyxaLHM\nbh0G7oA32Giihc6JVuIkmUg=\n-----END PRIVATE KEY-----\n';

    await doc.useServiceAccountAuth({
        client_email: clientEmail,
        private_key: privateKey
    });


    const sheetSettings = { 
        title: sheetTitle
    };

    console.log('Create sheet with settings', sheetSettings);

    // Create sheet
    const sheet = await doc.addSheet(sheetSettings);

    // Set size of sheet
    await sheet.resize({ 
        rowCount: 10000, 
        columnCount: 38, 
        frozenRowCount: 1 
    });

    // Set rows
    await sheet.setHeaderRow(Object.keys(arrayOfObjects[0]));

    console.log('Sheet created successfully');

    // Add rows
    const rows = await sheet.addRows(arrayOfObjects);

    console.log(arrayOfObjects.length, 'row(s) added successfully');
}


// Start process

// DCO or studio feed?
menu([
    { hotkey: 'y', title: 'Yes' },
    { hotkey: 'n', title: 'No', selected: true }
], {
    header: 'Remove old details from folders?',
    border: true,
}).then(async (removeOldDetails) => {

    if (removeOldDetails.title === 'Yes') {
        await fs.rmdirSync('products', { recursive: true });
        await fs.rmdirSync('badges', { recursive: true });
        await fs.rmdirSync('badges-cutted', { recursive: true });

        if (!fs.existsSync('products')) await fs.mkdirSync('products');
        if (!fs.existsSync('badges')) await fs.mkdirSync('badges');
        if (!fs.existsSync('badges-cutted')) await fs.mkdirSync('badges-cutted');
    }


    menu([
        { hotkey: 'd', title: 'Dco feed', selected: true },
        { hotkey: 's', title: 'Studio feed' }
    ], {
        header: 'Wanna make DCO or Studio feed?',
        border: true,
    }).then(dcoOrStudio => {

        // Set DCO or studio feed
        DCO = (dcoOrStudio.title === 'Dco feed') ? true : false;
        
        // Download Images?
        menu([
            { hotkey: 'y', title: 'Yes' },
            { hotkey: 'n', title: 'No', selected: true }
        ], {
            header: 'Download Images?',
            border: true,
        })
        .then(downloadImages => {

            fetch('https://esb.aldi-international.com/products/v1/offerOverviews/hu?expand=2', {
                    headers: {
                        Authorization: 'Basic ' + Buffer.from('mindshare_hu' + ':' + 'AjIvnJz8TkRgYH9P97VN').toString('base64')
                    }
                })
                .then(response => {
                    return response.json();
                })
                .then(async (response) => {
                    const result = await processFeed(response, downloadImages.title === 'Yes' ? true : false);
                    const arrayOfObjects = await mixFeed(result);
                    const feedFileName = 'feeds/aldi-feed' + (DCO ? '-dco-' : '-studio-') + formatDate(new Date()) + '.csv';

                    // Create directory if not exists
                    if (!fs.existsSync('feeds')) await fs.mkdirSync('feeds');

                    // Write feed
                    await fs.writeFileSync(
                        feedFileName, 
                        convertToCSV(arrayOfObjects), 
                        'UTF8'
                    );

                    // Write to spreadsheet?
                    menu([
                        { hotkey: 'y', title: 'Yes' },
                        { hotkey: 'n', title: 'No', selected: true }
                    ], {
                        header: 'Write to spreadsheet?',
                        border: true,
                    }).then(writeSpreadsheet => {
                        if (writeSpreadsheet.title === 'Yes') {
                            writeToSpreadsheet(arrayOfObjects);
                            console.log('Finished');
                        } else {
                            console.log('Finished without write spreadsheet')
                        }
                    });

                });
        });

    });

});