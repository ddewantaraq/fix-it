import { useMemo } from "react";
import { getOwnerKey } from "../api";

export function useOwnerKey() {
  return useMemo(() => getOwnerKey(), []);
}
