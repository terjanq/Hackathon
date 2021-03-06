const CATEGORIES = ['Food', 'Health', 'Clothing', 'Electronics', 'Entertainment', 'Travel']
const {spawn} = require('child_process');
const path = require('path');

function runScript(img_path){
    return spawn('python3', [
      "-u", 
      path.join(__dirname, '../receipt.py'),
      img_path
    ]);
  }

function loadReceipts(path) {
    let receipts = require(path);
    let products = {};
    receipts.forEach(r => {
        // r.date = new Date(r.date * 1000);
        r.products.forEach(p => {
            if (p.name in products) {
                products[p.name].price += p.price;
                products[p.name].quantity += p.quantity;
            }
            else {
                products[p.name] = {price: p.price, quantity: p.quantity, category: p.category, name: p.name, shop: r.shop};
            }
        })
    })
    return {
        receipts: receipts,
        products: products
    };
}

function loadAllReceipts(app, path, friends_path, global_path) {
    if (!app.locals || !app.locals.receipts) {
        app.locals.receipts = loadReceipts(path);
    }
    if (!app.locals || !app.locals.friendReceipts) {
        app.locals.friendReceipts = loadReceipts(friends_path);
    }
    if (!app.locals || !app.locals.globalReceipts) {
        app.locals.globalReceipts = loadReceipts(global_path);
    }
}

function compareField(field) {
    return (a, b) => b[field] - a[field];
}

function topProducts(receipts, cat, n) {
    let res = {};
    let {products} = receipts;
    let products_l = Object.entries(products).map(x => x[1]);
    if (cat) {
        products_l = products_l.filter(p => p.category == cat);
    }
    products_l = products_l.sort(compareField('price'));
    res.price = products_l.slice(0, n);
    products_l = products_l.sort(compareField('quantity'));
    res.quantity = products_l.slice(0, n);
    return res;
}

function total(receipts, cat) {
    let res = {
        price: 0,
        quantity: 0
    }
    let {products} = receipts;
    for (let p in products) {
        if (!cat || products[p].category == cat) {
            res.price += products[p].price;
            res.quantity += products[p].quantity;
        }
    }
    return res;
}

function intervalTotal(receipts, start, end) {
    receipts = receipts.receipts;
    let res = {
        price: 0,
        quantity: 0
    }
    for (let r of receipts) {
        let date = new Date(r.date * 1000);
        if(start <= date && date <= end) {
            for (let p of r.products) {
                res.price += p.price;
                res.quantity += p.quantity;
            }
        }
    }
    return res;
}

function monthsData(receipts, months=12) {
    let end = new Date();
    let start = new Date(end);
    start.setMonth(start.getMonth() - 1);
    let result = Array(months);
    for (let i = months - 1; i >= 0; i--) {
        result[i] = intervalTotal(receipts, start, end);
        result[i].start = start.toDateString();
        result[i].end = end.toDateString();
        start.setMonth(start.getMonth() - 1);
        end.setMonth(end.getMonth() - 1);
    }
    return result;
}

function productData(receipts, product) {
    let {products} = receipts;
    let result = {
        price: 0,
        quantity: 0,
        avg: 0,
        shop: "TESCO"
    }
    for (p in products) {
        if (p.toLowerCase().startsWith(product)) {
            result.price = products[p].price;
            result.quantity = products[p].quantity;
            result.avg = products[p].price / products[p].quantity;
            result.shop = products[p].shop;
            return result;
        }
    }
    return result;
}

module.exports = function(app) {
    app.get('/receipts', (req, res) => {
        let receipts = loadReceipts('../receipts.json')
        app.locals.receipts = receipts;
        res.json(receipts.receipts);
    })

    app.get('/category_stats', (req, res) => {
        let cat = req.query.category;
        let n = req.query.n || 5;
        loadAllReceipts(app, '../receipts.json', '../receipts_friends.json', '../receipts_all.json');
        let {receipts, friendReceipts, globalReceipts} = app.locals;
        let result = {
            userTop: topProducts(receipts, cat, n),
            friendsTop: topProducts(friendReceipts, cat, n),
            globalTop: topProducts(globalReceipts, cat, n),
            userTotal: total(receipts, cat),  
            friendsTotal: total(friendReceipts, cat),
            globalTotal: total(globalReceipts, cat)
        }
        res.json(result);
    })

    app.get('/totals', (req, res) => {
        let totals = {
            user: {},
            friends: {},
            global: {}
        };
        loadAllReceipts(app, '../receipts.json', '../receipts_friends.json', '../receipts_all.json');
        let {receipts, friendReceipts, globalReceipts} = app.locals;
        for (let cat of CATEGORIES) {
            totals.user[cat] = total(receipts, cat);
            totals.friends[cat] = total(friendReceipts, cat);
            totals.global[cat] = total(globalReceipts, cat);
        }
        res.json(totals);
    })

    app.get('/month_totals', (req, res) => {
        let months = req.query.n || 12;
        loadAllReceipts(app, '../receipts.json', '../receipts_friends.json', '../receipts_all.json');
        let {receipts, friendReceipts, globalReceipts} = app.locals;
        let totals = {
            user: monthsData(receipts, months),
            friends: monthsData(friendReceipts, months),
            global: monthsData(globalReceipts, months)
        }
        res.json(totals);
    })

    app.get('/top', (req, res) => {
        loadAllReceipts(app, '../receipts.json', '../receipts_friends.json', '../receipts_all.json');
        let {receipts} = app.locals;
        let {price, quantity} = topProducts(receipts, null, 1);
        res.json({price: price[0], quantity: quantity[0]});
    })

    app.get('/product_stats', (req, res) => {
        let product = req.query.product;
        loadAllReceipts(app, '../receipts.json', '../receipts_friends.json', '../receipts_all.json');
        let {receipts, friendReceipts, globalReceipts} = app.locals;
        let totals = {
            user: productData(receipts, product),
            friends: productData(friendReceipts, product),
            global: productData(globalReceipts, product)
        }
        totals.shop = totals.user.shop;
        res.json(totals);
    })

    app.get('/upload', (req, res) => {
        res.render('upload.ejs');
    })
    
    app.post('/upload', app.locals.upload.single('file'), async function(req, res, next){
        console.log(req.file)
        let p = req.file.path;
        const subprocess = runScript(path.join(__dirname, '../..', p))
        // print output of script
        await new Promise(r=>{
            subprocess.stdout.on('data', (data) => {
                let receipt = JSON.parse(data);
                console.log(receipt);
                loadAllReceipts(app, '../receipts.json', '../receipts_friends.json', '../receipts_all.json');
                app.locals.receipts.receipts.unshift(receipt);
                r();
            });
        })
        
        res.redirect('/');
    });

    app.get('/receipts.json', (req, res) => {
        loadAllReceipts(app, '../receipts.json', '../receipts_friends.json', '../receipts_all.json');
        res.json(app.locals.receipts.receipts);
    })
}
