import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import { formatFr } from "../../domain/rules/dateFr";
import "./PlusScreen.css";

/** Plus > À propos (M11, lot L.5) : version de l'application et date de build. */
export function AboutScreen({ version = __APP_VERSION__, buildTime = __BUILD_TIME__ }: { version?: string; buildTime?: string }) {
  return (
    <section className="plus-screen">
      <header className="plus-subscreen__nav">
        <Link to={paths.plus()} className="plus-subscreen__back">
          <ChevronLeft size={18} aria-hidden="true" /> Plus
        </Link>
        <h1>À propos</h1>
        <span />
      </header>

      <dl className="plus-about">
        <div>
          <dt>Application</dt>
          <dd>Coach JM</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{version}</dd>
        </div>
        <div>
          <dt>Build</dt>
          <dd>{formatFr(new Date(buildTime), "d MMMM yyyy 'à' HH:mm")}</dd>
        </div>
      </dl>
    </section>
  );
}
