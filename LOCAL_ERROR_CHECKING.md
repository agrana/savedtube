# Local Error Checking Guide for SavedTube

**Last updated:** June 2026

## 🎯 **Why Local Error Checking?**

Catching errors locally before pushing saves time and prevents Vercel build failures. This guide shows you how to run the same checks that Vercel runs.

## 🔧 **Available Scripts**

### **Quick Checks (Fast)**
```bash
# ESLint only - catches code style and basic issues
npm run lint

# TypeScript type checking only
npm run type-check
```

### **Comprehensive Checks (Slower but Complete)**
```bash
# Run all checks in sequence
npm run check-all

# Full pre-commit check with build
npm run pre-commit-full
```

## 📋 **What Each Check Does**

### **1. ESLint (`npm run lint`)**
- ✅ Code style consistency
- ✅ Unused variables and imports
- ✅ Potential bugs and anti-patterns
- ✅ React best practices
- ⏱️ **Time**: ~5-10 seconds

### **2. TypeScript Type Check (`npm run type-check`)**
- ✅ Type safety across the codebase
- ✅ Interface compliance
- ✅ API contract validation
- ⏱️ **Time**: ~2-5 seconds

### **3. Build Check (`npm run build`)**
- ✅ Next.js compilation
- ✅ Bundle optimization
- ✅ Production build validation
- ⏱️ **Time**: ~10-30 seconds

## 🚨 **Common Errors to Watch For**

### **TypeScript Errors**
```typescript
// ❌ BAD: Property doesn't exist
request.ip  // NextRequest doesn't have 'ip' in Next.js 15

// ✅ GOOD: Use headers instead
request.headers.get('x-forwarded-for')
```

### **ESLint Warnings**
```typescript
// ❌ BAD: Unused parameter
function handleEvent(event: Event) {  // 'event' not used
  console.log('Event occurred');
}

// ✅ GOOD: Remove unused parameter
function handleEvent() {
  console.log('Event occurred');
}
```

### **Build Errors**
```typescript
// ❌ BAD: Async cookies() usage
export function getCSRFToken(): string {
  const cookieStore = cookies();  // cookies() returns Promise in Next.js 15
  return cookieStore.get('token')?.value;
}

// ✅ GOOD: Proper async handling
export async function getCSRFToken(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get('token')?.value;
}
```

## 🎯 **Pre-Commit Workflow**

### **Option 1: Quick Check (Recommended for small changes)**
```bash
# Before committing
npm run lint
npm run type-check

# If both pass, commit
git add .
git commit -m "Your commit message"
```

### **Option 2: Full Check (Recommended for major changes)**
```bash
# Before committing
npm run check-all

# If all pass, commit
git add .
git commit -m "Your commit message"
```

### **Option 3: Automated Check**
```bash
# Run the full pre-commit script
npm run pre-commit-full

# This will run all checks and tell you if you can commit safely
```

## 🔍 **Troubleshooting Common Issues**

### **Build Cache Issues**
```bash
# Clear build cache if you get strange errors
rm -rf .next
npm run build
```

### **Dependency Issues**
```bash
# If you get module not found errors
rm -rf node_modules package-lock.json
npm install
```

### **TypeScript Cache Issues**
```bash
# Clear TypeScript cache
rm -rf .tsbuildinfo
npm run type-check
```

## 📱 **IDE Integration**

### **VS Code Extensions**
- **ESLint**: Real-time linting
- **TypeScript**: Real-time type checking
- **Prettier**: Code formatting

### **Settings for VS Code**
```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.formatOnSave": true,
  "typescript.preferences.includePackageJsonAutoImports": "on"
}
```

## 🚀 **Pro Tips**

### **1. Run Checks in Parallel (if you have multiple terminals)**
```bash
# Terminal 1
npm run lint

# Terminal 2  
npm run type-check

# Terminal 3
npm run build
```

### **2. Use Watch Mode for Development**
```bash
# ESLint watch mode
npm run lint -- --watch

# TypeScript watch mode
npx tsc --noEmit --watch
```

### **3. Check Specific Files**
```bash
# Lint specific file
npx eslint src/components/Logo.tsx

# Type check specific file
npx tsc --noEmit src/components/Logo.tsx
```

## ✅ **Success Checklist**

Before pushing to GitHub, ensure:
- [ ] `npm run lint` passes with no errors
- [ ] `npm run type-check` passes with no errors  
- [ ] `npm run build` completes successfully
- [ ] All tests pass (`npm test` is currently a placeholder)
- [ ] Code is formatted with Prettier

## 🎉 **Benefits**

- **Faster Development**: Catch errors immediately, not after pushing
- **Better Code Quality**: Consistent style and type safety
- **Team Productivity**: No more broken builds blocking deployments
- **Professional Reputation**: Clean, working code in your repository

## 🆘 **Need Help?**

If you encounter persistent errors:
1. Check the error message carefully
2. Look for similar issues in Next.js documentation
3. Check if it's a Next.js version compatibility issue
4. Ask for help in the team chat

---

**Remember**: A few minutes of local checking saves hours of debugging broken builds! 🚀
