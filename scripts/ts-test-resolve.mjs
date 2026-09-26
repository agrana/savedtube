/**
 * Node test helper: resolve extensionless and .js relative imports to .ts sources
 * so --experimental-strip-types can load the same modules Next.js bundles.
 */
export async function resolve(specifier, context, nextResolve) {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/')
  ) {
    if (specifier.endsWith('.js')) {
      try {
        return await nextResolve(specifier.replace(/\.js$/, '.ts'), context);
      } catch {
        // fall through
      }
    }

    if (
      !specifier.endsWith('.ts') &&
      !specifier.endsWith('.tsx') &&
      !specifier.endsWith('.json') &&
      !specifier.endsWith('.js') &&
      !specifier.endsWith('.mjs') &&
      !specifier.endsWith('.cjs')
    ) {
      try {
        return await nextResolve(`${specifier}.ts`, context);
      } catch {
        // fall through
      }
    }
  }

  return nextResolve(specifier, context);
}
