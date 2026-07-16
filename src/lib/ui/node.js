export function createNode(type, props = {}, children = []) {
  return {
    type,
    props: props && typeof props === 'object' ? props : {},
    children: normalizeChildren(children),
  };
}

export function Text(value = '', props = {}) {
  return createNode('text', { ...props, value: String(value ?? '') }, []);
}

export function Box(props = {}, ...children) {
  return createNode('box', props, children);
}

export function Row(...children) {
  const props = isProps(children[0]) ? children.shift() : {};
  return createNode('row', props, children);
}

export function Column(...children) {
  const props = isProps(children[0]) ? children.shift() : {};
  return createNode('column', props, children);
}

export function Panel(title, ...children) {
  return Box({ border: true, padding: 1, title }, ...children);
}

export function PointerRegion(props = {}, ...children) {
  return createNode('pointerRegion', props, children);
}

export function normalizeChildren(children) {
  return children.flat(Infinity)
    .filter((child) => child !== null && child !== undefined && child !== false)
    .map((child) => typeof child === 'string' || typeof child === 'number' ? Text(String(child)) : child);
}

function isProps(value) {
  return value && typeof value === 'object' && typeof value.type !== 'string' && !Array.isArray(value);
}
