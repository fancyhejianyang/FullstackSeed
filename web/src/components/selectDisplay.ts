export function resolveSelectDisplayValue(
  opened: boolean,
  filterable: boolean,
  searchValue: string,
  selectedText: string,
) {
  return opened && filterable ? searchValue : selectedText;
}
