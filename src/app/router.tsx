import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./AppShell";

function Screen({ title }: { title: string }) {
  return (
    <section>
      <h1>{title}</h1>
    </section>
  );
}

export const router = createBrowserRouter([
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
