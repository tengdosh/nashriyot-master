// Product 360° tabs (spec v1 §5.1 + v2 §6-M2). For EXTERNAL titles the editions
// (NASHRLAR) and cost (Xarajatlar) tabs are hidden — only trade data is shown.

export const TITLE_TABS = [
  { key: "umumiy", label: "Umumiy" },
  { key: "nashrlar", label: "Nashrlar" },
  { key: "formatlar", label: "Formatlar" },
  { key: "hissadorlar", label: "Hissadorlar" },
  { key: "metadata", label: "Metaʼmaʼlumot" },
  { key: "annotatsiya", label: "Annotatsiya" },
  { key: "onix", label: "ONIX" },
  { key: "xarajatlar", label: "Xarajatlar" },
  { key: "tarix", label: "Tarix" },
] as const;

export type TitleTabKey = (typeof TITLE_TABS)[number]["key"];

const EXTERNAL_HIDDEN: TitleTabKey[] = ["nashrlar", "xarajatlar"];

export function visibleTabs(ownerType: "OWN" | "EXTERNAL") {
  if (ownerType === "EXTERNAL") {
    return TITLE_TABS.filter((t) => !EXTERNAL_HIDDEN.includes(t.key));
  }
  return [...TITLE_TABS];
}
