import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

/** En-tête des écrans Corps : retour, titre centré. */
export function BodyNav({ back, backLabel, title }: { back: string; backLabel: string; title: string }) {
  return (
    <header className="body-screen__nav">
      <Link to={back} className="body-screen__back">
        <ChevronLeft size={18} aria-hidden="true" /> {backLabel}
      </Link>
      <h1>{title}</h1>
      <span />
    </header>
  );
}
