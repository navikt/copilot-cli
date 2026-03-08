---
applyTo: "**/*.{ts,tsx}"
description: "Team patterns for React frontend applications"
---

## React Team Patterns

### Component Structure
- Use functional components with hooks — no class components.
- Co-locate component, styles, and tests in the same directory.
- Prefer named exports over default exports for better refactoring support.

### State Management
- Use React Query (TanStack Query) for server state — no Redux for API data.
- Local UI state lives in `useState`/`useReducer` — lift only when shared by siblings.

### Styling
- Use CSS Modules or Aksel design system tokens — no inline styles in production code.
- Follow NAV's design system (Aksel) for all UI components where applicable.

### Testing
- Write component tests with `@testing-library/react` — test behavior, not implementation.
- Mock API calls with `msw` (Mock Service Worker), not manual fetch mocks.
