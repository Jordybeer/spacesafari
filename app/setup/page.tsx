import type { Metadata } from "next";
import SetupClient from "./SetupClient";

export const metadata: Metadata = {
  title: "Telegram setup · Space Safari",
  robots: { index: false, follow: false },
};

export default function SetupPage() {
  return <SetupClient />;
}
