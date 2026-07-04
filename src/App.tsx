/**
 * App wrapper — mounts the original npm-package App verbatim, then overlays
 * the additive V15 controls (toggle + calibration) as a floating panel.
 *
 * The original app is a black box: nothing here modifies it. When the V15
 * toggle is OFF (default), the original app runs exactly as before.
 */
import OriginalApp from "./BaseApp";
import { V15Overlay } from "./components/V15Overlay";

export default function App() {
  return (
    <>
      <OriginalApp />
      <V15Overlay />
    </>
  );
}
