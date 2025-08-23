#!/bin/bash

# Pre-commit check script for SavedTube
# This script runs all the checks that Vercel will run

echo "🔍 Running pre-commit checks..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root."
    exit 1
fi

# 1. Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_warning "Installing dependencies..."
    npm install
fi

# 2. Run ESLint
echo "🔍 Running ESLint..."
if npm run lint; then
    print_status "ESLint passed"
else
    print_error "ESLint failed. Please fix the issues before committing."
    exit 1
fi

# 3. Run TypeScript type checking
echo "🔍 Running TypeScript type check..."
if npx tsc --noEmit; then
    print_status "TypeScript type check passed"
else
    print_error "TypeScript type check failed. Please fix the issues before committing."
    exit 1
fi

# 4. Run build (optional, but recommended)
echo "🔍 Running build check..."
if npm run build; then
    print_status "Build check passed"
else
    print_error "Build check failed. Please fix the issues before committing."
    exit 1
fi

# 5. Clean up build artifacts
echo "🧹 Cleaning up build artifacts..."
rm -rf .next

print_status "All pre-commit checks passed! 🎉"
print_status "You can now commit your changes safely."
