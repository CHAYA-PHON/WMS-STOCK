#!/bin/bash

# WMS Stock Management System - Setup Script
# This script automates the initial setup

echo "🚀 WMS Stock Management System Setup"
echo "======================================"
echo ""

# Check Node.js installation
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 16+ from https://nodejs.org"
    exit 1
fi

echo "✅ Node.js detected: $(node --version)"
echo "✅ npm detected: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Create .env file
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  Please edit .env and add your Google Apps Script API URL:"
    echo "   VITE_API_URL=https://script.google.com/macros/s/YOUR-SCRIPT-ID/exec"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📖 Next steps:"
echo "   1. Edit .env with your Google Apps Script URL"
echo "   2. Run: npm run dev"
echo "   3. Open: http://localhost:3000"
echo ""
echo "📚 Documentation: https://github.com/CHAYA-PHON/WMS-STOCK"
echo ""
