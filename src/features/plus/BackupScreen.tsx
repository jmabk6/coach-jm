import { ChevronLeft, History } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import { db } from "../../db/database";
import { formatFr } from "../../domain/rules/dateFr";
import { BackupSection } from "../backup/BackupSection";
import { DataResetSection } from "../backup/DataResetSection";
import { getLastExport } from "../backup/lastExport";
import "./PlusScreen.css";

/**
 * Plus > Sauvegarde (M11, lot L.4) : exporter, importer (parcours export →
 * effacement → import), effacer (double confirmation, export proposé
 * avant), et la date du dernier export fait depuis cet appareil.
 */
export function BackupScreen() {
  const [lastExport, setLastExport] = useState(getLastExport);

  return (
    <section className="plus-screen">
      <header className="plus-subscreen__nav">
        <Link to={paths.plus()} className="plus-subscreen__back">
          <ChevronLeft size={18} aria-hidden="true" /> Plus
        </Link>
        <h1>Sauvegarde</h1>
        <span />
      </header>

      <p className="plus-note" aria-label="Dernier export">
        <History size={18} aria-hidden="true" />
        <span>
          {lastExport
            ? `Dernier export depuis cet appareil : ${formatFr(new Date(lastExport), "EEEE d MMMM yyyy 'à' HH:mm")}.`
            : "Aucun export depuis cet appareil."}{" "}
          Faites vérifier l'empreinte du fichier sur le PC : c'est elle qui valide la sauvegarde.
        </span>
      </p>

      <h2 className="plus-screen__section">Exporter</h2>
      <div className="plus-list">
        <BackupSection database={db} onExported={(at) => setLastExport(at.toISOString())} />
      </div>

      <h2 className="plus-screen__section">Importer ou effacer</h2>
      <DataResetSection database={db} />
    </section>
  );
}
