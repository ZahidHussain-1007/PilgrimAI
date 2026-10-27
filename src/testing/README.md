# Testing boundary

This directory is reserved for test fixtures and service mocks. Production components and services must not import from it. Backend contracts are not defined yet, so there are no fake accounts, conversations, trips, itineraries, favourites, or chat responses in the initial build.

The API modules under `src/services/api` are the integration boundary. Add fixture-backed adapters for tests only when specific UI states need representative data. The temporary development session is implemented behind `src/services/auth/session.ts`; it does not depend on this directory.
