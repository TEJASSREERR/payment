const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'razorpay-secret-key-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));
app.use(express.static('public'));

// In-memory storage
let usersDB = [];
let paymentsDB = [];
let refundsDB = [];

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Email transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ==========================================
// AUTH ROUTES
// ==========================================

// Register
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;

    if (usersDB.find(u => u.email === email)) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const user = {
        id: uuidv4(),
        name,
        email,
        password: crypto.createHash('sha256').update(password).digest('hex'),
        createdAt: new Date().toISOString()
    };

    usersDB.push(user);
    req.session.userId = user.id;

    res.json({ success: true, user: { id: user.id, name, email } });
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    const user = usersDB.find(u => u.email === email && u.password === hashedPassword);

    if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    req.session.userId = user.id;
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Get current user
app.get('/api/me', (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, user: null });
    }
    const user = usersDB.find(u => u.id === req.session.userId);
    if (!user) {
        return res.json({ success: false, user: null });
    }
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
});

// ==========================================
// PAYMENT ROUTES
// ==========================================

// Create Order
app.post('/api/create-order', async (req, res) => {
    try {
        const { amount, currency = 'INR', receipt } = req.body;

        const options = {
            amount: amount * 100,
            currency: currency,
            receipt: receipt || 'rcpt_' + Date.now(),
            payment_capture: 1
        };

        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency
        });
    } catch (error) {
        console.error('Order creation failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Verify Payment
app.post('/api/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, customer } = req.body;

        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            const paymentRecord = {
                id: uuidv4(),
                paymentId: razorpay_payment_id,
                orderId: razorpay_order_id,
                amount: req.body.amount,
                currency: req.body.currency || 'INR',
                customer: customer,
                userId: req.session.userId || null,
                status: 'success',
                timestamp: new Date().toISOString()
            };
            paymentsDB.push(paymentRecord);

            await sendReceiptEmail(paymentRecord);

            res.json({ success: true, message: 'Payment verified' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid signature' });
        }
    } catch (error) {
        console.error('Verification failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get Payments
app.get('/api/payments', (req, res) => {
    let payments = paymentsDB;
    if (req.session.userId) {
        payments = payments.filter(p => p.userId === req.session.userId || !p.userId);
    }
    res.json({
        success: true,
        count: payments.length,
        payments: payments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    });
});

// Refund
app.post('/api/refund', async (req, res) => {
    try {
        const { paymentId, amount } = req.body;

        const refund = await razorpay.payments.refund(paymentId, {
            amount: amount ? amount * 100 : undefined
        });

        refundsDB.push({
            id: uuidv4(),
            refundId: refund.id,
            paymentId: paymentId,
            amount: refund.amount / 100,
            status: refund.status,
            timestamp: new Date().toISOString()
        });

        const payment = paymentsDB.find(p => p.paymentId === paymentId);
        if (payment) {
            payment.status = 'refunded';
            payment.refundId = refund.id;
        }

        res.json({ success: true, refund });
    } catch (error) {
        console.error('Refund failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// EMAIL
// ==========================================

async function sendReceiptEmail(payment) {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: payment.customer.email,
            subject: 'Payment Receipt - ' + payment.orderId,
            html: `
                <div style="font-family: Arial; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; text-align: center; color: white;">
                        <h1>Payment Successful!</h1>
                        <p style="font-size: 28px; margin: 10px 0;">₹${payment.amount}</p>
                    </div>
                    <div style="padding: 30px; background: #f9f9f9;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Payment ID</strong></td><td style="padding: 10px; border-bottom: 1px solid #ddd;">${payment.paymentId}</td></tr>
                            <tr><td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Order ID</strong></td><td style="padding: 10px; border-bottom: 1px solid #ddd;">${payment.orderId}</td></tr>
                            <tr><td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Amount</strong></td><td style="padding: 10px; border-bottom: 1px solid #ddd;">₹${payment.amount} ${payment.currency}</td></tr>
                            <tr><td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Date</strong></td><td style="padding: 10px; border-bottom: 1px solid #ddd;">${new Date(payment.timestamp).toLocaleString()}</td></tr>
                        </table>
                        <p style="margin-top: 20px; color: #666; font-size: 12px;">This is a test transaction.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Email failed:', error);
    }
}

// ==========================================
// START
// ==========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('========================================');
    console.log('  Razorpay Complete App Running!');
    console.log('========================================');
    console.log('  Server: http://localhost:' + PORT);
    console.log('  Login: http://localhost:' + PORT + '/');
    console.log('  Payment: http://localhost:' + PORT + '/payment.html');
    console.log('  History: http://localhost:' + PORT + '/history.html');
    console.log('========================================');
});