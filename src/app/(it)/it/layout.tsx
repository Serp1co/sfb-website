import type { Metadata } from "next";
import type { ReactNode } from "react";
import RootShell from "../../layout/root-shell";
import { getDictionary } from "../../i18n/get-dictionary";

const { meta } = getDictionary("it");

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
};

export default function ItalianLayout({ children }: { children: ReactNode }) {
  return <RootShell locale="it">{children}</RootShell>;
}
