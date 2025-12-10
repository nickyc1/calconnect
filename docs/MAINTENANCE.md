# Maintenance Notes

## Known Deprecation Warnings (November 2025)

During `npm install`, the following deprecation warnings appear. These are **non-critical** and should be addressed in a future maintenance cycle.

### Direct Dependencies

#### ESLint 8.x (Deprecated)
```
npm warn deprecated eslint@8.57.1: This version is no longer supported
```

**Current Version**: `^8.56.0`
**Target Version**: `^9.0.0`
**Blocker**: `eslint-config-next@^14.2.0` may not support ESLint 9 yet

**Action Plan**:
1. Wait for Next.js 15 or eslint-config-next update
2. Test ESLint 9 compatibility
3. Update both together:
   ```bash
   npm install eslint@^9.0.0 eslint-config-next@latest
   ```

### Transitive Dependencies (Indirect)

These are pulled in by other packages we depend on:

#### glob 7.x (Deprecated)
```
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
```

**Used by**: Jest, ts-jest, rimraf, and other build tools
**Resolution**: Will be updated when Jest/ts-jest update their dependencies

#### rimraf 3.x (Deprecated)
```
npm warn deprecated rimraf@3.0.2: Rimraf versions prior to v4 are no longer supported
```

**Used by**: Various build tools
**Resolution**: Will be updated when parent packages update

#### inflight (Deprecated, Memory Leak)
```
npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory
```

**Used by**: Older npm packages
**Resolution**: Will be phased out as npm ecosystem updates

#### @humanwhocodes packages (Deprecated)
```
npm warn deprecated @humanwhocodes/config-array@0.13.0: Use @eslint/config-array instead
npm warn deprecated @humanwhocodes/object-schema@2.0.3: Use @eslint/object-schema instead
```

**Used by**: ESLint 8
**Resolution**: Will be removed when upgrading to ESLint 9

## Impact Assessment

### Security
- ✅ **No known security vulnerabilities** - These are deprecation notices, not CVEs
- Run `npm audit` to check for actual security issues

### Functionality
- ✅ **All features work correctly** - Deprecation doesn't mean broken
- Development, testing, and production builds are unaffected

### Performance
- ⚠️ **Minor memory leak from inflight** - Negligible in development
- Consider monitoring in production if issues arise

## Maintenance Schedule

### Immediate (Phase 0-4)
- **No action required** - Focus on core implementation

### Pre-Production (Phase 5-6)
- Run `npm audit` for security vulnerabilities
- Test with `npm outdated` to see available updates
- Create test branch for dependency updates

### Post-Launch (v1.1 or v2.0)
1. **Major Dependency Updates**:
   ```bash
   # Check for updates
   npm outdated

   # Update Next.js and related packages
   npm install next@latest eslint-config-next@latest

   # Update ESLint if Next.js supports v9
   npm install eslint@latest

   # Update testing frameworks
   npm install jest@latest ts-jest@latest
   ```

2. **Verify Functionality**:
   - Run full test suite
   - Test development build
   - Test production build
   - Verify linting works

3. **Document Changes**:
   - Update this file with new warnings/issues
   - Note any breaking changes in CHANGELOG

## Monitoring

### Commands to Run Periodically

```bash
# Check for security vulnerabilities
npm audit

# Check for outdated packages
npm outdated

# See all installed package versions
npm list --depth=0

# Update all minor/patch versions (safe)
npm update

# Check for breaking changes before major updates
npm install <package>@latest --dry-run
```

### Automated Tools to Consider

- **Dependabot** (GitHub): Automatic dependency PRs
- **Renovate**: More configurable than Dependabot
- **Snyk**: Security-focused dependency monitoring
- **npm-check-updates**: CLI tool for updates

## Notes

- **Philosophy**: "If it ain't broke, don't fix it"
- **Priority**: Ship features first, optimize dependencies later
- **Testing**: Always test dependency updates in isolation
- **Rollback**: Keep `package-lock.json` in version control for easy rollback

## References

- [Next.js Upgrading Guide](https://nextjs.org/docs/upgrading)
- [ESLint Migration to v9](https://eslint.org/docs/latest/use/migrate-to-9.0.0)
- [npm Best Practices](https://docs.npmjs.com/cli/v10/using-npm/developers)
- [Semantic Versioning](https://semver.org/)

---

**Last Updated**: November 8, 2025
**Next Review**: After Phase 6 completion or 3 months (whichever comes first)
