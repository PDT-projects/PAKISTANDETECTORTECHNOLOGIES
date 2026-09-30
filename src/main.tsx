
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { router } from "./routes";
import { AuthProvider } from "./providers/context/AuthContext";
import { CurrencyProvider } from "./providers/context/CurrencyContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <CurrencyProvider>
      <Toaster position="top-right" richColors />
      <RouterProvider router={router} />
    </CurrencyProvider>
  </AuthProvider>
);
