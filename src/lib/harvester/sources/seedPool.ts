// src/lib/harvester/sources/seedPool.ts

const MASTER_GLOBAL_DIRECTORY: Record<string, string[]> = {
  car: [
    "https://www.yellowpages.com/los-angeles-ca/auto-repair-services",
    "https://www.yellowpages.com/houston-tx/auto-detail",
    "https://www.hotfrog.com/search/us/auto-repair",
    "https://www.manta.com/mb_34_B7_000/auto_repair_services",
    "https://www.merchantcircle.com/find/auto-repair-service-near-me",
    "https://www.yellowpages.com/chicago-il/auto-repair",
    "https://www.yellowpages.com/phoenix-az/auto-body-shops"
  ],
  dental: [
    "https://www.yellowpages.com/chicago-il/dentists",
    "https://www.yellowpages.com/dallas-tx/cosmetic-dentists",
    "https://www.manta.com/mb_35_E2260000/dentists",
    "https://www.superpages.com/search/dentists",
    "https://www.yellowpages.com/new-york-ny/dentists",
    "https://www.hotfrog.com/search/us/dentist"
  ],
  gym: [
    "https://www.yellowpages.com/miami-fl/gyms",
    "https://www.yellowpages.com/atlanta-ga/fitness-centers",
    "https://www.manta.com/mb_35_E0_000/gymnastic_clubs_fitness_centers",
    "https://www.hotfrog.com/search/us/fitness-trainers",
    "https://www.yellowpages.com/houston-tx/gyms"
  ],
  roof: [
    "https://www.yellowpages.com/phoenix-az/roofing-contractors",
    "https://www.yellowpages.com/orlando-fl/roof-repair",
    "https://www.manta.com/mb_34_B2070_000/roofing_contractors",
    "https://www.hotfrog.com/search/us/roofing",
    "https://www.yellowpages.com/dallas-tx/roofing"
  ],
  restaurant: [
    "https://www.yellowpages.com/new-york-ny/restaurants",
    "https://www.yellowpages.com/san-francisco-ca/cafes",
    "https://www.manta.com/mb_35_E3100000/restaurants",
    "https://www.hotfrog.com/search/us/restaurants"
  ]
};

export function getSeedDomains(niche: string, country: string, pageIndex: number = 0): string[] {
  const cleanNiche = niche.toLowerCase();
  let selectedList = MASTER_GLOBAL_DIRECTORY.car;

  if (cleanNiche.includes("dental") || cleanNiche.includes("doctor")) {
    selectedList = MASTER_GLOBAL_DIRECTORY.dental;
  } else if (cleanNiche.includes("gym") || cleanNiche.includes("fitness")) {
    selectedList = MASTER_GLOBAL_DIRECTORY.gym;
  } else if (cleanNiche.includes("roof") || cleanNiche.includes("solar")) {
    selectedList = MASTER_GLOBAL_DIRECTORY.roof;
  } else if (cleanNiche.includes("restaurant") || cleanNiche.includes("cafe")) {
    selectedList = MASTER_GLOBAL_DIRECTORY.restaurant;
  }

  // ⚡ 3-3 लिंक्स को रोटेट करें ताकि बार-बार वही 5 लिंक न दोहराए जाएं
  const chunkSize = 3;
  const start = (pageIndex * chunkSize) % selectedList.length;
  return selectedList.slice(start, start + chunkSize);
}