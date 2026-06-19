# 📦 WMS Stock Management System v2.1

**Warehouse Management System** - ระบบจัดการคลังสินค้า  
Mobile-first React app with QR scanning, Google Sheets integration, and real-time stock tracking.

---

## 🌐 **Live Demo**

🔗 **GitHub Pages**: https://chaya-phon.github.io/WMS-STOCK  
🔗 **GitHub Repo**: https://github.com/CHAYA-PHON/WMS-STOCK

---

## ✨ **Features**

✅ **11 Main Screens**
- 🏠 Dashboard - Live stats & transaction feed
- 📥 Inbound - 4-step QR scanning workflow
- 📤 Outbound - Batch stock transfer
- 🗂️ Products - Full CRUD management
- 🏗️ Locations - Shelf monitoring & relocation
- 👥 Employees - User management with roles
- 🕐 Work Schedule - Shift rotation (7/14 day cycles)
- ⚖️ Adjustments - Stock discrepancy requests
- 🔍 Audit Logs - Complete edit history
- 📊 Reports - Excel export by date range
- ⚙️ Settings - API config & user profile

✅ **Smart Features**
- 🔎 Fuzzy matching for Part No. search
- 📱 Mobile-first responsive design
- 🔐 Authentication with roles (admin/leader/worker)
- 📊 Real-time Google Sheets sync
- 💾 LocalStorage data persistence
- 🔔 Toast notifications & modals
- 📱 Camera QR scanner integration
- 📄 SheetJS Excel export

---

## 🚀 **Quick Start**

### **Option 1: Local Development**

