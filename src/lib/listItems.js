export const PRESENTATION_LIST_KINDS = Object.freeze(['heading', 'stat', 'separator']);

export function getListItemKind(item, index = 0, getKind = null) {
  const value = typeof getKind === 'function' ? getKind(item, index) : item?.kind;
  const kind = String(value ?? 'item').trim().toLowerCase();
  return kind || 'item';
}

export function isPresentationListItem(item, index = 0, getKind = null) {
  return PRESENTATION_LIST_KINDS.includes(getListItemKind(item, index, getKind));
}

export function isSelectableListItem(item, index = 0, getKind = null) {
  return !isPresentationListItem(item, index, getKind);
}
