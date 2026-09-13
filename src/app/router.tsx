import { createHashRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { Screen } from "./Screen";

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Screen title="Aujourd'hui" /> },
      { path: "programme", element: <Screen title="Programme" /> },
      { path: "progression", element: <Screen title="Progression" /> },
      { path: "plus", element: <Screen title="Plus" /> },
    ],
  },
]);