#### **Prerequisites**
- Node.js 16+ (download from [nodejs.org](https://nodejs.org))
- Git (download from [git-scm.com](https://git-scm.com))

#### **Setup Steps**

```bash
# 1. Clone the repository
git clone https://github.com/CHAYA-PHON/WMS-STOCK.git
cd WMS-STOCK

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev

# 4. Open in browser
# Visit: http://localhost:3000
```

**Demo Credentials:**
- 👤 Admin: `EMP001` / `123456`
- 👤 Worker: `EMP002` / `654321`

#### **Build for Production**

```bash
# Build optimized version
npm run build

# Preview production build
npm run preview

# Deploy to GitHub Pages (requires gh-pages installed)
npm run deploy
```

---

### **Option 2: Deploy to GitHub Pages (Auto)**

#### **Initial Setup**

```bash
# 1. Fork or clone repo
git clone https://github.com/CHAYA-PHON/WMS-STOCK.git
cd WMS-STOCK

# 2. Install dependencies
npm install

# 3. Install gh-pages for deployment
npm install --save-dev gh-pages

# 4. Update package.json homepage (already done)
# "homepage": "https://YOUR-USERNAME.github.io/WMS-STOCK"

# 5. Build and deploy
npm run deploy
```

#### **GitHub Settings**
1. Go to repo: **Settings** → **Pages**
2. Set **Source** to: `gh-pages` branch
3. **Save** → Your site goes live in 1-2 minutes!

✅ Live URL: `https://YOUR-USERNAME.github.io/WMS-STOCK`

---

### **Option 3: Deploy to Vercel (Recommended)**

#### **One-Click Deploy**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FCHAYA-PHON%2FWMS-STOCK&project-name=wms-stock&repository-name=WMS-STOCK)

#### **Manual Vercel Deploy**

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login to Vercel
vercel login

# 3. Deploy
vercel

# 4. Follow prompts and your site is live!
```

---

### **Option 4: Deploy to Other Platforms**

#### **Netlify**
```bash
npm run build
# Drag & drop 'dist' folder to Netlify.com
# Or connect GitHub repo for auto-deploy
```

#### **AWS S3 + CloudFront**
```bash
npm run build
# Upload 'dist' folder to S3 bucket
# Configure CloudFront distribution
```

#### **Self-Hosted (VPS/Server)**
```bash
npm run build
# Upload 'dist' folder to web server
# Configure web server (nginx/Apache) to serve index.html
```

---

## 🔧 **Configuration**

### **Google Apps Script API Setup**

1. Create Google Sheets document
2. Deploy Google Apps Script Web App
3. In app **Settings** → Paste API URL
4. Sheets syncs automatically

**Example API Endpoint:**
```
https://script.google.com/macros/s/YOUR-SCRIPT-ID/exec
```

### **Google Sheets Structure**

Create these sheets in your Google Sheets:

| Sheet Name | Purpose |
|-----------|---------|
| `products` | Product catalog & inventory |
| `employees` | Employee directory & roles |
| `transactions_IN` | Stock inbound records |
| `transactions_OUT` | Stock outbound records |
| `discrepancy_requests` | Stock adjustment requests |
| `Location` | Shelf/Location management |
| `Work_schedule` | Shift schedules |
| `LOCATION_ID` | Location master list |
| `edit_logs` | Audit trail (backup) |

---

## 📱 **Usage on Multiple Devices**

### **Access from Anywhere**

Once deployed online:

```
🌐 Desktop:  https://your-domain.com
📱 Mobile:   https://your-domain.com (responds automatically)
🖥️ Tablet:   https://your-domain.com
```

### **Install as PWA (Optional)**

**iOS:**
1. Open in Safari
2. Tap **Share** → **Add to Home Screen**
3. App appears as icon

**Android:**
1. Open in Chrome
2. Tap **⋮** → **Install app**
3. App appears on home screen

---

## 🎨 **Customization**

### **Change Theme Colors**

Edit `src/App.jsx` - Theme constants:

```javascript
const C = {
  navy: "#0f2d5c",      // Main color
  blue: "#1e6fd9",      // Secondary
  white: "#ffffff",     // Background
  success: "#198754",   // Success alerts
  danger: "#dc3545",    // Errors
  warning: "#fd7e14",   // Warnings
  // ... more colors
};
```

### **Add More Screens**

1. Create new screen component in `src/App.jsx`
2. Add to `MORE_ITEMS` array
3. Add to `SCREENS` object

### **Customize Fields**

Edit `DEMO_PRODUCTS`, `DEMO_EMPLOYEES`, etc. constants

---

## 📊 **Database Integration**

### **Current: Google Sheets**
- ✅ Free tier supports 5M cells
- ✅ Real-time collaboration
- ✅ Built-in backup & version history

### **Future: Firebase/Supabase**
- PostgreSQL instead of Sheets
- Better performance for large data
- More complex queries

### **Setup Instructions**

See: [`INTEGRATION.md`](./INTEGRATION.md)

---

## 🔐 **Security Notes**

⚠️ **Current Implementation:**
- ✅ PIN-based authentication (6 digits)
- ✅ localStorage session storage
- ✅ No sensitive data in code

**Recommended for Production:**
- 🔒 Use OAuth 2.0 (Google/Azure)
- 🔒 HTTPS only (enforce)
- 🔒 Use environment variables for API keys
- 🔒 Add rate limiting on API
- 🔒 Implement CORS properly

---

## 📦 **Project Structure**

```
WMS-STOCK/
├── public/
│   └── favicon.svg
├── src/
│   ├── App.jsx              (Main app component)
│   └── main.jsx             (Entry point)
├── index.html               (HTML template)
├── vite.config.js           (Build config)
├── package.json             (Dependencies)
├── .gitignore              (Git exclusions)
├── .github/
│   └── workflows/
│       └── deploy.yml       (Auto-deploy)
└── README.md
```

---

## 🐛 **Troubleshooting**

### **Problem: npm install fails**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### **Problem: Port 3000 already in use**
```bash
# Use different port
npm run dev -- --port 3001
```

### **Problem: GitHub Pages shows blank page**
1. Check `homepage` in `package.json`
2. Ensure `gh-pages` branch exists
3. Rebuild: `npm run build && npm run deploy`

### **Problem: API calls fail (CORS error)**
- Add CORS headers to Google Apps Script
- Or use proxy service

---

## 📚 **Documentation**

- **[User Guide](./docs/GUIDE.md)** - How to use the app
- **[API Docs](./docs/API.md)** - Google Apps Script integration
- **[Database Schema](./docs/SCHEMA.md)** - Google Sheets structure
- **[Deployment Guide](./docs/DEPLOYMENT.md)** - Detailed setup

---

## 🤝 **Contributing**

Found a bug or want to improve? 

1. Fork the repo
2. Create feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m 'Add your feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Open Pull Request

---

## 📄 **License**

MIT License - Free to use for personal & commercial projects

---

## 👤 **Author**

**CHAYA-PHON**  
🔗 GitHub: [@CHAYA-PHON](https://github.com/CHAYA-PHON)

---

## 📞 **Support**

- 🐛 **Bug Report**: [GitHub Issues](https://github.com/CHAYA-PHON/WMS-STOCK/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/CHAYA-PHON/WMS-STOCK/discussions)
- 📧 **Email**: [Create an issue](https://github.com/CHAYA-PHON/WMS-STOCK/issues)

---

## 🎯 **Version History**

### **v2.1.0** (Current)
- ✨ Fuzzy matching for Part No. search
- ✨ Shift rotation scheduling (7/14 day cycles)
- ✨ Improved QR scanner with suggestions
- ✨ Audit logs with before/after data
- 🐛 Fixed overlap detection for shifts

### **v2.0.0**
- 🎉 Complete mobile-first redesign
- 🎉 9 main screens + Settings
- 🎉 SheetJS Excel export
- 🎉 Fuzzy search implementation

### **v1.0.0**
- 🚀 Initial release
- 📦 Basic CRUD operations
- 🔐 PIN authentication

---

## 🗺️ **Roadmap**

- [ ] Offline mode (PWA)
- [ ] Barcode printer integration
- [ ] SMS notifications
- [ ] Multi-language support
- [ ] Dark mode
- [ ] Analytics dashboard
- [ ] API webhook support
- [ ] Mobile app (React Native)

---

**Last Updated:** 2026-06-19  
**Made with ❤️ for warehouse teams everywhere**
