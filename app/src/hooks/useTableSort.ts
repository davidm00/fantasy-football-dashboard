import { useSearchParams } from "react-router";
import type { SortDirection } from "../components/shared/SortHeader";

type SortValue = number | string | null | undefined;
export type SortColumn<Row> = {
  value: (row: Row) => SortValue;
  direction?: SortDirection;
};

export function compareTableValues(left: SortValue, right: SortValue, direction: SortDirection) {
  if (left == null) return right == null ? 0 : 1;
  if (right == null) return -1;
  const comparison = typeof left === "number" && typeof right === "number"
    ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true });
  return comparison * (direction === "descending" ? -1 : 1);
}

export function useTableSort<Row>(
  rows: Row[],
  columns: Record<string, SortColumn<Row>>,
  defaultSort: { key: string; direction: SortDirection },
  id: string,
) {
  const [params, setParams] = useSearchParams();
  const sortParam = id ? `${id}Sort` : "sort";
  const orderParam = id ? `${id}Order` : "order";
  const requested = params.get(sortParam);
  const key = requested && Object.hasOwn(columns, requested) ? requested : defaultSort.key;
  const direction = params.get(orderParam) === "ascending" ? "ascending"
    : params.get(orderParam) === "descending" ? "descending"
    : key === defaultSort.key ? defaultSort.direction : columns[key].direction ?? "ascending";
  const setSort = (nextKey: string, nextDirection?: SortDirection) => {
    const next = new URLSearchParams(params);
    next.set(sortParam, nextKey);
    next.set(orderParam, nextDirection ?? columns[nextKey].direction ?? "ascending");
    setParams(next, { flushSync: true, preventScrollReset: true });
  };
  const reset = () => {
    const next = new URLSearchParams(params);
    next.delete(sortParam);
    next.delete(orderParam);
    setParams(next, { flushSync: true, preventScrollReset: true });
  };
  return {
    rows: [...rows].sort((a, b) => compareTableValues(columns[key].value(a), columns[key].value(b), direction)),
    key, direction, setSort, reset,
    isDefault: key === defaultSort.key && direction === defaultSort.direction,
    onSort: (nextKey: string) => setSort(nextKey, nextKey === key
      ? direction === "descending" ? "ascending" : "descending"
      : columns[nextKey].direction ?? "ascending"),
  };
}
