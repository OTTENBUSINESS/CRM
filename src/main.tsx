import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { patchAudioWorkletForWavoip } from "./lib/wavoip-init";

// Aplica patch no AudioWorklet antes de qualquer import do SDK WaVoIP rodar.
patchAudioWorkletForWavoip();

createRoot(document.getElementById("root")!).render(<App />);
