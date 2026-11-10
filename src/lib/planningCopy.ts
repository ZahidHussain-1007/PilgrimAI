import type { AppLanguage } from "./prefs";
import { planningV21Copy } from "./planningV21Copy";
const copy: Record<string, [string, string, string]> = {

  title: [
    "Your pilgrimage itinerary",
    "మీ తీర్థయాత్ర ప్రణాళిక",
    "आपकी तीर्थयात्रा योजना",
  ],
  waiting: [
    "We’re preparing your pilgrimage itinerary.",
    "మీ తీర్థయాత్ర ప్రణాళికను సిద్ధం చేస్తున్నాము.",
    "हम आपकी तीर्थयात्रा योजना तैयार कर रहे हैं।",
  ],
  waitBody: [
    "We’re checking temple information, journeys and your preferences. We will open your itinerary after it has been checked and saved.",
    "ఆలయ వివరాలు, మార్గాలు, మీ అభిరుచులను పరిశీలిస్తున్నాము. తనిఖీ చేసి సేవ్ చేసిన తర్వాత ప్రణాళిక తెరుచుకుంటుంది.",
    "हम मंदिर विवरण, यात्रा और आपकी पसंद जाँच रहे हैं। जाँच और सहेजने के बाद योजना खुलेगी।",
  ],
  queued: [
    "Waiting for a planning worker",
    "ప్రణాళిక కోసం వేచి ఉంది",
    "योजना शुरू होने की प्रतीक्षा",
  ],
  temples: [
    "Checking temple information",
    "ఆలయ వివరాల తనిఖీ",
    "मंदिर विवरण जाँचना",
  ],
  routes: [
    "Calculating journeys",
    "ప్రయాణ మార్గాల లెక్కింపు",
    "यात्रा मार्ग गणना",
  ],
  stay_food: [
    "Checking stay and food options",
    "వసతి, భోజన ఎంపికల తనిఖీ",
    "ठहरने और भोजन के विकल्प",
  ],
  schedule: [
    "Building the daily schedule",
    "రోజువారీ ప్రణాళిక రూపొందించడం",
    "दैनिक कार्यक्रम बनाना",
  ],
  budget: ["Calculating the budget", "బడ్జెట్ లెక్కింపు", "बजट गणना"],
  validate: [
    "Validating timings and constraints",
    "సమయాలు, పరిమితుల తనిఖీ",
    "समय और शर्तों की जाँच",
  ],
  saved: [
    "Saved on this planning server",
    "ఈ ప్రణాళిక సర్వర్‌లో సేవ్ అయింది",
    "इस योजना सर्वर पर सहेजा गया",
  ],
  draft: [
    "Planning draft — review before travel",
    "ప్రణాళిక ముసాయిదా — ప్రయాణానికి ముందు పరిశీలించండి",
    "योजना प्रारूप — यात्रा से पहले समीक्षा करें",
  ],
  assumptions: [
    "Assumptions and items to confirm",
    "అంచనాలు, నిర్ధారించాల్సిన అంశాలు",
    "अनुमान और पुष्टि करने योग्य बातें",
  ],
  calendar: ["Calendar", "క్యాలెండర్", "कैलेंडर"],
  timeline: ["Daily timeline", "రోజువారీ సమయ పట్టిక", "दैनिक समयरेखा"],
  export: [
    "Download calendar (.ics)",
    "క్యాలెండర్ డౌన్‌లోడ్ (.ics)",
    "कैलेंडर डाउनलोड (.ics)",
  ],
  retry: ["Try again", "మళ్లీ ప్రయత్నించండి", "फिर कोशिश करें"],
  back: ["Back to temples", "ఆలయాలకు తిరిగి", "मंदिरों पर वापस"],
  cancel: ["Cancel planning", "ప్రణాళిక రద్దు", "योजना रद्द करें"],
  failure: [
    "Planning could not finish",
    "ప్రణాళిక పూర్తికాలేదు",
    "योजना पूरी नहीं हो सकी",
  ],
  conflicts: [
    "This request needs changes",
    "ఈ అభ్యర్థనలో మార్పులు అవసరం",
    "इस अनुरोध में बदलाव चाहिए",
  ],
  conflictHelp: [
    "Some constraints could not be verified. Add days, adjust hours, reduce stops or review unavailable road routes. Mandatory temples were not silently dropped.",
    "పూర్తి సాధ్యమైన ప్రణాళిక నిర్ధారించబడలేదు. రోజులు/సమయాలు మార్చండి లేదా ఆలయాలను తగ్గించండి. ఆలయాలు స్వయంగా తొలగించలేదు.",
    "पूर्ण संभव कार्यक्रम सत्यापित नहीं हुआ। दिन/समय बदलें या स्थान घटाएँ। अनिवार्य मंदिर चुपचाप नहीं हटाए गए।",
  ],
  budgetCap: [
    "Total budget cap (₹, optional)",
    "మొత్తం బడ్జెట్ పరిమితి (₹, ఐచ్ఛికం)",
    "कुल बजट सीमा (₹, वैकल्पिक)",
  ],
  departure: [
    "Daily departure (IST)",
    "రోజువారీ బయలుదేరు సమయం (IST)",
    "रोज़ प्रस्थान (IST)",
  ],
  finish: [
    "Latest daily return (IST)",
    "రోజువారీ తిరుగు గడువు (IST)",
    "रोज़ वापसी की सीमा (IST)",
  ],
  rooms: ["Rooms required", "అవసరమైన గదులు", "आवश्यक कमरे"],
  visit: [
    "Visit + queue allowance (minutes)",
    "దర్శనం + క్యూకు సమయం (నిమిషాలు)",
    "दर्शन + कतार समय (मिनट)",
  ],
  rest: [
    "Rest after each visit (minutes)",
    "ప్రతి దర్శనం తర్వాత విశ్రాంతి (నిమిషాలు)",
    "हर दर्शन के बाद विश्राम (मिनट)",
  ],
  estimates: [
    "Allow clearly labelled straight-line travel scenarios if road routing is unavailable",
    "రహదారి మార్గం లేనప్పుడు స్పష్టంగా గుర్తించిన సరళరేఖ అంచనాలను అనుమతించు",
    "सड़क मार्ग न मिलने पर स्पष्ट अनुमानित सीधी-रेखा यात्रा स्वीकार करें",
  ],
  nearby: [
    "Nearby attractions — map links, not scheduled visits",
    "సమీప ఆకర్షణలు — మ్యాప్ లింకులు, ప్రణాళికలో చేర్చలేదు",
    "आसपास के आकर्षण — मानचित्र लिंक, कार्यक्रम में शामिल नहीं",
  ],
  include: [
    "Include nearby-attraction suggestions",
    "సమీప ఆకర్షణల సూచనలు చేర్చు",
    "आसपास के आकर्षण सुझाएँ",
  ],
  options: [
    "Stay and meal options",
    "వసతి, భోజన ఎంపికలు",
    "ठहरने और भोजन के विकल्प",
  ],
  links: [
    "Booking and navigation links",
    "బుకింగ్, నావిగేషన్ లింకులు",
    "बुकिंग और दिशा लिंक",
  ],
  searchNotice: [
    "Search links only. Fares, seats, hotel availability and bookings are not confirmed. Enter the displayed origin, destination and dates on the platform.",
    "ఇవి శోధన లింకులు మాత్రమే. ధరలు, సీట్లు, గదులు, బుకింగ్ నిర్ధారించలేదు. ప్లాట్‌ఫారమ్‌లో స్థలాలు, తేదీలు నమోదు చేయండి.",
    "केवल खोज लिंक। किराया, सीट, कमरा या बुकिंग की पुष्टि नहीं। प्लेटफ़ॉर्म पर स्थान और तारीख भरें।",
  ],
  total: [
    "Known cost scenario (not a complete quote)",
    "తెలిసిన ఖర్చుల అంచనా (పూర్తి ధర కాదు)",
    "ज्ञात लागत अनुमान (पूर्ण कोटेशन नहीं)",
  ],
  missing: [
    "Unpriced / unconfirmed",
    "ధర తెలియని / నిర్ధారించని అంశాలు",
    "मूल्य अज्ञात / अपुष्ट",
  ],
  details: [
    "Temple details and sources",
    "ఆలయ వివరాలు, ఆధారాలు",
    "मंदिर विवरण और स्रोत",
  ],
  agents: [
    "Planning evidence trace",
    "ప్రణాళిక ఆధారాల వివరాలు",
    "योजना साक्ष्य विवरण",
  ],
  chat: [
    "Ask about or redesign this itinerary",
    "ఈ ప్రణాళికను అడగండి లేదా మార్చండి",
    "इस योजना के बारे में पूछें या बदलें",
  ],
  chatHint: [
    "Ask about timings, dress, routes, hotels or budget; try “3 days”, “start at 08:00” or “by bus”. Use Edit for all other constraints.",
    "సమయాలు, దుస్తులు, మార్గాలు, హోటళ్లు, బడ్జెట్ అడగండి; “3 days”, “start at 08:00”, “by bus” ప్రయత్నించండి. ఇతర మార్పులకు సవరించండి.",
    "समय, पोशाक, मार्ग, होटल या बजट पूछें; “3 days”, “start at 08:00”, “by bus” आज़माएँ। अन्य शर्तों के लिए संपादन करें।",
  ],
  send: ["Send", "పంపు", "भेजें"],
  apply: [
    "Apply as a new revision",
    "కొత్త సవరణగా అమలు చేయి",
    "नए संशोधन के रूप में लागू करें",
  ],
  proposal: [
    "Review proposed constraint changes",
    "ప్రతిపాదిత మార్పులను పరిశీలించండి",
    "प्रस्तावित बदलाव जाँचें",
  ],
  original: ["Original itinerary", "అసలు ప్రణాళిక", "मूल योजना"],
  edit: [
    "Edit planning inputs",
    "ప్రణాళిక వివరాలు సవరించు",
    "योजना विवरण संपादित करें",
  ],
  origin: [
    "Starting location / daily base",
    "ప్రారంభ స్థలం / రోజువారీ ఆధారం",
    "शुरुआती स्थान / दैनिक आधार",
  ],
  date: ["Start date", "ప్రారంభ తేదీ", "आरंभ तिथि"],
  days: ["Days", "రోజులు", "दिन"],
  adults: ["Adults", "పెద్దలు", "वयस्क"],
  children: ["Children", "పిల్లలు", "बच्चे"],
  elderly: ["Elderly", "వృద్ధులు", "बुजुर्ग"],
  transport: ["Transport", "రవాణా", "परिवहन"],
  stay: ["Accommodation", "వసతి", "आवास"],
  food: ["Food preference", "భోజన ప్రాధాన్యం", "भोजन पसंद"],
  special: [
    "Accessibility / special requirements",
    "ప్రత్యేక / సులభత అవసరాలు",
    "सुलभता / विशेष आवश्यकताएँ",
  ],
  savedPlans: [
    "Saved planning drafts",
    "సేవ్ చేసిన ప్రణాళికలు",
    "सहेजे गए योजना प्रारूप",
  ],
  empty: [
    "No saved planning drafts on this account/browser yet.",
    "ఈ ఖాతా/బ్రౌజర్‌లో ఇంకా ప్రణాళికలు లేవు.",
    "इस खाते/ब्राउज़र में अभी कोई योजना नहीं।",
  ],
  view: ["Open itinerary", "ప్రణాళిక తెరువు", "योजना खोलें"],
  savedNotice: [
    "Saved to this server for this account, or this browser’s private planning session. Not a confirmed booking.",
    "ఈ ఖాతాకు లేదా ఈ బ్రౌజర్ ప్రైవేట్ సెషన్‌కు సర్వర్‌లో సేవ్ అయింది. బుకింగ్ కాదు.",
    "इस खाते या ब्राउज़र के निजी सत्र के लिए सर्वर पर सहेजा गया। बुकिंग नहीं है।",
  ],
  routeOrigin: [
    "Starting location for distance estimates",
    "దూర అంచనాలకు ప్రారంభ స్థలం",
    "दूरी अनुमान का शुरुआती स्थान",
  ],
  unknown: ["Unconfirmed", "నిర్ధారించలేదు", "अपुष्ट"],
  arrival_buffer: [
    "Arrival / parking buffer",
    "చేరిక / పార్కింగ్ సమయం",
    "आगमन / पार्किंग समय",
  ],
  meal_break: [
    "Meal break — venue to confirm",
    "భోజన విరామం — స్థలం నిర్ధారించాలి",
    "भोजन विराम — स्थान की पुष्टि करें",
  ],
  rest_break: ["Rest break", "విశ్రాంతి", "विश्राम"],
  wait_for_opening: [
    "Wait for published opening window",
    "ఆలయం తెరిచే వరకు వేచి ఉండండి",
    "खुलने के समय की प्रतीक्षा",
  ],
  return_to_origin: [
    "Return to starting location",
    "ప్రారంభ స్థలానికి తిరుగు",
    "शुरुआती स्थान पर वापसी",
  ],
  vehicle_fuel: ["Vehicle fuel", "వాహన ఇంధనం", "वाहन ईंधन"],
  evidenceReply: [
    "From your saved planning evidence — confirm current conditions with the venue/provider.",
    "మీ సేవ్ చేసిన ప్రణాళిక ఆధారాల నుండి — ప్రస్తుత పరిస్థితులను వేదిక/ప్రొవైడర్‌తో నిర్ధారించండి.",
    "आपके सहेजे गए योजना साक्ष्य से — वर्तमान स्थिति की स्थल/प्रदाता से पुष्टि करें।",
  ],
  revisionCreated: [
    "A separate revised draft was created.",
    "వేరే సవరించిన ప్రణాళిక రూపొందించబడింది.",
    "अलग संशोधित प्रारूप बनाया गया।",
  ],
  baseNotice: [
    "Every day returns to your starting location. Hotels and nearby attractions are unconfirmed options, not timed stops. Public transport times and the full budget require confirmation.",
    "ప్రతి రోజు ప్రారంభ స్థలానికి తిరిగి వస్తారు. హోటళ్లు, సమీప ఆకర్షణలు నిర్ధారించని ఎంపికలు; సమయ పట్టికలో లేవు. ప్రజా రవాణా సమయాలు, పూర్తి బడ్జెట్ నిర్ధారించాలి.",
    "हर दिन शुरुआती स्थान पर वापसी होती है। होटल और आसपास के आकर्षण अपुष्ट विकल्प हैं, समयबद्ध पड़ाव नहीं। सार्वजनिक परिवहन समय और पूर्ण बजट की पुष्टि ज़रूरी है।",
  ],
  travel_leg: [
    "Travel to next temple",
    "తదుపరి ఆలయానికి ప్రయాణం",
    "अगले मंदिर की यात्रा",
  ],
  enroute_rest: [
    "En-route rest — stop to confirm",
    "మార్గంలో విశ్రాంతి — స్థలం నిర్ధారించాలి",
    "रास्ते में विश्राम — स्थान की पुष्टि करें",
  ],
  wait_for_meal: [
    "Wait for meal break",
    "భోజన విరామం వరకు వేచి ఉండండి",
    "भोजन विराम की प्रतीक्षा",
  ],
  freeDay: [
    "No mandatory temple stops scheduled. Free time at your daily base; no attractions or hotel transfers have been invented.",
    "తప్పనిసరి ఆలయ దర్శనాలు లేవు. రోజువారీ ప్రారంభ స్థలంలో ఖాళీ సమయం; ఆకర్షణలు లేదా హోటల్ ప్రయాణాలు ఊహించలేదు.",
    "कोई अनिवार्य मंदिर पड़ाव तय नहीं। दैनिक आधार पर खाली समय; आकर्षण या होटल यात्रा गढ़ी नहीं गई।",
  ],
  completed: [
    "Draft ready for review",
    "పరిశీలనకు ప్రణాళిక సిద్ధం",
    "प्रारूप समीक्षा के लिए तैयार",
  ],
  needs_changes: ["Review required", "పరిశీలన అవసరం", "समीक्षा आवश्यक"],
  failed: ["Planning failed", "ప్రణాళిక విఫలమైంది", "योजना विफल"],
  cancelled: ["Cancelled", "రద్దయింది", "रद्द"],
  interrupted: [
    "Worker interrupted — retry",
    "ప్రక్రియ ఆగింది — మళ్లీ ప్రయత్నించండి",
    "प्रक्रिया बाधित — फिर कोशिश करें",
  ],
  car: ["Car", "కారు", "कार"],
  bus: ["Bus", "బస్సు", "बस"],
  train: ["Train", "రైలు", "ट्रेन"],
  taxi: ["Taxi", "టాక్సీ", "टैक्सी"],
  none: ["None", "ఏదీ లేదు", "कोई नहीं"],
  hotel: ["Hotel", "హోటల్", "होटल"],
  guest: ["Guest house", "అతిథి గృహం", "अतिथि गृह"],
  dham: [
    "Dharamshala / pilgrim stay",
    "యాత్రికుల వసతి",
    "धर्मशाला / तीर्थयात्री आवास",
  ],
  veg: ["Vegetarian", "శాకాహారం", "शाकाहारी"],
  nonveg: ["Non-vegetarian", "మాంసాహారం", "मांसाहारी"],
  jain: ["Jain", "జైన్", "जैन"],
  any: ["Any", "ఏదైనా", "कोई भी"],
  wheel: ["Wheelchair access", "వీల్‌చైర్ సౌకర్యం", "व्हीलचेयर सुविधा"],
  elder: ["Elderly assistance", "వృద్ధులకు సహాయం", "बुजुर्गों को सहायता"],
  medical: ["Medical requirements", "వైద్య అవసరాలు", "चिकित्सा आवश्यकताएँ"],
  NO_VERIFIED_SCHEDULE_FOUND: [
    "No complete schedule found within the bounded search; this is not a proof of impossibility.",
    "పరిమిత శోధనలో పూర్తి ప్రణాళిక దొరకలేదు; ఇది అసాధ్యమని రుజువు కాదు.",
    "सीमित खोज में पूर्ण कार्यक्रम नहीं मिला; यह असंभव होने का प्रमाण नहीं है।",
  ],
  KNOWN_COSTS_EXCEED_CAP: [
    "Known costs already exceed your cap.",
    "తెలిసిన ఖర్చులే మీ పరిమితిని మించాయి.",
    "ज्ञात लागत ही आपकी सीमा से अधिक है।",
  ],
  BUDGET_NOT_FULLY_PRICED: [
    "The full budget cap cannot be verified: prices are missing.",
    "ధరలు లేనందున పూర్తి బడ్జెట్ పరిమితిని నిర్ధారించలేము.",
    "कीमतें न होने से पूर्ण बजट सीमा की पुष्टि नहीं हो सकती।",
  ],
  ACCESS_REQUIREMENTS_UNVERIFIED: [
    "Your access or medical requirements need direct venue confirmation.",
    "మీ సులభత/వైద్య అవసరాలను వేదికతో నేరుగా నిర్ధారించాలి.",
    "सुलभता या चिकित्सा आवश्यकताओं की स्थल से सीधे पुष्टि करें।",
  ],
  SERVICE_TIMETABLE_UNVERIFIED: [
    "A road scenario is shown, not a verified bus/train service timetable.",
    "ఇది రహదారి అంచనా మాత్రమే; నిర్ధారించిన బస్సు/రైలు సమయ పట్టిక కాదు.",
    "सड़क अनुमान दिखाया गया है, सत्यापित बस/ट्रेन समयसारिणी नहीं।",
  ],
  sourceNotice: [
    "Catalog facts and technical evidence remain in their published language. Confirm current hours and availability directly.",
    "జాబితా విషయాలు, సాంకేతిక ఆధారాలు ప్రచురిత భాషలోనే ఉంటాయి. ప్రస్తుత సమయాలు, లభ్యతను నేరుగా నిర్ధారించండి.",
    "सूची के तथ्य और तकनीकी साक्ष्य प्रकाशित भाषा में हैं। वर्तमान समय और उपलब्धता की सीधे पुष्टि करें।",
  ],
  budgetTier: ["Budget preference", "బడ్జెట్ ప్రాధాన్యం", "बजट पसंद"],
  low: ["Budget", "తక్కువ ఖర్చు", "किफ़ायती"],
  mid: ["Mid-range", "మధ్యస్థ ఖర్చు", "मध्यम"],
  high: ["Higher-end", "అధిక శ్రేణి", "उच्च श्रेणी"],
  priorities: ["Priorities", "ప్రాధాన్యాలు", "प्राथमिकताएँ"],
  darshan: ["Darshan", "దర్శనం", "दर्शन"],
  family: [
    "Family / gentler pace",
    "కుటుంబం / నెమ్మది ప్రయాణం",
    "परिवार / धीमी गति",
  ],
  history: ["History", "చరిత్ర", "इतिहास"],
  shakti: ["Shakti devotion", "శక్తి ఆరాధన", "शक्ति भक्ति"],
  quick: [
    "Fewer active days / quicker plan",
    "తక్కువ క్రియాశీల రోజులు / వేగవంతమైన ప్రణాళిక",
    "कम सक्रिय दिन / तेज़ योजना",
  ],
  budgetTitle: ["Budget estimate", "బడ్జెట్ అంచనా", "बजट अनुमान"],
  fuelBasis: [
    "Route kilometres × configured fuel rate, per vehicle. Not a live fuel quote.",
    "మార్గ కిలోమీటర్లు × నిర్ణీత ఇంధన రేటు, వాహనానికి. ప్రత్యక్ష ధర కాదు.",
    "मार्ग किलोमीटर × निर्धारित ईंधन दर, प्रति वाहन। लाइव कोटेशन नहीं।",
  ],
  foodBasis: [
    "Three meals per person per day; catalog-price scenario, not a restaurant booking.",
    "రోజుకు ప్రతి వ్యక్తికి మూడు భోజనాలు; జాబితా ధరల అంచనా, రెస్టారెంట్ బుకింగ్ కాదు.",
    "हर व्यक्ति के लिए प्रतिदिन तीन भोजन; सूची कीमत का अनुमान, रेस्तराँ बुकिंग नहीं।",
  ],
  stayBasis: [
    "Requested nights × requested rooms; room occupancy, category, dates and availability are unconfirmed.",
    "కోరిన రాత్రులు × కోరిన గదులు; సామర్థ్యం, రకం, తేదీలు, లభ్యత నిర్ధారించలేదు.",
    "माँगी गई रातें × कमरे; क्षमता, श्रेणी, तारीख और उपलब्धता अपुष्ट हैं।",
  ],
  "Catalog hours and charges are not live availability. Confirm date-specific changes with the temple.":
    [
      "Catalog hours and charges are not live availability. Confirm date-specific changes with the temple.",
      "జాబితా సమయాలు, ధరలు ప్రత్యక్ష లభ్యత కాదు. తేదీకి వర్తించే మార్పులను ఆలయంతో నిర్ధారించండి.",
      "सूची समय और शुल्क लाइव उपलब्धता नहीं। तारीख के बदलाव मंदिर से पुष्ट करें।",
    ],
  "Visit length includes a user-selected planning allowance, not a measured queue forecast.":
    [
      "Visit length includes a user-selected planning allowance, not a measured queue forecast.",
      "దర్శన సమయం వినియోగదారు ఎంచుకున్న అంచనా; కొలిచిన క్యూ సమయం కాదు.",
      "दर्शन अवधि उपयोगकर्ता का अनुमान है, मापी हुई कतार भविष्यवाणी नहीं।",
    ],
  "Each day starts and returns to the supplied origin; hotels/attractions are unscheduled options. Lunch/dinner and en-route rests are planning allowances; venues are unconfirmed.":
    [
      "Each day starts and returns to the supplied origin; hotels/attractions are unscheduled options. Lunch/dinner and en-route rests are planning allowances; venues are unconfirmed.",
      "ప్రతి రోజు ఇచ్చిన ప్రారంభ స్థలానికి తిరిగి వస్తారు. హోటళ్లు/ఆకర్షణలు సమయ పట్టికలో లేవు. భోజనం, విశ్రాంతి సమయాలు అంచనాలు; స్థలాలు నిర్ధారించలేదు.",
      "हर दिन दिए शुरुआती स्थान से प्रस्थान और वापसी होती है। होटल/आकर्षण समयबद्ध नहीं। भोजन और विश्राम समय अनुमान हैं; स्थल अपुष्ट हैं।",
    ],
  "Hotel, meal and nearby-attraction listings are options; their transfers/opening times are not scheduled or confirmed.":
    [
      "Hotel, meal and nearby-attraction listings are options; their transfers/opening times are not scheduled or confirmed.",
      "హోటల్, భోజనం, ఆకర్షణలు ఎంపికలు మాత్రమే; ప్రయాణాలు/తెరిచే సమయాలు నిర్ణయించలేదు లేదా నిర్ధారించలేదు.",
      "होटल, भोजन और आकर्षण विकल्प मात्र हैं; आने-जाने और खुलने का समय तय या पुष्ट नहीं है।",
    ],
  "Some routes are unavailable or straight-line scenarios; do not treat them as verified road times.":
    [
      "Some routes are unavailable or straight-line scenarios; do not treat them as verified road times.",
      "కొన్ని మార్గాలు అందుబాటులో లేవు లేదా సరళరేఖ అంచనాలు; నిర్ధారించిన రహదారి సమయాలుగా భావించవద్దు.",
      "कुछ मार्ग अनुपलब्ध या सीधी-रेखा अनुमान हैं; इन्हें सत्यापित सड़क समय न मानें।",
    ],
  "Timeline uses a road-based scenario, NOT a bus/train timetable. Confirm service, boarding point, transfers and fares before travel.":
    [
      "Timeline uses a road-based scenario, NOT a bus/train timetable. Confirm service, boarding point, transfers and fares before travel.",
      "సమయ పట్టిక రహదారి అంచనా మాత్రమే, బస్సు/రైలు పట్టిక కాదు. సర్వీస్, ఎక్కే స్థలం, మార్పులు, ఛార్జీలను నిర్ధారించండి.",
      "यह सड़क अनुमान है, बस/ट्रेन समयसारिणी नहीं। सेवा, चढ़ने का स्थान, बदलाव और किराया पुष्ट करें।",
    ],
  "Taxi availability and fare are unverified; obtain a quote.": [
    "Taxi availability and fare are unverified; obtain a quote.",
    "టాక్సీ లభ్యత, ఛార్జీలు నిర్ధారించలేదు; ధర అడగండి.",
    "टैक्सी उपलब्धता और किराया अपुष्ट हैं; कोटेशन लें।",
  ],
  "Accessibility / medical suitability is not certified. Contact each venue; extra visit time alone does not prove access.":
    [
      "Accessibility / medical suitability is not certified. Contact each venue; extra visit time alone does not prove access.",
      "సులభత/వైద్య అనుకూలత ధృవీకరించలేదు. ప్రతి స్థలాన్ని సంప్రదించండి; అదనపు సమయం సౌకర్యాలకు రుజువు కాదు.",
      "सुलभता/चिकित्सा उपयुक्तता प्रमाणित नहीं। हर स्थल से संपर्क करें; अतिरिक्त समय सुविधा का प्रमाण नहीं है।",
    ],
  "No verified matching dietary options are returned by this adapter. Confirm directly; unknown diet is not a match.":
    [
      "No verified matching dietary options are returned by this adapter. Confirm directly; unknown diet is not a match.",
      "సరిపోలే నిర్ధారిత ఆహార ఎంపికలు లేవు. నేరుగా నిర్ధారించండి; తెలియని ఆహారం సరిపోలిక కాదు.",
      "मेल खाते सत्यापित आहार विकल्प नहीं मिले। सीधे पुष्टि करें; अज्ञात आहार को मिलान नहीं माना गया।",
    ],
  "Nearby attractions are listed with map links but not inserted into the timed route; their hours and visit duration need confirmation.":
    [
      "Nearby attractions are listed with map links but not inserted into the timed route; their hours and visit duration need confirmation.",
      "ఆకర్షణలకు మ్యాప్ లింకులు ఉన్నాయి, కానీ సమయ మార్గంలో చేర్చలేదు; సమయాలు, వ్యవధి నిర్ధారించాలి.",
      "आकर्षण के मानचित्र लिंक हैं, लेकिन समयबद्ध मार्ग में शामिल नहीं; समय और अवधि पुष्ट करें।",
    ],
  "Accommodation category, room capacity, nightly availability and hotel transfers require confirmation. Daily routing still uses your origin as base.":
    [
      "Accommodation category, room capacity, nightly availability and hotel transfers require confirmation. Daily routing still uses your origin as base.",
      "వసతి రకం, గది సామర్థ్యం, రాత్రి లభ్యత, హోటల్ ప్రయాణాలు నిర్ధారించాలి. రోజువారీ మార్గానికి ప్రారంభ స్థలమే ఆధారం.",
      "आवास श्रेणी, कमरे की क्षमता, उपलब्धता और होटल यात्रा पुष्ट करें। दैनिक मार्ग का आधार आपका शुरुआती स्थान ही है।",
    ],
  "Temple tickets / optional sevas: confirm selected services and current charges":
    [
      "Temple tickets / optional sevas: confirm selected services and current charges",
      "ఆలయ టికెట్లు/ఐచ్ఛిక సేవలు: ఎంచుకున్న సేవలు, ప్రస్తుత ఛార్జీలు నిర్ధారించండి",
      "मंदिर टिकट/वैकल्पिक सेवा: चयनित सेवा और वर्तमान शुल्क पुष्ट करें",
    ],
  "Tolls, parking and any booking taxes not supplied by providers": [
    "Tolls, parking and any booking taxes not supplied by providers",
    "టోల్, పార్కింగ్, ప్రొవైడర్లు ఇవ్వని బుకింగ్ పన్నులు",
    "टोल, पार्किंग और प्रदाता से न मिले बुकिंग कर",
  ],
  "Public transport fares / taxi quote: not available; platform search is not a fare":
    [
      "Public transport fares / taxi quote: not available; platform search is not a fare",
      "ప్రజా రవాణా/టాక్సీ ధరలు లేవు; ప్లాట్‌ఫారమ్ శోధన ధర కాదు",
      "सार्वजनिक परिवहन/टैक्सी किराया उपलब्ध नहीं; प्लेटफ़ॉर्म खोज किराया नहीं है",
    ],
  "Food prices matching your dietary requirements": [
    "Food prices matching your dietary requirements",
    "మీ ఆహార అవసరాలకు సరిపోలే ధరలు",
    "आपके आहार के अनुरूप भोजन मूल्य",
  ],
  "Accommodation price and occupancy": [
    "Accommodation price and occupancy",
    "వసతి ధర, గది సామర్థ్యం",
    "आवास मूल्य और कमरे की क्षमता",
  ],
  "Contact the venues before accepting this draft.": [
    "Contact the venues before accepting this draft.",
    "ఈ ప్రణాళికను అంగీకరించే ముందు వేదికలను సంప్రదించండి.",
    "यह प्रारूप स्वीकारने से पहले स्थलों से संपर्क करें।",
  ],
  "Road scenario only; confirm services and transfer times.": [
    "Road scenario only; confirm services and transfer times.",
    "రహదారి అంచనా మాత్రమే; సర్వీసులు, మార్పుల సమయాలు నిర్ధారించండి.",
    "सड़क अनुमान मात्र; सेवा और बदलाव का समय पुष्ट करें।",
  ],
  ...planningV21Copy,
};
export function planningT(lang: AppLanguage, key: string) {
  return copy[key]?.[lang === "te" ? 1 : lang === "hi" ? 2 : 0] || key;
}

export const planningCopyKeys = Object.keys(copy);
