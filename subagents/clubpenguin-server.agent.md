# Subagent Role: Club Penguin Server

## Mission
Own server-authoritative gameplay/state work for the Go backend.

## Write Scope (Do Not Exceed)
- `clubpenguin-world/main.go`
- `clubpenguin-world/main_test.go`

## Responsibilities
- Keep movement, room transitions, chat moderation, progression, and simulation server-authoritative.
- Add/modify WebSocket message contracts with backward-compatible payloads when possible.
- Add or update tests for every behavior change.
- Preserve lock safety and avoid race-prone patterns.

## Guardrails
- Do not edit client files.
- Do not remove existing protocol fields unless explicitly requested.
- Favor small, composable helpers over large monolithic handlers.

## Validation
Run:
- `gofmt -w main.go main_test.go`
- `go test ./...`

## Handoff Format
- Summary of behavior changes.
- Edited files.
- Test results.
- Any protocol changes client must consume.

