# 💳 Razorpay Complete Payment Application

Full-stack payment app with login, payment processing, history, and refunds.

## 🚀 Features

- ✅ **User Authentication** — Register/Login/Logout
- ✅ **Server-side Order Creation** — Secure order generation
- ✅ **Payment Verification** — HMAC signature validation
- ✅ **Payment History** — View all transactions
- ✅ **Email Receipts** — Auto-send payment confirmation
- ✅ **Refund Processing** — Full & partial refunds
- ✅ **Multiple Payment Methods** — Card, UPI, Net Banking, Wallet
- ✅ **Real-time Stats** — Dashboard with analytics
- ✅ **Test Mode** — No KYC, no real money

## 📦 Installation

```bash
cd razorpay-complete
npm install
npm start
```

Server starts at `http://localhost:3000`

## 🌐 Pages

| Page | URL | Description |
|------|-----|-------------|
| **Login** | `http://localhost:3000/` | Register/Login |
| **Payment** | `http://localhost:3000/payment.html` | Make payments |
| **History** | `http://localhost:3000/history.html` | View transactions & refunds |

## 🧪 Test Credentials

- **Card:** `4111 1111 1111 1111` | Expiry: `12/30` | CVV: `123`
- **UPI:** `success@razorpay`
- **No OTP** required in Test Mode

## 📁 Structure

```
razorpay-complete/
├── server.js              # Backend (Node.js + Express)
├── package.json           # Dependencies
├── .env                   # Configuration
├── public/
│   ├── index.html         # Login/Register page
│   ├── payment.html       # Payment page
│   └── history.html       # History & refunds
```

## ⚠️ Notes

- **Test Mode Only** — No real money
- **In-memory DB** — Data resets on restart
- **Email** — Configure `.env` for receipts
