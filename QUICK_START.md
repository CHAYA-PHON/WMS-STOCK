# 📚 Quick Start Guide - GitHub Setup

## ⚡ 5-Minute Setup

### **Step 1: Clone the Repository**

```bash
git clone https://github.com/CHAYA-PHON/WMS-STOCK.git
cd WMS-STOCK
```

### **Step 2: Install & Run**

```bash
npm install
npm run dev
```

Open: **http://localhost:3000**

---

## 🔐 Login Credentials

| User | Email/ID | PIN | Role |
|------|----------|-----|------|
| Admin | EMP001 | 123456 | Admin |
| Worker | EMP002 | 654321 | Worker |
| Leader | EMP003 | 111222 | Leader |

---

## 🚀 Deploy in 3 Steps

### **Option A: GitHub Pages (Automatic)**

```bash
# 1. Build
npm run build

# 2. Install gh-pages
npm install --save-dev gh-pages

# 3. Deploy
npm run deploy
```

**Live URL**: `https://YOUR-USERNAME.github.io/WMS-STOCK`

---

### **Option B: Vercel (Easiest)**

1. Go to: [vercel.com](https://vercel.com)
2. Click: **Import Project**
3. Select: **GitHub** → **WMS-STOCK**
4. Click: **Deploy**

**Done!** Your app is live.

---

### **Option C: Netlify (Drag & Drop)**

```bash
npm run build
```

1. Go to: [netlify.com](https://netlify.com)
2. Drag `dist` folder
3. Done!

---

## 🔗 Configure Google Sheets API

1. Create Google Sheets document
2. Create Google Apps Script:
   - Go to: **Tools** → **Script Editor**
   - Deploy as **Web App**
   - Get deployment URL

3. In app **Settings**:
   - Paste API URL
   - Save

**Example Sheets:**
- `products` - Product catalog
- `employees` - Employee list
- `transactions_IN` - Inbound records
- `transactions_OUT` - Outbound records
- `Location` - Shelf locations
- `edit_logs` - Audit trail

---

## 📱 Use on Any Device

Once deployed online:

```
🌐 PC:     https://your-domain.com
📱 Phone:  https://your-domain.com
🖥️ Tablet:  https://your-domain.com
```

All devices auto-responsive!

---

## 📂 Project Structure

```
WMS-STOCK/
├── src/
│   ├── App.jsx           ← Main app
│   └── main.jsx          ← Entry point
├── index.html            ← Template
├── vite.config.js        ← Build config
├── package.json          ← Dependencies
├── README.md             ← Full docs
└── .github/
    └── workflows/
        └── deploy.yml    ← Auto-deploy
```

---

## ✅ Checklist

- [ ] Clone repo: `git clone ...`
- [ ] Install: `npm install`
- [ ] Run locally: `npm run dev`
- [ ] Test login: EMP001 / 123456
- [ ] Build: `npm run build`
- [ ] Deploy: `npm run deploy` (or Vercel)
- [ ] Configure API URL in Settings
- [ ] Create Google Sheets
- [ ] Test sync with API
- [ ] Share link with team!

---

## 🐛 Common Issues

**Q: npm install fails?**
```bash
npm cache clean --force
rm -rf node_modules
npm install
```

**Q: Port 3000 in use?**
```bash
npm run dev -- --port 3001
```

**Q: GitHub Pages shows blank?**
- Check `package.json` homepage
- Rebuild: `npm run build && npm run deploy`
- Wait 1-2 minutes for publish

**Q: API calls fail?**
- Paste correct URL in Settings
- Check Google Apps Script is deployed
- Ensure CORS is enabled

---

## 📚 More Documentation

- 📖 [Full README](../README.md)
- 🚀 [Deployment Guide](./DEPLOYMENT.md)
- 🔌 [API Integration](./API.md)
- 💾 [Database Schema](./SCHEMA.md)

---

## 🤝 Need Help?

- 🐛 [Report Bug](https://github.com/CHAYA-PHON/WMS-STOCK/issues)
- 💬 [Ask Question](https://github.com/CHAYA-PHON/WMS-STOCK/discussions)
- 📧 [Create Issue](https://github.com/CHAYA-PHON/WMS-STOCK/issues/new)

---

**Happy deploying!** 🎉
