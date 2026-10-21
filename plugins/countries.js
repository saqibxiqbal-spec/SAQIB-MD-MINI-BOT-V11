/**
 * COUNTRIES — capital, currency, flag, ISO, calling code for 160+ countries.
 * 100% offline data — no API calls, no credit used.
 */
const config = require('../config');
const { pick } = require('../lib/helpers');

const P = () => config.PREFIX;

/** key -> [name, capital, currency, iso2, callingCode, region, biggestCity, languages, areaKm2, population] */
const C = {
  "pakistan": ["Pakistan", "Islamabad", "PKR", "PK", "+92", "Asia", "Karachi", "Urdu", "881913", "240.5M"],
  "india": ["India", "New Delhi", "INR", "IN", "+91", "Asia", "Mumbai", "Hindi", "3287263", "1428M"],
  "china": ["China", "Beijing", "CNY", "CN", "+86", "Asia", "Shanghai", "Mandarin", "9596961", "1425M"],
  "usa": ["United States", "Washington D.C.", "USD", "US", "+1", "North America", "New York", "English", "9833517", "340M"],
  "uk": ["United Kingdom", "London", "GBP", "GB", "+44", "Europe", "London", "English", "243610", "67M"],
  "saudi": ["Saudi Arabia", "Riyadh", "SAR", "SA", "+966", "Asia", "Riyadh", "Arabic", "2149690", "36M"],
  "uae": ["United Arab Emirates", "Abu Dhabi", "AED", "AE", "+971", "Asia", "Dubai", "Arabic", "83600", "10M"],
  "turkey": ["Turkey", "Ankara", "TRY", "TR", "+90", "Asia/Europe", "Istanbul", "Turkish", "783562", "85M"],
  "japan": ["Japan", "Tokyo", "JPY", "JP", "+81", "Asia", "Tokyo", "Japanese", "377975", "125M"],
  "korea": ["South Korea", "Seoul", "KRW", "KR", "+82", "Asia", "Seoul", "Korean", "100210", "51M"],
  "germany": ["Germany", "Berlin", "EUR", "DE", "+49", "Europe", "Berlin", "German", "357022", "84M"],
  "france": ["France", "Paris", "EUR", "FR", "+33", "Europe", "Paris", "French", "643801", "68M"],
  "italy": ["Italy", "Rome", "EUR", "IT", "+39", "Europe", "Rome", "Italian", "301340", "59M"],
  "spain": ["Spain", "Madrid", "EUR", "ES", "+34", "Europe", "Madrid", "Spanish", "505990", "47M"],
  "russia": ["Russia", "Moscow", "RUB", "RU", "+7", "Europe/Asia", "Moscow", "Russian", "17098242", "144M"],
  "canada": ["Canada", "Ottawa", "CAD", "CA", "+1", "North America", "Toronto", "English/French", "9984670", "38M"],
  "australia": ["Australia", "Canberra", "AUD", "AU", "+61", "Oceania", "Sydney", "English", "7692024", "26M"],
  "brazil": ["Brazil", "Brasilia", "BRL", "BR", "+55", "South America", "Sao Paulo", "Portuguese", "8515767", "215M"],
  "mexico": ["Mexico", "Mexico City", "MXN", "MX", "+52", "North America", "Mexico City", "Spanish", "1964375", "128M"],
  "egypt": ["Egypt", "Cairo", "EGP", "EG", "+20", "Africa", "Cairo", "Arabic", "1002450", "105M"],
  "indonesia": ["Indonesia", "Jakarta", "IDR", "ID", "+62", "Asia", "Jakarta", "Indonesian", "1904569", "275M"],
  "bangladesh": ["Bangladesh", "Dhaka", "BDT", "BD", "+880", "Asia", "Dhaka", "Bengali", "147570", "170M"],
  "nigeria": ["Nigeria", "Abuja", "NGN", "NG", "+234", "Africa", "Lagos", "English", "923768", "218M"],
  "iran": ["Iran", "Tehran", "IRR", "IR", "+98", "Asia", "Tehran", "Persian", "1648195", "88M"],
  "iraq": ["Iraq", "Baghdad", "IQD", "IQ", "+964", "Asia", "Baghdad", "Arabic", "438317", "44M"],
  "afghanistan": ["Afghanistan", "Kabul", "AFN", "AF", "+93", "Asia", "Kabul", "Pashto/Dari", "652230", "41M"],
  "malaysia": ["Malaysia", "Kuala Lumpur", "MYR", "MY", "+60", "Asia", "Kuala Lumpur", "Malay", "330803", "34M"],
  "thailand": ["Thailand", "Bangkok", "THB", "TH", "+66", "Asia", "Bangkok", "Thai", "513120", "71M"],
  "vietnam": ["Vietnam", "Hanoi", "VND", "VN", "+84", "Asia", "Ho Chi Minh", "Vietnamese", "331212", "98M"],
  "philippines": ["Philippines", "Manila", "PHP", "PH", "+63", "Asia", "Manila", "Filipino", "300000", "115M"],
  "nepal": ["Nepal", "Kathmandu", "NPR", "NP", "+977", "Asia", "Kathmandu", "Nepali", "147181", "30M"],
  "srilanka": ["Sri Lanka", "Colombo", "LKR", "LK", "+94", "Asia", "Colombo", "Sinhala", "65610", "22M"],
  "southafrica": ["South Africa", "Pretoria", "ZAR", "ZA", "+27", "Africa", "Johannesburg", "English", "1221037", "60M"],
  "kenya": ["Kenya", "Nairobi", "KES", "KE", "+254", "Africa", "Nairobi", "Swahili", "580367", "55M"],
  "ethiopia": ["Ethiopia", "Addis Ababa", "ETB", "ET", "+251", "Africa", "Addis Ababa", "Amharic", "1104300", "123M"],
  "morocco": ["Morocco", "Rabat", "MAD", "MA", "+212", "Africa", "Casablanca", "Arabic", "446550", "37M"],
  "algeria": ["Algeria", "Algiers", "DZD", "DZ", "+213", "Africa", "Algiers", "Arabic", "2381741", "45M"],
  "tunisia": ["Tunisia", "Tunis", "TND", "TN", "+216", "Africa", "Tunis", "Arabic", "163610", "12M"],
  "libya": ["Libya", "Tripoli", "LYD", "LY", "+218", "Africa", "Tripoli", "Arabic", "1759540", "7M"],
  "sudan": ["Sudan", "Khartoum", "SDG", "SD", "+249", "Africa", "Khartoum", "Arabic", "1861484", "46M"],
  "syria": ["Syria", "Damascus", "SYP", "SY", "+963", "Asia", "Damascus", "Arabic", "185180", "22M"],
  "jordan": ["Jordan", "Amman", "JOD", "JO", "+962", "Asia", "Amman", "Arabic", "89342", "11M"],
  "lebanon": ["Lebanon", "Beirut", "LBP", "LB", "+961", "Asia", "Beirut", "Arabic", "10452", "5M"],
  "qatar": ["Qatar", "Doha", "QAR", "QA", "+974", "Asia", "Doha", "Arabic", "11586", "3M"],
  "kuwait": ["Kuwait", "Kuwait City", "KWD", "KW", "+965", "Asia", "Kuwait City", "Arabic", "17818", "4M"],
  "bahrain": ["Bahrain", "Manama", "BHD", "BH", "+973", "Asia", "Manama", "Arabic", "765", "1.5M"],
  "oman": ["Oman", "Muscat", "OMR", "OM", "+968", "Asia", "Muscat", "Arabic", "309500", "5M"],
  "yemen": ["Yemen", "Sanaa", "YER", "YE", "+967", "Asia", "Sanaa", "Arabic", "527968", "34M"],
  "greece": ["Greece", "Athens", "EUR", "GR", "+30", "Europe", "Athens", "Greek", "131957", "10M"],
  "portugal": ["Portugal", "Lisbon", "EUR", "PT", "+351", "Europe", "Lisbon", "Portuguese", "92212", "10M"],
  "netherlands": ["Netherlands", "Amsterdam", "EUR", "NL", "+31", "Europe", "Amsterdam", "Dutch", "41543", "18M"],
  "belgium": ["Belgium", "Brussels", "EUR", "BE", "+32", "Europe", "Brussels", "Dutch/French", "30528", "12M"],
  "switzerland": ["Switzerland", "Bern", "CHF", "CH", "+41", "Europe", "Zurich", "German/French", "41277", "9M"],
  "austria": ["Austria", "Vienna", "EUR", "AT", "+43", "Europe", "Vienna", "German", "83879", "9M"],
  "sweden": ["Sweden", "Stockholm", "SEK", "SE", "+46", "Europe", "Stockholm", "Swedish", "450295", "10M"],
  "norway": ["Norway", "Oslo", "NOK", "NO", "+47", "Europe", "Oslo", "Norwegian", "385207", "5M"],
  "denmark": ["Denmark", "Copenhagen", "DKK", "DK", "+45", "Europe", "Copenhagen", "Danish", "43094", "6M"],
  "finland": ["Finland", "Helsinki", "EUR", "FI", "+358", "Europe", "Helsinki", "Finnish", "338424", "6M"],
  "poland": ["Poland", "Warsaw", "PLN", "PL", "+48", "Europe", "Warsaw", "Polish", "312696", "38M"],
  "ukraine": ["Ukraine", "Kyiv", "UAH", "UA", "+380", "Europe", "Kyiv", "Ukrainian", "603550", "44M"],
  "romania": ["Romania", "Bucharest", "RON", "RO", "+40", "Europe", "Bucharest", "Romanian", "238391", "19M"],
  "ireland": ["Ireland", "Dublin", "EUR", "IE", "+353", "Europe", "Dublin", "English/Irish", "70273", "5M"],
  "hungary": ["Hungary", "Budapest", "HUF", "HU", "+36", "Europe", "Budapest", "Hungarian", "93028", "10M"],
  "czechia": ["Czech Republic", "Prague", "CZK", "CZ", "+420", "Europe", "Prague", "Czech", "78867", "11M"],
  "argentina": ["Argentina", "Buenos Aires", "ARS", "AR", "+54", "South America", "Buenos Aires", "Spanish", "2780400", "46M"],
  "chile": ["Chile", "Santiago", "CLP", "CL", "+56", "South America", "Santiago", "Spanish", "756102", "20M"],
  "peru": ["Peru", "Lima", "PEN", "PE", "+51", "South America", "Lima", "Spanish", "1285216", "34M"],
  "colombia": ["Colombia", "Bogota", "COP", "CO", "+57", "South America", "Bogota", "Spanish", "1141748", "52M"],
  "venezuela": ["Venezuela", "Caracas", "VES", "VE", "+58", "South America", "Caracas", "Spanish", "916445", "28M"],
  "newzealand": ["New Zealand", "Wellington", "NZD", "NZ", "+64", "Oceania", "Auckland", "English", "268021", "5M"],
  "singapore": ["Singapore", "Singapore", "SGD", "SG", "+65", "Asia", "Singapore", "English", "728", "6M"],
  "maldives": ["Maldives", "Male", "MVR", "MV", "+960", "Asia", "Male", "Dhivehi", "300", "0.5M"],
  "bhutan": ["Bhutan", "Thimphu", "BTN", "BT", "+975", "Asia", "Thimphu", "Dzongkha", "38394", "0.8M"],
  "mongolia": ["Mongolia", "Ulaanbaatar", "MNT", "MN", "+976", "Asia", "Ulaanbaatar", "Mongolian", "1564110", "3M"],
  "kazakhstan": ["Kazakhstan", "Astana", "KZT", "KZ", "+7", "Asia", "Almaty", "Kazakh", "2724900", "19M"],
  "uzbekistan": ["Uzbekistan", "Tashkent", "UZS", "UZ", "+998", "Asia", "Tashkent", "Uzbek", "447400", "35M"],
  "azerbaijan": ["Azerbaijan", "Baku", "AZN", "AZ", "+994", "Asia", "Baku", "Azerbaijani", "86600", "10M"],
  "armenia": ["Armenia", "Yerevan", "AMD", "AM", "+374", "Asia", "Yerevan", "Armenian", "29743", "3M"],
  "georgia": ["Georgia", "Tbilisi", "GEL", "GE", "+995", "Asia", "Tbilisi", "Georgian", "69700", "4M"],
  "cyprus": ["Cyprus", "Nicosia", "EUR", "CY", "+357", "Europe", "Nicosia", "Greek/Turkish", "9251", "1.2M"],
  "cuba": ["Cuba", "Havana", "CUP", "CU", "+53", "North America", "Havana", "Spanish", "109884", "11M"],
  "jamaica": ["Jamaica", "Kingston", "JMD", "JM", "+1876", "North America", "Kingston", "English", "10991", "3M"],
  "panama": ["Panama", "Panama City", "PAB", "PA", "+507", "North America", "Panama City", "Spanish", "75417", "4M"],
  "costarica": ["Costa Rica", "San Jose", "CRC", "CR", "+506", "North America", "San Jose", "Spanish", "51100", "5M"],
  "guatemala": ["Guatemala", "Guatemala City", "GTQ", "GT", "+502", "North America", "Guatemala City", "Spanish", "108889", "17M"],
  "ghana": ["Ghana", "Accra", "GHS", "GH", "+233", "Africa", "Accra", "English", "238533", "33M"],
  "tanzania": ["Tanzania", "Dodoma", "TZS", "TZ", "+255", "Africa", "Dar es Salaam", "Swahili", "947303", "65M"],
  "uganda": ["Uganda", "Kampala", "UGX", "UG", "+256", "Africa", "Kampala", "English", "241550", "47M"],
  "senegal": ["Senegal", "Dakar", "XOF", "SN", "+221", "Africa", "Dakar", "French", "196722", "17M"],
  "zimbabwe": ["Zimbabwe", "Harare", "ZWL", "ZW", "+263", "Africa", "Harare", "English", "390757", "16M"],
  "zambia": ["Zambia", "Lusaka", "ZMW", "ZM", "+260", "Africa", "Lusaka", "English", "752612", "19M"],
  "mozambique": ["Mozambique", "Maputo", "MZN", "MZ", "+258", "Africa", "Maputo", "Portuguese", "801590", "32M"],
  "angola": ["Angola", "Luanda", "AOA", "AO", "+244", "Africa", "Luanda", "Portuguese", "1246700", "35M"],
  "cameroon": ["Cameroon", "Yaounde", "XAF", "CM", "+237", "Africa", "Douala", "French/English", "475442", "27M"],
  "ivorycoast": ["Ivory Coast", "Yamoussoukro", "XOF", "CI", "+225", "Africa", "Abidjan", "French", "322463", "27M"],
  "mali": ["Mali", "Bamako", "XOF", "ML", "+223", "Africa", "Bamako", "French", "1240192", "22M"],
  "niger": ["Niger", "Niamey", "XOF", "NE", "+227", "Africa", "Niamey", "French", "1267000", "25M"],
  "chad": ["Chad", "N'Djamena", "XAF", "TD", "+235", "Africa", "N'Djamena", "French/Arabic", "1284000", "17M"],
  "somalia": ["Somalia", "Mogadishu", "SOS", "SO", "+252", "Africa", "Mogadishu", "Somali", "637657", "17M"],
  "eritrea": ["Eritrea", "Asmara", "ERN", "ER", "+291", "Africa", "Asmara", "Tigrinya", "117600", "3M"],
  "rwanda": ["Rwanda", "Kigali", "RWF", "RW", "+250", "Africa", "Kigali", "Kinyarwanda", "26338", "13M"],
  "malawi": ["Malawi", "Lilongwe", "MWK", "MW", "+265", "Africa", "Lilongwe", "English", "118484", "20M"],
  "madagascar": ["Madagascar", "Antananarivo", "MGA", "MG", "+261", "Africa", "Antananarivo", "Malagasy", "587041", "29M"],
  "botswana": ["Botswana", "Gaborone", "BWP", "BW", "+267", "Africa", "Gaborone", "English", "581730", "2.5M"],
  "namibia": ["Namibia", "Windhoek", "NAD", "NA", "+264", "Africa", "Windhoek", "English", "825615", "2.5M"],
  "mauritius": ["Mauritius", "Port Louis", "MUR", "MU", "+230", "Africa", "Port Louis", "English", "2040", "1.3M"],
  "brunei": ["Brunei", "Bandar Seri Begawan", "BND", "BN", "+673", "Asia", "Bandar Seri Begawan", "Malay", "5765", "0.5M"],
  "cambodia": ["Cambodia", "Phnom Penh", "KHR", "KH", "+855", "Asia", "Phnom Penh", "Khmer", "181035", "17M"],
  "laos": ["Laos", "Vientiane", "LAK", "LA", "+856", "Asia", "Vientiane", "Lao", "236800", "7M"],
  "myanmar": ["Myanmar", "Naypyidaw", "MMK", "MM", "+95", "Asia", "Yangon", "Burmese", "676578", "54M"],
  "tajikistan": ["Tajikistan", "Dushanbe", "TJS", "TJ", "+992", "Asia", "Dushanbe", "Tajik", "143100", "10M"],
  "turkmenistan": ["Turkmenistan", "Ashgabat", "TMT", "TM", "+993", "Asia", "Ashgabat", "Turkmen", "488100", "6M"],
  "kyrgyzstan": ["Kyrgyzstan", "Bishkek", "KGS", "KG", "+996", "Asia", "Bishkek", "Kyrgyz", "199951", "7M"],
  "belarus": ["Belarus", "Minsk", "BYN", "BY", "+375", "Europe", "Minsk", "Belarusian", "207600", "9M"],
  "moldova": ["Moldova", "Chisinau", "MDL", "MD", "+373", "Europe", "Chisinau", "Romanian", "33846", "2.5M"],
  "albania": ["Albania", "Tirana", "ALL", "AL", "+355", "Europe", "Tirana", "Albanian", "28748", "2.8M"],
  "croatia": ["Croatia", "Zagreb", "EUR", "HR", "+385", "Europe", "Zagreb", "Croatian", "56594", "4M"],
  "serbia": ["Serbia", "Belgrade", "RSD", "RS", "+381", "Europe", "Belgrade", "Serbian", "88361", "7M"],
  "bulgaria": ["Bulgaria", "Sofia", "BGN", "BG", "+359", "Europe", "Sofia", "Bulgarian", "110879", "6.5M"],
  "slovakia": ["Slovakia", "Bratislava", "EUR", "SK", "+421", "Europe", "Bratislava", "Slovak", "49035", "5.5M"],
  "slovenia": ["Slovenia", "Ljubljana", "EUR", "SI", "+386", "Europe", "Ljubljana", "Slovenian", "20273", "2M"],
  "lithuania": ["Lithuania", "Vilnius", "EUR", "LT", "+370", "Europe", "Vilnius", "Lithuanian", "65300", "2.8M"],
  "latvia": ["Latvia", "Riga", "EUR", "LV", "+371", "Europe", "Riga", "Latvian", "64589", "1.8M"],
  "estonia": ["Estonia", "Tallinn", "EUR", "EE", "+372", "Europe", "Tallinn", "Estonian", "45228", "1.3M"],
  "iceland": ["Iceland", "Reykjavik", "ISK", "IS", "+354", "Europe", "Reykjavik", "Icelandic", "103000", "0.4M"],
  "luxembourg": ["Luxembourg", "Luxembourg", "EUR", "LU", "+352", "Europe", "Luxembourg", "Luxembourgish", "2586", "0.6M"],
  "malta": ["Malta", "Valletta", "EUR", "MT", "+356", "Europe", "Valletta", "Maltese", "316", "0.5M"],
  "honduras": ["Honduras", "Tegucigalpa", "HNL", "HN", "+504", "North America", "Tegucigalpa", "Spanish", "112492", "10M"],
  "nicaragua": ["Nicaragua", "Managua", "NIO", "NI", "+505", "North America", "Managua", "Spanish", "130373", "7M"],
  "elsalvador": ["El Salvador", "San Salvador", "USD", "SV", "+503", "North America", "San Salvador", "Spanish", "21041", "6M"],
  "dominican": ["Dominican Republic", "Santo Domingo", "DOP", "DO", "+1809", "North America", "Santo Domingo", "Spanish", "48671", "11M"],
  "haiti": ["Haiti", "Port-au-Prince", "HTG", "HT", "+509", "North America", "Port-au-Prince", "French/Creole", "27750", "11M"],
  "bolivia": ["Bolivia", "Sucre", "BOB", "BO", "+591", "South America", "La Paz", "Spanish", "1098581", "12M"],
  "ecuador": ["Ecuador", "Quito", "USD", "EC", "+593", "South America", "Quito", "Spanish", "283561", "18M"],
  "paraguay": ["Paraguay", "Asuncion", "PYG", "PY", "+595", "South America", "Asuncion", "Spanish", "406752", "7M"],
  "uruguay": ["Uruguay", "Montevideo", "UYU", "UY", "+598", "South America", "Montevideo", "Spanish", "176215", "3.5M"],
  "guyana": ["Guyana", "Georgetown", "GYD", "GY", "+592", "South America", "Georgetown", "English", "214969", "0.8M"],
  "fiji": ["Fiji", "Suva", "FJD", "FJ", "+679", "Oceania", "Suva", "English", "18274", "0.9M"],
  "papua": ["Papua New Guinea", "Port Moresby", "PGK", "PG", "+675", "Oceania", "Port Moresby", "English", "462840", "10M"],
  "samoa": ["Samoa", "Apia", "WST", "WS", "+685", "Oceania", "Apia", "Samoan", "2842", "0.2M"],
  "tonga": ["Tonga", "Nuku'alofa", "TOP", "TO", "+676", "Oceania", "Nuku'alofa", "Tongan", "747", "0.1M"],
  "vanuatu": ["Vanuatu", "Port Vila", "VUV", "VU", "+678", "Oceania", "Port Vila", "Bislama", "12189", "0.3M"],
  "solomon": ["Solomon Islands", "Honiara", "SBD", "SB", "+677", "Oceania", "Honiara", "English", "28896", "0.7M"],
  "taiwan": ["Taiwan", "Taipei", "TWD", "TW", "+886", "Asia", "Taipei", "Mandarin", "36193", "23M"],
  "hongkong": ["Hong Kong", "Hong Kong", "HKD", "HK", "+852", "Asia", "Hong Kong", "Chinese/English", "1104", "7M"],
  "macau": ["Macau", "Macau", "MOP", "MO", "+853", "Asia", "Macau", "Chinese/Portuguese", "33", "0.7M"],
  "northkorea": ["North Korea", "Pyongyang", "KPW", "KP", "+850", "Asia", "Pyongyang", "Korean", "120538", "26M"],
  "timor": ["Timor-Leste", "Dili", "USD", "TL", "+670", "Asia", "Dili", "Tetum", "14874", "1.3M"],
  "gambia": ["Gambia", "Banjul", "GMD", "GM", "+220", "Africa", "Banjul", "English", "11295", "2.5M"],
  "guinea": ["Guinea", "Conakry", "GNF", "GN", "+224", "Africa", "Conakry", "French", "245857", "13M"],
  "liberia": ["Liberia", "Monrovia", "LRD", "LR", "+231", "Africa", "Monrovia", "English", "111369", "5M"],
  "sierraleone": ["Sierra Leone", "Freetown", "SLE", "SL", "+232", "Africa", "Freetown", "English", "71740", "8M"],
  "togo": ["Togo", "Lome", "XOF", "TG", "+228", "Africa", "Lome", "French", "56785", "8M"],
  "benin": ["Benin", "Porto-Novo", "XOF", "BJ", "+229", "Africa", "Cotonou", "French", "112622", "12M"],
  "burkinafaso": ["Burkina Faso", "Ouagadougou", "XOF", "BF", "+226", "Africa", "Ouagadougou", "French", "274200", "22M"],
  "mauritania": ["Mauritania", "Nouakchott", "MRU", "MR", "+222", "Africa", "Nouakchott", "Arabic", "1030700", "4.5M"],
  "gabon": ["Gabon", "Libreville", "XAF", "GA", "+241", "Africa", "Libreville", "French", "267668", "2.3M"],
  "congo": ["Congo", "Brazzaville", "XAF", "CG", "+242", "Africa", "Brazzaville", "French", "342000", "6M"],
  "drc": ["DR Congo", "Kinshasa", "CDF", "CD", "+243", "Africa", "Kinshasa", "French", "2344858", "99M"],
  "centralafrica": ["Central African Republic", "Bangui", "XAF", "CF", "+236", "Africa", "Bangui", "French", "622984", "5M"],
  "burundi": ["Burundi", "Gitega", "BIF", "BI", "+257", "Africa", "Bujumbura", "Kirundi", "27834", "12M"],
  "djibouti": ["Djibouti", "Djibouti", "DJF", "DJ", "+253", "Africa", "Djibouti", "French/Arabic", "23200", "1M"],
  "lesotho": ["Lesotho", "Maseru", "LSL", "LS", "+266", "Africa", "Maseru", "Sesotho", "30355", "2M"],
  "eswatini": ["Eswatini", "Mbabane", "SZL", "SZ", "+268", "Africa", "Mbabane", "Swati", "17364", "1.2M"],
  "seychelles": ["Seychelles", "Victoria", "SCR", "SC", "+248", "Africa", "Victoria", "Creole", "455", "0.1M"],
  "capeverde": ["Cape Verde", "Praia", "CVE", "CV", "+238", "Africa", "Praia", "Portuguese", "4033", "0.6M"],
  "southsudan": ["South Sudan", "Juba", "SSP", "SS", "+211", "Africa", "Juba", "English", "644329", "11M"],
};

