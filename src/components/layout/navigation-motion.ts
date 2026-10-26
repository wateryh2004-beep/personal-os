import { navigationItemForPath, navigationRegistry } from "@/lib/navigation-registry";

/** Direction follows the visible navigation order, never an invented history. */
export function navigationTransitionType(from: string, to: string): "navigation-forward" | "navigation-backward" | null {
  const source = navigationItemForPath(from.split(/[?#]/, 1)[0]);
  const destination = navigationItemForPath(to.split(/[?#]/, 1)[0]);
  if (!source || !destination || source === destination) return null;
  return navigationRegistry.indexOf(destination) > navigationRegistry.indexOf(source) ? "navigation-forward" : "navigation-backward";
}
