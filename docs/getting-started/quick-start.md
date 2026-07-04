# Quick start

```bash
# Development (with hot reload)
pnpm run dev

# Desktop development
pnpm run dev:desktop

# Desktop development on an isolated port set
T3CODE_DEV_INSTANCE=feature-xyz pnpm run dev:desktop

# Production
pnpm run build
pnpm run start

# Build a shareable macOS .dmg (arm64 by default)
pnpm run dist:desktop:dmg

# Or from any project directory after publishing:
npx t3
```
