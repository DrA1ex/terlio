# Pointer metadata isolation

Interactive regions are layout metadata. They never share the rendered text channel.

## Structured regions

`PointerRegion`, pointer-enabled boxes and other interactive components produce structured row segments:

```js
{
  token: 3,
  parentToken: 1,
  id: 'history',
  segments: [
    { x: 2, y: 4, width: 28, height: 1 },
    { x: 2, y: 5, width: 28, height: 1 },
  ],
  bounds: { x: 2, y: 4, width: 28, height: 2 },
}
```

Wrapping, rows, columns, bordered boxes, clipping, scrolling and overlays transform these coordinates directly. No private CSI sequence is inserted into component text and no marker parser runs over rendered lines.

Legacy marker-shaped text is ordinary terminal text. Under the default safe terminal policy it cannot create, resize, replace or invoke a pointer region.

## Hit-testing and overlays

Regions retain their layout order. Hit-testing walks the list from the end, so a non-modal overlay wins only in the cells it covers while the background remains interactive elsewhere.

Blocking overlays remove background regions from the composed layout result. Pointer blocking is structural rather than dependent on text, guessed tokens or screen contents.

Nested regions retain a validated parent token for bubbling and pointer capture. Invalid, duplicate, self-referential or unknown final-frame tokens are rejected or detached without throwing. Cyclic metadata cannot trap event routing.

## Geometry validation

Final frames accept only regions with:

- a positive safe-integer token;
- at least one finite integer row segment;
- positive segment width;
- one-cell segment height;
- geometry that intersects the frame viewport.

Bounds are recomputed from validated segments instead of trusting caller-provided values. Invalid regions do not enable mouse reporting and cannot participate in hit-testing.

Pointer coordinates need only be finite safe integers. They do not index an allocation, so Terlio does not impose an arbitrary maximum coordinate.

## Optional region cap

Pointer regions are created by application code, not displayed text, so the default count is unlimited. Large applications can opt into an operational cap:

```js
createTerminalPolicy({
  limits: {
    pointerRegions: 10000,
  },
});
```

With an explicit cap, the layout stops registering additional regions while continuing to render visible content. Directly created frames enforce the same configured cap.
