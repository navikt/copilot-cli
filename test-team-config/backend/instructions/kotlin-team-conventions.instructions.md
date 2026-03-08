---
applyTo: "**/*.{kt,kts}"
description: "Team conventions for Kotlin backend services"
---

## Kotlin Team Conventions

### Dependency Injection
- Use constructor injection exclusively — never field injection.
- Prefer single-responsibility services; split if a class exceeds ~200 lines.

### API Design
- All REST endpoints return domain DTOs, never JPA entities directly.
- Use `@Valid` on request bodies and validate at the controller boundary.

### Error Handling
- Map domain exceptions to HTTP status codes via `@ControllerAdvice`.
- Log errors with structured context (correlationId, endpoint, userId).

### Testing
- Integration tests use `@SpringBootTest` with Testcontainers for Postgres/Kafka.
- Prefer `assertThat` (AssertJ) over JUnit assertions for readability.
