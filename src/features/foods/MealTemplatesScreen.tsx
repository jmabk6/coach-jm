import { useEffect, useState } from "react";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EllipsisVertical, GripVertical } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { paths } from "../../app/paths";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { archiveMealTemplate, getFoods, getMealTemplates, reactivateMealTemplate, reorderMealTemplates } from "../../db/repositories/nutritionRepository";
import type { Food, Id, MealTemplate } from "../../domain";
import { moveId, templateHealth } from "../../domain/rules/mealTemplateRules";
import { formatKcal, MEAL_SLOT_LABELS } from "../../domain/rules/nutritionRules";
import { BodyNav } from "../body/BodyNav";
import "./foods.css";

/** « Déjeuner · 2 aliments · 509 kcal » ; kcal actuelles seulement si tout est prêt. */
function summaryOf(template: MealTemplate, foods: ReadonlyMap<Id, Food>): { meta: string; problems: number } {
  const health = templateHealth(template, foods);
  const count = template.items.length;
  const parts = [
    ...(template.defaultSlot ? [MEAL_SLOT_LABELS[template.defaultSlot]] : []),
    `${count} aliment${count > 1 ? "s" : ""}`,
    ...(health.kcal !== undefined ? [formatKcal(health.kcal)] : []),
  ];
  return { meta: parts.join(" · "), problems: health.problems };
}

function SortableRow({ template, foods, onMenu }: { template: MealTemplate; foods: ReadonlyMap<Id, Food>; onMenu: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: template.id });
  const { meta, problems } = summaryOf(template, foods);
  return (
    <li
      ref={setNodeRef}
      aria-label={template.name}
      className={`template-row${isDragging ? " template-row--dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button type="button" className="template-row__handle" aria-label={`Déplacer ${template.name}`} {...attributes} {...listeners}>
        <GripVertical size={20} aria-hidden="true" />
      </button>
      <Link to={paths.plusMealTemplate(template.id)} className="template-row__link">
        <span className="food-row__name">{template.name}</span>
        <span className="food-row__meta">{meta}</span>
        {problems > 0 && <span className="template-row__problem">{`⚠ ${problems} aliment${problems > 1 ? "s" : ""} à corriger`}</span>}
      </Link>
      <button type="button" className="template-row__menu" aria-label={`Actions : ${template.name}`} onClick={onMenu}>
        <EllipsisVertical size={20} aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Plus › Repas favoris (phase 3A.4b) : la liste compacte, dans l'ordre
 * (poignée ⠿, comme Séances), avec les kcal actuelles des aliments
 * (jamais stockées) ou un signal s'il faut corriger ; ⋯ › Modifier ou
 * Archiver (immédiat, « Annuler » remet le repas à sa place) ; les
 * archivés repliés, réactivables en fin de liste.
 */
export function MealTemplatesScreen() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<MealTemplate[]>();
  const [foods, setFoods] = useState<ReadonlyMap<Id, Food>>(new Map());
  const [version, setVersion] = useState(0);
  const [menu, setMenu] = useState<MealTemplate>();
  const [showArchived, setShowArchived] = useState(false);
  const [notice, setNotice] = useState<{ text: string; undoId?: Id }>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getMealTemplates({ includeArchived: true }), getFoods({ includeArchived: true })]).then(([loaded, library]) => {
      if (cancelled) return;
      setTemplates(loaded);
      setFoods(new Map(library.map((food) => [food.id, food])));
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = () => setVersion((value) => value + 1);
  const now = () => new Date().toISOString();
  if (!templates) return <section className="food-screen"><p>Chargement…</p></section>;

  const active = templates.filter((template) => template.status === "active");
  const archived = templates.filter((template) => template.status === "archived");

  async function archive(template: MealTemplate) {
    setMenu(undefined);
    await archiveMealTemplate(template.id, now());
    setNotice({ text: "Repas favori archivé", undoId: template.id });
    reload();
  }

  async function undo(id: Id) {
    await reactivateMealTemplate(id, now(), { keepPosition: true });
    setNotice(undefined);
    reload();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const ids = moveId(active.map((template) => template.id), String(dragged.id), String(over.id));
    /* Affichage aussitôt dans le nouvel ordre, puis écriture en une transaction. */
    setTemplates([...ids.map((id, index) => ({ ...active.find((template) => template.id === id)!, position: index })), ...archived]);
    try {
      await reorderMealTemplates(ids, now());
    } catch (caught) {
      setNotice({ text: caught instanceof Error ? caught.message : String(caught) });
    }
    reload();
  }

  return (
    <section className="food-screen">
      <BodyNav back={paths.plus()} backLabel="Plus" title="Repas favoris" />
      <div className="food-picker__actions">
        <Link to={paths.plusMealTemplateNew()} className="food-picker__action">
          + Nouveau repas favori
        </Link>
      </div>

      {notice && (
        <p className="template-notice" role="status">
          <span>{notice.text}</span>
          {notice.undoId && (
            <button type="button" onClick={() => void undo(notice.undoId!)}>
              Annuler
            </button>
          )}
        </p>
      )}

      {active.length === 0 ? (
        <p className="food-screen__note">Aucun repas favori. Crée-le ici, ou depuis le Journal avec ••• › Enregistrer comme repas favori.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)}>
          <SortableContext items={active.map((template) => template.id)} strategy={verticalListSortingStrategy}>
            <ul className="template-list" aria-label="Repas favoris">
              {active.map((template) => (
                <SortableRow key={template.id} template={template} foods={foods} onMenu={() => setMenu(template)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {archived.length > 0 && (
        <button type="button" className="food-screen__toggle" aria-expanded={showArchived} onClick={() => setShowArchived((open) => !open)}>
          {`Repas favoris archivés (${archived.length})`}
        </button>
      )}
      {showArchived && archived.length > 0 && (
        <ul className="food-list food-list--archived" aria-label="Repas favoris archivés">
          {archived.map((template) => (
            <li key={template.id} className="food-list__item">
              <Link to={paths.plusMealTemplate(template.id)} className="food-list__link">
                <span className="food-row__name">{template.name}</span>
                <span className="food-row__meta">{summaryOf(template, foods).meta}</span>
              </Link>
              <button
                type="button"
                className="food-list__reactivate"
                aria-label={`Réactiver : ${template.name}`}
                onClick={() => void reactivateMealTemplate(template.id, now()).then(() => {
                  setNotice(undefined);
                  reload();
                })}
              >
                Réactiver
              </button>
            </li>
          ))}
        </ul>
      )}

      {menu && (
        <BottomSheet
          title={menu.name}
          actions={[
            { label: "Modifier", onSelect: () => navigate(paths.plusMealTemplate(menu.id)) },
            { label: "Archiver", hint: "Retiré des propositions ; réactivable", onSelect: () => void archive(menu) },
          ]}
          onDismiss={() => setMenu(undefined)}
        />
      )}
    </section>
  );
}
