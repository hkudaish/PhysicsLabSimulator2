# Apparatus interaction: current scope

## Implemented

- Selecting a circuit component reports its current model type, value, state, and grid terminal coordinates. Multi-terminal logic devices, transistors, and relays use the endpoint layout defined by the circuit model.
- Selecting a chemistry apparatus reports its catalog description and current position/orientation.
- A selected object can be inspected with a second click, right-click/context menu, or a stationary long press. The inspector is keyboard accessible and can be dismissed.
- The inspector reuses existing click-to-place move, rotate, delete, and undo controls rather than introducing a second mutation path. It temporarily hides while awaiting a move destination. Circuit orientation reversal is explicitly a 180-degree rotation.
- Terminal names are neutral A/B/C/D labels. The interface does not infer polarity from a part icon or from undocumented conventions.
- Chemistry apparatus placement, movement, rotation, and removal are persisted locally under a versioned schema. Up to 30 apparatus edits can be undone/redone with the inspector, persistent toolbar buttons, or `Ctrl+Z` / `Ctrl+Y` while in the chemistry lab.
- Persisted records use stable catalog English IDs, world position, orientation, and burner on/off state. Experiment contents, chemistry measurements, circuit state, and audio preferences are not part of this persistence format.
- Selected chemistry apparatus and circuit components can be dragged directly on the rendered stage. Chemistry drops are bounded to the table and avoid collisions; circuit drops are routed through the builder's existing move tool.
- Apparatus and circuit-part labels are projected from their current scene positions and follow camera movement. Circuit state (parts, wire endpoints, values, switch states, and orientation) is saved locally under a separate versioned schema.

## Acceptance checks

- Circuit terminal coordinates agree with the model's four direction vectors.
- Relay and three-terminal device contacts are listed at their modelled grid locations.
- Invalid part coordinates do not produce fabricated terminals.
- Existing simulator controls remain the source of truth for mutations and circuit undo.
- On touch, an already-selected object can open its inspector with a stationary long press.
- Supported chemistry apparatus survive a page reload with their saved position and orientation.
- Apparatus undo/redo restores the prior/next placement state and saved state.
- Circuit parts and wires persist across page reloads, and malformed or out-of-range snapshots are rejected.
- Dragging a selected chemistry tool never moves it outside the table or overlaps another tool; canceling a drag leaves its prior position unchanged.
- Dragging a selected circuit part uses the builder's native move behavior; wire endpoints and electrical model state remain unchanged.
- Scene labels follow their objects after camera movement and disappear when their objects or lab view are no longer active.
- Unknown tool IDs, out-of-bounds positions, overlapping saved entries, and unsupported schema versions are rejected.

Automated coverage is in `../tests/object-interaction.test.js`.

## Deferred work

The current simulator does not expose a unified object capability API. Apparatus material/failure models and a complete undoable interaction history for both labs still require additional public scene/model APIs. Electrical polarity is intentionally not displayed until the legacy model's polarity convention is explicitly exposed and verified.
