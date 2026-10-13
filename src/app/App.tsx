import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AuthProvider } from "./context/AuthContext";
import { ErpDataProvider } from "./context/ErpDataContext";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  return (
    <AuthProvider>
      <ErpDataProvider><RouterProvider router={router} /></ErpDataProvider>
      <Toaster />
    </AuthProvider>
  );
}
