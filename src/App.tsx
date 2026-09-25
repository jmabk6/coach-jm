import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { ThemeController } from "./app/ThemeController";

export default function App() {
  return (
    <>
      <ThemeController />
      <RouterProvider router={router} />
    </>
  );
}
