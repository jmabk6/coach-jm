import { CalendarDays, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import { getSetting } from "../../db/repositories/settingsRepository";
import type { TestCycleSettings } from "../../domain";
import { formatWeekRange } from "../../domain/rules/programRules";
import { daysUntilNextTestWeek, nextTestWeekStart } from "../../domain/rules/testCycleRules";
import "./TestWeekBanner.css";

/**
 * « Semaine de tests dans N jours » ou « Semaine de tests » (CT § 2.8) :
 * la même formulation sur l'Accueil (M1) et dans la liste des Objectifs
 * (M4). Ouvre cette semaine dans le Planning.
 */
export function TestWeekBanner({ today, cycle: given }: { today: string; cycle?: TestCycleSettings }) {
  const [loaded, setLoaded] = useState<TestCycleSettings>();
  const cycle = given ?? loaded;

  useEffect(() => {
    if (given) return;
    let cancelled = false;
    void getSetting("testCycle").then((value) => {
      if (!cancelled && value) setLoaded(value);
    });
    return () => {
      cancelled = true;
    };
  }, [given]);

  if (!cycle) return null;
  const weekStart = nextTestWeekStart(today, cycle);
  const days = daysUntilNextTestWeek(today, cycle);

  return (
    <Link to={paths.planning({ date: weekStart })} className="test-week-banner">
      <CalendarDays size={20} strokeWidth={2} aria-hidden="true" />
      <span>
        <strong>Semaine de tests{days > 0 ? ` dans ${days} jour${days > 1 ? "s" : ""}` : ""}</strong>
        <br />
        {formatWeekRange(weekStart)}
      </span>
      <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
    </Link>
  );
}
