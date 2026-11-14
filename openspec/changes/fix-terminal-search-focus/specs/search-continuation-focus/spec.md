# Spec Delta

## Purpose

Viewers can continue operating the visible search results when an exhausted continuation action disappears, while asynchronous work respects any deliberate focus movement made during the request.

## ADDED Requirements

### Requirement: Exhausted continuation preserves keyboard access

The system SHALL remove the exhausted continuation action and hand its retained keyboard focus to an existing search control with a keyboard path to the retained results, without resetting the reading position. It MUST preserve stable result identity, keyboard activation and the approved appearance.

#### Scenario: Final page while the action retains focus

- **WHEN** the final page succeeds while its continuation action still has keyboard focus
- **THEN** a stable search control takes focus and the retained results can open matching details through the keyboard without navigating away from search

### Requirement: Continuation never overrides a newer focus choice

A continuation response MUST NOT move focus if the viewer has already moved away from its action, changed query, left search or removed the application. Pending and failed requests MUST retain existing retry behavior.

#### Scenario: Viewer edits while the final page arrives

- **WHEN** the viewer moves to the search input before the final response arrives
- **THEN** further typing remains in that input and no result steals focus

#### Scenario: Viewer leaves search

- **WHEN** navigation or disposal removes search during a pending continuation
- **THEN** the response cannot focus a hidden or removed search result
