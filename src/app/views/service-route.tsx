import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { SERVICE_SLUGS, isServiceSlug } from "../data/site-data";
import { getDictionary } from "../i18n/get-dictionary";
import { fmt, type Locale } from "../i18n/locales";
import ServicePage from "./service-page";

/** Shared by the English and Italian `services/[slug]` routes. */
export interface ServiceRouteProps {
  params: Promise<{ slug: string }>;
}

export function serviceStaticParams(): { slug: string }[] {
  return SERVICE_SLUGS.map((slug) => ({ slug }));
}

export async function serviceMetadata(locale: Locale, { params }: ServiceRouteProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isServiceSlug(slug)) return {};
  const dict = getDictionary(locale);
  const practice = dict.practices[slug];
  return {
    title: fmt(dict.meta.serviceTitle, { practice: practice.title }),
    description: practice.summary,
  };
}

export async function renderServicePage(locale: Locale, { params }: ServiceRouteProps): Promise<JSX.Element> {
  const { slug } = await params;
  if (!isServiceSlug(slug)) notFound();
  return <ServicePage locale={locale} slug={slug} />;
}
