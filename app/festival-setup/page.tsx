import type { Metadata } from "next";
import FestivalSetupClient from "./FestivalSetupClient";

export const metadata: Metadata = {
  title: "Festival voorbereiden · Space Safari",
  description: "Plan een festivalkaart en GPS-ankers vooraf.",
};

export default function FestivalSetupPage() {
  return <FestivalSetupClient />;
}
