import type { Metadata } from "next";
import Worksheet from "@/components/Worksheet";

export const metadata: Metadata = {
  title: "留学プランニング・ワークシート",
};

export default function WorksheetPage() {
  return (
    <div className="min-h-dvh bg-worksheet-surface">
      <Worksheet />
    </div>
  );
}
