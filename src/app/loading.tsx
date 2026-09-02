import { StatePanel } from "@/components/ui/StatePanel";
import { getDictionary } from "@/i18n/translations";
export default function Loading() { return <StatePanel title={getDictionary("en").states.loadingTitle} busy />; }
