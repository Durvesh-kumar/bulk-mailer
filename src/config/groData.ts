export interface CountryGeo {
  name: string;
  code: string;
  regions: string[];
}

export const GEO_DIRECTORY: Record<string, CountryGeo> = {
  USA: {
    name: "United States",
    code: "USA",
    regions: [
      "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
      "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
      "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
      "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
      "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
      "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
      "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
      "Wisconsin", "Wyoming", "District of Columbia", "Puerto Rico", "Guam", "Virgin Islands"
    ],
  },
  Canada: {
    name: "Canada",
    code: "Canada",
    regions: [
      "Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador",
      "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan",
      "Northwest Territories", "Nunavut", "Yukon"
    ],
  },
  Australia: {
    name: "Australia",
    code: "Australia",
    regions: [
      "New South Wales", "Victoria", "Queensland", "Western Australia",
      "South Australia", "Tasmania", "Australian Capital Territory", "Northern Territory"
    ],
  },
  UK: {
    name: "United Kingdom",
    code: "UK",
    regions: [
      "Greater London", "West Midlands", "Greater Manchester", "West Yorkshire", "Kent",
      "Essex", "Hampshire", "Surrey", "Lancashire", "Merseyside", "South Yorkshire",
      "Devon", "Norfolk", "Suffolk", "Somerset", "Cambridgeshire", "Cheshire", "North Yorkshire",
      "Staffordshire", "Derbyshire", "Nottinghamshire", "Hertfordshire", "Gloucestershire",
      "Berkshire", "Warwickshire", "Northamptonshire", "Dorset", "Oxfordshire", "East Sussex",
      "West Sussex", "Wiltshire", "Cornwall", "Bedfordshire", "Buckinghamshire", "Cumbria",
      "Durham", "East Riding of Yorkshire", "Herefordshire", "Isle of Wight", "Leicestershire",
      "Lincolnshire", "Northumberland", "Rutland", "Shropshire", "Tyne and Wear", "Worcestershire",
      "Scotland", "Wales", "Northern Ireland"
    ],
  },
  UAE: {
    name: "United Arab Emirates",
    code: "UAE",
    regions: [
      "Dubai", "Abu Dhabi", "Sharjah", "Ajman",
      "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"
    ],
  },
  SaudiArabia: {
    name: "Saudi Arabia",
    code: "Saudi Arabia",
    regions: [
      "Riyadh", "Makkah", "Eastern Province", "Madinah", "Al Baha",
      "Al Jawf", "Al Qassim", "Asir", "Hail", "Jazan",
      "Najran", "Northern Borders", "Tabuk"
    ],
  },
  Germany: {
    name: "Germany",
    code: "Germany",
    regions: [
      "Baden-Wurttemberg", "Bavaria", "Berlin", "Brandenburg", "Bremen",
      "Hamburg", "Hesse", "Lower Saxony", "Mecklenburg-Vorpommern",
      "North Rhine-Westphalia", "Rhineland-Palatinate", "Saarland",
      "Saxony", "Saxony-Anhalt", "Schleswig-Holstein", "Thuringia"
    ],
  },
  France: {
    name: "France",
    code: "France",
    regions: [
      "Auvergne-Rhone-Alpes", "Bourgogne-Franche-Comte", "Brittany", "Centre-Val de Loire",
      "Corsica", "Grand Est", "Hauts-de-France", "Ile-de-France", "Normandy",
      "Nouvelle-Aquitaine", "Occitanie", "Pays de la Loire", "Provence-Alpes-Cote d'Azur"
    ],
  },
  Ireland: {
    name: "Ireland",
    code: "Ireland",
    regions: [
      "Carlow", "Cavan", "Clare", "Cork", "Donegal", "Dublin", "Galway", "Kerry",
      "Kildare", "Kilkenny", "Laois", "Leitrim", "Limerick", "Longford", "Louth",
      "Mayo", "Meath", "Monaghan", "Offaly", "Roscommon", "Sligo", "Tipperary",
      "Waterford", "Westmeath", "Wexford", "Wicklow"
    ],
  },
  NewZealand: {
    name: "New Zealand",
    code: "New Zealand",
    regions: [
      "Auckland", "Bay of Plenty", "Canterbury", "Gisborne", "Hawke's Bay",
      "Manawatu-Wanganui", "Marlborough", "Nelson", "Northland", "Otago",
      "Southland", "Taranaki", "Tasman", "Waikato", "Wairarapa", "Wellington", "West Coast"
    ],
  },
  Switzerland: {
    name: "Switzerland",
    code: "Switzerland",
    regions: [
      "Zurich", "Bern", "Lucerne", "Uri", "Schwyz", "Obwalden", "Nidwalden",
      "Glarus", "Zug", "Fribourg", "Solothurn", "Basel-Stadt", "Basel-Landschaft",
      "Schaffhausen", "Appenzell Ausserrhoden", "Appenzell Innerrhoden", "St. Gallen",
      "Graubunden", "Aargau", "Thurgau", "Ticino", "Vaud", "Valais", "Neuchatel",
      "Geneva", "Jura"
    ],
  },
  Netherlands: {
    name: "Netherlands",
    code: "Netherlands",
    regions: [
      "North Holland", "South Holland", "Utrecht", "North Brabant", "Gelderland",
      "Overijssel", "Limburg", "Friesland", "Groningen", "Drenthe", "Flevoland", "Zeeland"
    ],
  },
  Qatar: {
    name: "Qatar",
    code: "Qatar",
    regions: [
      "Doha", "Al Rayyan", "Al Wakrah", "Al Daayen", "Al Khor",
      "Umm Salal", "Al Shamal", "Al Shahaniya"
    ],
  },
  Spain: {
    name: "Spain",
    code: "Spain",
    regions: [
      "Andalusia", "Catalonia", "Community of Madrid", "Valencian Community", "Galicia",
      "Castile and Leon", "Basque Country", "Canary Islands", "Castilla-La Mancha",
      "Region of Murcia", "Aragon", "Balearic Islands", "Extremadura", "Asturias",
      "Navarre", "Cantabria", "La Rioja"
    ],
  },
  Italy: {
    name: "Italy",
    code: "Italy",
    regions: [
      "Lombardy", "Lazio", "Campania", "Veneto", "Sicily", "Piedmont", "Apulia",
      "Emilia-Romagna", "Tuscany", "Calabria", "Sardinia", "Liguria", "Marche",
      "Abruzzo", "Friuli Venezia Giulia", "Trentino-Alto Adige", "Umbria", "Basilicata",
      "Molise", "Aosta Valley"
    ],
  },
  Sweden: {
    name: "Sweden",
    code: "Sweden",
    regions: [
      "Stockholm", "Vastra Gotaland", "Skane", "Ostergotland", "Jonkoping",
      "Uppsala", "Halland", "Orebro", "Sodermanland", "Dalarna",
      "Gavleborg", "Varmland", "Vastmanland", "Vasterbotten", "Norrbotten",
      "Kronoberg", "Kalmar", "Blekinge", "Jamtland", "Vasternorrland", "Gotland"
    ],
  },
  Norway: {
    name: "Norway",
    code: "Norway",
    regions: [
      "Oslo", "Viken", "Vestland", "Rogaland", "Trondelag",
      "Innlandet", "Agder", "Vestfold og Telemark", "More og Romsdal",
      "Nordland", "Troms og Finnmark"
    ],
  },
  Denmark: {
    name: "Denmark",
    code: "Denmark",
    regions: [
      "Capital Region of Denmark (Copenhagen)", "Central Denmark Region",
      "Region of Southern Denmark", "Region Zealand", "North Denmark Region"
    ],
  },
  Kuwait: {
    name: "Kuwait",
    code: "Kuwait",
    regions: [
      "Al Asimah (Capital)", "Hawalli", "Farwaniya",
      "Al Ahmadi", "Mubarak Al-Kabeer", "Jahra"
    ],
  },
  Singapore: {
    name: "Singapore",
    code: "Singapore",
    regions: [
      "Central Singapore", "North East District", "North West District",
      "South East District", "South West District"
    ],
  },
  Austria: {
    name: "Austria",
    code: "Austria",
    regions: [
      "Vienna", "Lower Austria", "Upper Austria", "Styria",
      "Tyrol", "Carinthia", "Salzburg", "Vorarlberg", "Burgenland"
    ],
  },
  Belgium: {
    name: "Belgium",
    code: "Belgium",
    regions: [
      "Brussels", "Antwerp", "East Flanders", "Flemish Brabant", "Limburg",
      "West Flanders", "Hainaut", "Liege", "Luxembourg", "Namur", "Walloon Brabant"
    ],
  },
  Portugal: {
    name: "Portugal",
    code: "Portugal",
    regions: [
      "Lisbon", "Porto", "Faro (Algarve)", "Setubal", "Braga", "Aveiro",
      "Leiria", "Santarem", "Coimbra", "Viseu", "Madeira", "Azores",
      "Viana do Castelo", "Vila Real", "Castelo Branco", "Evora", "Guarda",
      "Beja", "Braganca", "Portalegre"
    ],
  },
  Greece: {
    name: "Greece",
    code: "Greece",
    regions: [
      "Attica (Athens)", "Central Macedonia (Thessaloniki)", "Crete",
      "South Aegean (Mykonos, Santorini, Rhodes)", "Ionian Islands (Corfu, Zakynthos)",
      "Peloponnese", "Central Greece", "Thessaly", "Western Greece",
      "Epirus", "Eastern Macedonia and Thrace", "North Aegean", "Western Macedonia"
    ],
  },
  Finland: {
    name: "Finland",
    code: "Finland",
    regions: [
      "Uusimaa (Helsinki)", "Pirkanmaa", "Southwest Finland (Turku)", "North Ostrobothnia",
      "Central Finland", "Lapland", "Satakunta", "Pohjois-Savo", "Paijat-Hame",
      "South Ostrobothnia", "Ostrobothnia", "Kymenlaakso", "North Karelia",
      "South Karelia", "Kanta-Hame", "Etela-Savo", "Kainuu", "Central Ostrobothnia", "Aland"
    ],
  },
  Bahrain: {
    name: "Bahrain",
    code: "Bahrain",
    regions: [
      "Capital Governorate (Manama)", "Muharraq", "Northern Governorate", "Southern Governorate"
    ],
  },
  Oman: {
    name: "Oman",
    code: "Oman",
    regions: [
      "Muscat", "Dhofar (Salalah)", "Musandam", "Al Batinah North", "Al Batinah South",
      "Al Dakhiliyah", "Al Sharqiyah North", "Al Sharqiyah South", "Al Dhahirah",
      "Al Buraimi", "Al Wusta"
    ],
  },
  Poland: {
    name: "Poland",
    code: "Poland",
    regions: [
      "Masovian (Warsaw)", "Silesian (Katowice)", "Lesser Poland (Krakow)", "Lower Silesian (Wroclaw)",
      "Greater Poland (Poznan)", "Pomeranian (Gdansk)", "Lodz", "Kuyavian-Pomeranian",
      "Lublin", "Podkarpackie", "Warmian-Masurian", "West Pomeranian", "Swietokrzyskie",
      "Podlaskie", "Lubusz", "Opole"
    ],
  },
  CzechRepublic: {
    name: "Czech Republic",
    code: "Czech Republic",
    regions: [
      "Prague", "Central Bohemian", "South Moravian (Brno)", "Moravian-Silesian (Ostrava)",
      "Usti nad Labem", "Olomouc", "South Bohemian", "Plzen", "Zlin",
      "Hradec Kralove", "Pardubice", "Vysocina", "Liberec", "Karlovy Vary"
    ],
  },
  Luxembourg: {
    name: "Luxembourg",
    code: "Luxembourg",
    regions: [
      "Luxembourg (City)", "Esch-sur-Alzette", "Capellen", "Diekirch", "Grevenmacher",
      "Mersch", "Clervaux", "Redange", "Remich", "Wiltz", "Echternach", "Vianden"
    ],
  },
};