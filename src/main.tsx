import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { applyDocumentLang } from "./lib/locale"
import { applyMicaDocument } from "./lib/mica"
import "./index.css"

applyDocumentLang()
void window.stackferry?.getMicaState().then((state) => {
  applyMicaDocument(state.enabled)
})

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
