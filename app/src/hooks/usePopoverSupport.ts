import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;
const getServerSnapshot = () => true;

export function usePopoverSupport() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
