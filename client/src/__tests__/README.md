# Test Suite

## Structure

```
__tests__/
├── unit/           # Unit tests
│   ├── crdt/       # CRDT functionality
│   └── webrtc/     # WebRTC manager
├── integration/    # Integration tests
└── utils/          # Test utilities and mocks
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test <filename>

# Run without watch mode
npm test -- --watchAll=false

# Run with coverage
npm test -- --coverage
```

## Test Coverage

### Unit Tests - CRDT (`unit/crdt/`)
- **crdt-basic-operations.test.js** - Core CRDT functionality (initialization, insertions, deletions)
- **crdt-concurrent-operations.test.js** - Multi-user concurrent editing scenarios
- **crdt-text-operations.test.js** - Text-level abstractions
- **crdt-serialization.test.js** - Document persistence and serialization
- **crdt-deterministic-order.test.js** - Conflict resolution
- **crdt-convergence.test.js** - Eventual consistency
- **crdt-validation.test.js** - Input validation and error handling
- **crdt-fixes.test.js** - Specific bug fixes and edge cases

### Unit Tests - WebRTC (`unit/webrtc/`)
- **webrtc-manager.test.js** - WebRTC connection management

### Integration Tests (`integration/`)
- **crdt-webrtc.test.js** - Real-time collaborative editing with WebRTC

### Test Utilities (`utils/`)
- **webrtc-mocks.mjs** - Mock WebRTC and Socket.IO implementations
