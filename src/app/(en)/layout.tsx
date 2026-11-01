import type { Metadata } from "next";
import type { ReactNode } from "react";
import RootShell from "../layout/root-shell";
import { getDictionary } from "../i18n/get-dictionary";

const { meta } = getDictionary("en");

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
};

export default function EnglishLayout({ children }: { children: ReactNode }) {
  return <RootShell locale="en">{children}</RootShell>;
}
