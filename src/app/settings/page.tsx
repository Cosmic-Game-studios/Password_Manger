import type { Metadata } from "next";
import SettingsClient from "./settingsClient";

export const metadata: Metadata = {
  title: "Vaultlight | Settings",
  description:
    "Adjust Vaultlight default security, password generation, and privacy preferences from anywhere.",
};

export default function SettingsPage() {
  return <SettingsClient />;
}
