# Real-Time Collaborative Editing Algorithm

## Overview

This CRDT implementation uses **YATA (Yet Another Transformation Approach)** for text editing with **Peritext** for rich text formatting. It guarantees **strong eventual consistency**: all peers converge to identical states regardless of network conditions or operation ordering.

**Algorithm Stack:**
- **YATA** (from Yjs) - Position resolution with originRight tracking
- **RGA** (Replicated Growable Array) - Ordered sequence management
- **Peritext** - Rich text formatting with anchor-based marks
- **Lamport timestamps** - Causal ordering

---

## Core Data Structure

Each character is a node with immutable causal references:

```javascript
{
  opId: "5@alice",        // Unique ID: counter@userId
  char: "X",              // The character
  afterId: "4@alice",     // originLeft: what was left at insertion
  originRight: "6@bob",   // originRight: what was right at insertion (YATA)
  rightId: "7@alice",     // Actual right neighbor (mutable, maintained by YATA)
  deleted: false,         // Tombstone flag
  userId: "alice",        // Creator
  counter: 5              // Lamport counter (logical time)
}
```

**Key insight:** `afterId` and `originRight` are immutable snapshots of insertion context, while `rightId` is dynamically maintained to reflect the actual sequence.

---

## YATA Insertion Algorithm

**Goal:** Insert character C with `afterId=P` and `originRight=R` into the sequence.

```
1. Start scanning right from position P
2. For each node N encountered:
   a. If N.opId == R → Insert BEFORE N (originRight precedence)
   b. If N.afterId == P (sibling):
      - If counter(C) < counter(N) → Insert BEFORE N
      - If counter(C) == counter(N) → Use userId tie-breaking
      - Else → Skip N and scan its descendants
   c. If N.afterId != P → Stop (left sibling region)
3. Insert C at determined position
```

**YATA extends RGA:** While RGA only uses `afterId`, YATA adds `originRight` to preserve "insert between" semantics, solving the position-0 insertion problem.

---

## Convergence Guarantee

### Why All Peers Reach the Same State

**1. Total Ordering via Deterministic Rules**

For any set of concurrent insertions at the same position:

```javascript
Priority 1: originRight match → Insert before originRight
Priority 2: Lamport counter   → Earlier counter inserts first
Priority 3: UserId lexicographic → Deterministic tie-breaking
```

All peers apply identical rules → identical ordering.

**2. Pure Function Property**

```
position = f(node.afterId, node.originRight, node.counter, node.userId, currentSequence)
```

The insertion position depends **only** on operation metadata and sequence state, not on:
- Wall-clock timestamps
- Network arrival order
- Local peer state

**3. Commutativity**

```
insert(insert(seq, OpA), OpB) ≡ insert(insert(seq, OpB), OpA)
```

Because ordering is deterministic, application order doesn't affect final state.

**4. Causality via Lamport Counters**

When receiving operation with `counter=C`:
```javascript
localCounter = max(localCounter, C)
```

This ensures:
- If A happened-before B → counter(A) < counter(B)
- Causal relationships are preserved across all replicas

**5. Idempotence via Deduplication**

```javascript
operationId = hash(operation)
if (appliedOperations.has(operationId)) return; // Skip duplicate
```

Duplicate operations are automatically ignored.

**6. Causal Delivery via Buffering**

Operations with missing dependencies are buffered:

```javascript
if (!characters.has(op.leftId)) {
  pendingOperations.push(op);  // Buffer until dependency arrives
  return;
}
```

Once dependency arrives, buffered operations are applied in causal order.

---

## Example: Concurrent Insertion Resolution

```
Initial state: "AB"
- A: { opId: "1@user1", afterId: root, counter: 1 }
- B: { opId: "2@user1", afterId: "1@user1", counter: 2 }

Concurrent operations:
- User1 inserts 'X' between A and B
  → { opId: "3@user1", afterId: "1@user1", originRight: "2@user1", counter: 3 }

- User2 inserts 'Y' between A and B
  → { opId: "2@user2", afterId: "1@user1", originRight: "2@user1", counter: 2 }

YATA Resolution:
1. Both have afterId="1@user1" (siblings of A)
2. Both have originRight="2@user1" (want to insert before B)
3. Compare counters: 2 < 3
4. Y inserts before X

Final state on ALL peers: "AYXB"
```

