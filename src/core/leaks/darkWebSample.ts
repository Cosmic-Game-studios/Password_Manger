export interface DarkWebSampleEntry {
  hash: string;
  description: string;
  source: string;
  severity: "medium" | "high";
  matches?: number;
}

export const DARK_WEB_SAMPLE: DarkWebSampleEntry[] = [
  {
    hash: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92",
    description: "Kompromittiertes Passwort in mehreren Foren-Dumps (2023)",
    source: "Foren Sammel-Leak",
    severity: "high",
  },
  {
    hash: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    description: "Pwned Passwort Datenbank, mehrfach bestätigt",
    source: "Credential Stuffing Listen",
    severity: "high",
  },
  {
    hash: "1c8bfe8f801d79745c4631d09fff36c82aa37fc4cce4fc946683d7b336b63032",
    description: "Darknet Marktplatz Konto-Dump (2022)",
    source: "Darknet Leak Sammlungen",
    severity: "medium",
  },
  {
    hash: "daaad6e5604e8e17bd9f108d91e26afe6281dac8fda0091040a7a6d7bd9b43b5",
    description: "Botnet Konfigurations-Dateien Leak (2021)",
    source: "Credential Harvesting",
    severity: "medium",
  },
  {
    hash: "034c0f8ac5ab8ef39e1c25af63b4f8d40e9488ebb5ff03af3c583b4e4db2aa3d",
    description: "Enterprise Ransomware Leak (2023)",
    source: "Ransomware Crew Veröffentlichung",
    severity: "high",
  },
  {
    hash: "985b66f7e25119a300c4f32772c50631da4c0db7a5752a9fd44ed523fc5ec34f",
    description: "Kompromittierte Urlaubsportal-Datenbank",
    source: "Dark Web Reise-Community",
    severity: "medium",
  },
];
