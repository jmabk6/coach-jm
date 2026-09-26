import { splitSessionName } from "./splitSessionName";
import "./SessionName.css";

/**
 * Nom d'une séance affiché en titre : ligne 1 en gras (« Muscu A »),
 * ligne 2 plus petite (« Traction force / dos »). Le conteneur garde sa
 * propre classe (taille, graisse) ; seule la seconde ligne est stylée ici.
 */
export function SessionName({ name, suffix }: { name: string; suffix?: string }) {
  const { main, sub } = splitSessionName(name);
  return (
    <>
      <span className="session-name__main">
        {main}
        {suffix}
      </span>
      {sub && <span className="session-name__sub">{sub}</span>}
    </>
  );
}