const KEYS = Object.keys(C);
const byIso = {};
for (const [k, v] of Object.entries(C)) byIso[v[3].toLowerCase()] = k;

/** Turn an ISO country code into its flag emoji. */
function flag(iso) {
  if (!/^[A-Za-z]{2}$/.test(iso)) return '🏳️';
  return String.fromCodePoint(...iso.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)));
}

function card(k) {
  const [name, cap, cur, iso, code, region, biggest, lang, area, pop] = C[k];
  return (
    `${flag(iso)} *${name.toUpperCase()}*\n` +
    `━━━━━━━━━━━━━━━\n` +
    `▪️ Capital: *${cap}*\n` +
    `▪️ Currency: ${cur}\n` +
    `▪️ Calling code: ${code}\n` +
    `▪️ ISO: ${iso}\n` +
    `▪️ Region: ${region}\n` +
    `▪️ Biggest city: ${biggest}\n` +
    `▪️ Languages: ${lang}\n` +
    `▪️ Area: ${area} km²\n` +
    `▪️ Population: ${pop}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `_${P()}flag ${iso} · ${P()}capital ${name}_`
  );
}

const handler = async (ctx) => {
  const { command, arg, reply } = ctx;
  const q = String(arg || '').toLowerCase().trim();

  if (command === 'countrylist') {
    return reply(
      `🌍 *COUNTRIES (${KEYS.length})*\n━━━━━━━━━━━━━━━\n` +
      KEYS.map((k) => `${flag(C[k][3])} \`${P()}country ${k}\``).join('\n')
    );
  }

  if (command === 'country' || command === 'countryinfo') {
    if (!q) return reply(`🌍 Country ka naam ya code likho.\nExample: \`${P()}country pakistan\``);
    if (C[q]) return reply(card(q));
    if (byIso[q]) return reply(card(byIso[q]));
    const hits = KEYS.filter((k) => k.includes(q) || C[k][0].toLowerCase().includes(q));
    if (hits.length === 1) return reply(card(hits[0]));
    if (hits.length) return reply(`🔍 ${hits.length} mile:\n${hits.slice(0, 12).map((h) => `▪️ \`${P()}country ${h}\``).join('\n')}`);
    return reply(`❌ \`${arg}\` nahi mila. \`${P()}countrylist\` try karo.`);
  }

  // ---- a specific field across ALL countries ----
  const FIELD = {
    capital: 1, currency: 2, callingcode: 4, region: 5, biggestcity: 6, languages: 7, area: 8, population: 9,
  };
  if (FIELD[command] !== undefined) {
    if (!q) return reply(`❓ Country likho. Example: \`${P()}${command} pakistan\``);
    let k = C[q] ? q : byIso[q];
    if (!k) k = KEYS.find((x) => C[x][0].toLowerCase().includes(q));
    if (!k) return reply(`❌ \`${arg}\` nahi mila.`);
    const v = C[k][FIELD[command]];
    const label = command === 'callingcode' ? 'Calling code' : command.charAt(0).toUpperCase() + command.slice(1);
    return reply(`${flag(C[k][3])} *${C[k][0]}*\n▪️ ${label}: *${v}*`);
  }

  if (command === 'flag') {
    if (!q) return reply(`🏳️ Country ka naam ya ISO code likho. Example: \`${P()}flag pk\``);
    let k = byIso[q] || C[q];
    if (!k) k = KEYS.find((x) => C[x][0].toLowerCase().includes(q));
    if (!k) return reply(`❌ \`${arg}\` nahi mila.`);
    return reply(`${flag(C[k][3])} *${C[k][0]}* — \`${C[k][3]}\``);
  }

  // ---- one command per country: .pk .india .usa … ----
  if (C[command]) return reply(card(command));

  return reply(`❓ Country command samajh nahi aaya. \`${P()}countrylist\` dekho.`);
};

module.exports = {
  // `currency` is owned by tools.js (conversion: `.currency 100 USD PKR`); the
  // country card already prints each country's currency.
  // `chad` is owned by characters.js (`.chad` rating); use `.country chad` for
  // the country card so the two never fight over the same command.
  commands: ['country', 'countryinfo', 'countrylist', 'flag', 'capital', 'callingcode', 'region', 'biggestcity', 'languages', 'area', 'population', ...KEYS.filter((k) => k !== 'chad')],
  category: '🌍 COUNTRIES',
  handler,
};
