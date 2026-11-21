import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ResourceReferenceProvider } from "@/components/resource-reference"
import { ThemeProvider } from "@/components/theme-provider.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ResourceReferenceProvider>
        <App />
      </ResourceReferenceProvider>
    </ThemeProvider>
  </StrictMode>
)
