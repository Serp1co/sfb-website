import { renderServicePage, serviceMetadata, serviceStaticParams, type ServiceRouteProps } from "../../../../views/service-route";

export const dynamicParams = false;

export function generateStaticParams() {
  return serviceStaticParams();
}

export function generateMetadata(props: ServiceRouteProps) {
  return serviceMetadata("it", props);
}

export default function Page(props: ServiceRouteProps) {
  return renderServicePage("it", props);
}
