import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Guard against dual-mount: manus-runtime may have already mounted an older
// React tree on #root. Replace the element to clear stale event listeners.
const oldRoot = document.getElementById("root")!;
const freshRoot = document.createElement("div");
freshRoot.id = "root";
oldRoot.parentNode!.replaceChild(freshRoot, oldRoot);

createRoot(freshRoot).render(<App />);