**Why deterministic?**
- Same afterId → recognized as siblings
- Same originRight → same intent
- Counter comparison → total ordering
- All peers execute identical logic → converge

---

## Deletion: Tombstone Approach

Characters are never removed, only marked:

```javascript
delete(opId) {
  node.deleted = true;  // Preserve node for causal references
}

getText() {
  return sequence.filter(n => !n.deleted).map(n => n.char).join('');
}
```

**Why tombstones?**
- Future operations may reference deleted characters as `afterId`
- Formatting marks may anchor on deleted positions
- Preserves causal history for late-arriving operations

---

## Rich Text Formatting (Peritext Marks)

Marks use **op-sets** (anchor position tracking):

```javascript
mark = {
  markId: "5@user1",
  start: { opId: "2@user1", type: "after" },   // Start anchor
  end: { opId: "7@user1", type: "before" },    // End anchor
  markType: "bold",
  attributes: { fontWeight: 700 }
}
```

**Mark inheritance:** When inserting at position P, copy formatting from P's op-set.

**Mark boundaries:** Op-sets at mark endpoints prevent formatting from bleeding to adjacent text.

**Concurrent marks:** Last-write-wins based on Lamport counters in op-sets.

---

## Network Model

**Assumptions:**
- Eventually reliable delivery (messages may be delayed, duplicated, or reordered)
- No Byzantine failures
- Peer-to-peer or server-mediated topology

**Guarantees:**
- Operations can arrive in any order → buffering handles dependencies
- Duplicate operations → deduplication handles
- Network partitions → eventual consistency after healing

---

## Key Properties

| Property | Mechanism | Complexity |
|----------|-----------|------------|
| **Strong Eventual Consistency** | YATA + deterministic ordering | O(1) after all ops received |
| **Commutativity** | Pure function insertion | O(k) per insertion* |
| **Causality Preservation** | Lamport counters + buffering | O(1) counter update |
| **Conflict-Free** | No conflicts, only deterministic merges | Always succeeds |
| **Idempotence** | Operation deduplication | O(1) lookup |
| **Out-of-order Tolerance** | Dependency buffering | O(p) pending ops |

*k = number of concurrent siblings at insertion point (typically 1-3)

---

## Memory & Performance

**Space complexity:** O(n) where n = total characters inserted (including tombstones)

**Time complexity:**
- Insert: O(k) where k = siblings with same `afterId`
- Delete: O(1) tombstone marking
- getText: O(n) sequence traversal
- Serialize: O(n + m) where m = number of marks

**Network bandwidth:** ~40-60 bytes per character operation

**Typical case:** O(1) insertion when users type sequentially at different positions

**Worst case:** O(n) when all users insert at the exact same position (rare in practice)

---

## Comparison with OT (Operational Transformation)

| Aspect | CRDT (This) | OT |
|--------|-------------|-----|
| **Convergence** | Guaranteed by math | Requires correct transforms |
| **Central server** | Optional | Usually required |
| **Commutative** | Yes | No (order matters) |
| **Implementation** | Complex data structures | Complex transformation functions |
| **Peer-to-peer** | Natural | Difficult |
| **Undo** | Requires inverse ops | Natural |

---

## References

**Papers:**
- YATA: "Near Real-Time Peer-to-Peer Shared Editing on Extensible Data Types" (Nicolaescu et al., 2016)
- RGA: "Replicated abstract data types: Building blocks for collaborative applications" (Roh et al., 2011)
- Peritext: "Peritext: A CRDT for Collaborative Rich Text Editing" (Litt et al., 2022)
- CRDTs: "A comprehensive study of Convergent and Commutative Replicated Data Types" (Shapiro et al., 2011)

**Implementations:**
- Yjs: https://github.com/yjs/yjs
- Automerge: https://github.com/automerge/automerge

---

## Testing & Validation

**Tests covering:**
- Concurrent operations from multiple users
- Out-of-order delivery and buffering
- Deterministic ordering verification
- Serialization/deserialization cycles
- Convergence properties
- Integration with WebRTC


---

## Implementation Files

- `peritext-document.js` - Main CRDT logic
- `yata-sequence.js` - YATA insertion algorithm
- `crdt-helpers.js` - Utility functions
- `crdt-serializer.js` - State serialization