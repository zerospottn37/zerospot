import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC1iV5uNsYRdK_q8nrNqCMZJfB54UKn45A",
  authDomain: "zerospot-ea705.firebaseapp.com",
  projectId: "zerospot-ea705",
  storageBucket: "zerospot-ea705.firebasestorage.app",
  messagingSenderId: "716557257470",
  appId: "1:716557257470:web:cc905e3ce7735257e433af",
  measurementId: "G-2DR48BQTCM"
};

// ─── UNIFIED SPACE & TIERED SERVICE ARCHITECTURE (APP SYNCHRONIZED) ─
const SPACES = [
  {
    id: "home",
    name: "Home Care",
    badge: "Residential",
    description: "Mechanized deep cleaning and hygiene care for flats, villas, and independent houses.",
    packages: [
      {
        id: "home-basic",
        spaceId: "home",
        space: "Home Care",
        tier: "Basic",
        title: "Basic Home Cleaning",
        tagline: "Floors, Bathrooms, Kitchen & Rooms",
        text: "Essential mechanized floor scrubbing, complete bathroom tile descaling, kitchen counter wipe, and room high-dusting.",
        highlights: [
          "Mechanized floor scrubbing & neutral mopping",
          "Complete bathroom tile descaling & toilet sanitization"
        ],
        amenities: [
          "Mechanized floor rotary scrubbing & aromatic mopping",
          "Complete bathroom tile descaling & toilet sanitization",
          "Kitchen countertops, sink & stove wipe-down",
          "Bedrooms & living area dusting & high-touch wipe"
        ],
        image: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=800&q=80",
        duration: "3 - 4 hrs",
        rating: 4.95,
        reviewCount: 380,
        price: 1899,
        originalPrice: 2199
      },
      {
        id: "home-standard",
        spaceId: "home",
        space: "Home Care",
        tier: "Standard",
        title: "Standard Home Cleaning",
        tagline: "thorough care, spotless home. Windows & Woodwork",
        text: "Includes all Basic cleaning PLUS streak-free window glass washing, woodwork polishing, and electrical fixture detailing.",
        highlights: [
          "Window glass wash & sliding track detailing",
          "Doors, frames, wardrobes & switchboard polish"
        ],
        amenities: [
          "Everything included in Basic Cleaning",
          "Interior & exterior window glass wash & track detailing",
          "Doors, frames, wardrobes & woodwork polish",
          "Switchboards, ceiling fans, and lighting fixtures detailed"
        ],
        image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80",
        duration: "4 - 5 hrs",
        rating: 4.98,
        reviewCount: 420,
        price: 2499,
        originalPrice: 2899,
        popular: true
      },
      {
        id: "home-premium",
        spaceId: "home",
        space: "Home Care",
        tier: "Platinum",
        title: "Home Deep Cleaning",
        tagline: "Whole Home Transformation, Balcony Pressure Wash & Steam",
        text: "Complete top-to-bottom transformation: deep steam sanitization, HEPA vacuuming, mechanized floor polishing, and balcony power jet wash.",
        highlights: [
          "Hospital-grade HEPA steam sanitization",
          "Rotary mechanized floor scrub & balcony power wash"
        ],
        amenities: [
          "Everything in Basic & Standard Cleaning",
          "High-temperature HEPA steam sanitization & odor elimination",
          "Balcony high-pressure rotary floor power jet wash",
          "Appliance exterior scrub and Zero-odor guarantee"
        ],
        image: "https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=800&q=80",
        duration: "5 - 6 hrs",
        rating: 4.99,
        reviewCount: 512,
        price: 3099,
        originalPrice: 3500
      }
    ]
  },
  {
    id: "hotel",
    name: "Hotel & Hospitality",
    badge: "5-Star Protocol",
    description: "Certified turnover protocol, banquet hall sanitization, and luxury suite detailing.",
    packages: [
      {
        id: "hotel-basic",
        spaceId: "hotel",
        space: "Hotel & Hospitality",
        tier: "Basic",
        title: "Basic Hotel Turnover",
        tagline: "Floors, Bathrooms, Pantry & Guest Rooms",
        text: "Rapid room turnover protocol with floor rotary buffing, bathroom descaling, fixture wipe, and fresh linen setup.",
        highlights: [
          "Guest room & corridor mechanized floor buffing",
          "Bathroom descaling, fixture polish & glass wipe"
        ],
        amenities: [
          "Mechanized guest room & corridor floor buffing",
          "Bathroom descaling, fixture polish & glass wipe",
          "Pantry & minibar surface disinfection",
          "High-touch point bio-sanitization (handles, remotes, switches)"
        ],
        image: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80",
        duration: "2 - 3 hrs / room",
        rating: 4.96,
        reviewCount: 290,
        price: 2999,
        originalPrice: 3500
      },
      {
        id: "hotel-cleaning",
        spaceId: "hotel",
        space: "Hotel & Hospitality",
        tier: "Standard",
        title: "Hotel Cleaning",
        tagline: "Basic Turnover + Windows, Drapes & Woodwork",
        text: "Includes all Basic turnover PLUS facade glass & window polish, drape steam refresh, wooden headboard polish, and odor neutralization.",
        highlights: [
          "Full window facade glass wash & track cleaning",
          "Drapes, curtains & headboard upholstery steam refresh"
        ],
        amenities: [
          "Everything in Basic Hotel Turnover",
          "Full window facade glass wash & track cleaning",
          "Drapes, curtains & headboard upholstery steam refresh",
          "Lobby & reception area glass & metal fixture polish"
        ],
        image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80",
        duration: "4 - 5 hrs",
        rating: 4.98,
        reviewCount: 345,
        price: 4299,
        originalPrice: 5000,
        popular: true
      },
      {
        id: "hotel-premium",
        spaceId: "hotel",
        space: "Hotel & Hospitality",
        tier: "Premium",
        title: "Premium 5-Star Turnover & Suites",
        tagline: "Complete Suite Detailing, Banquet Hall & Steam",
        text: "Hospital-grade suite restoration, banquet hall detailing, deep upholstery wet extraction, and ozone air purification.",
        highlights: [
          "Banquet & conference hall deep carpet shampooing",
          "Hospital-grade ozone/steam microbial fogging"
        ],
        amenities: [
          "Everything in Basic & Standard Hospitality",
          "Banquet & conference hall deep carpet shampooing",
          "Hospital-grade ozone/steam microbial fogging",
          "Marble and granite mechanized floor diamond buffing"
        ],
        image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80",
        duration: "Full Shift",
        rating: 5.00,
        reviewCount: 460,
        price: 5999,
        originalPrice: 7200
      }
    ]
  },
  {
    id: "company",
    name: "Company & Offices",
    badge: "Corporate Enterprise",
    description: "Corporate workstation sanitization, glass facades, and meeting room hygiene.",
    packages: [
      {
        id: "company-basic",
        spaceId: "company",
        space: "Company & Offices",
        tier: "Basic",
        title: "Basic Office Cleaning",
        tagline: "Workstations, Restrooms, Cafeteria & Floors",
        text: "Corporate maintenance including workstation wipe, restroom multi-point disinfection, cafeteria pantry scrub, and floor rotary mopping.",
        highlights: [
          "Workstation desk surface & monitor screen wipe",
          "Corporate restroom descaling & sanitizer wipe"
        ],
        amenities: [
          "Workstation desk surface & monitor screen wipe",
          "Corporate restroom descaling & sanitization",
          "Cafeteria dining tables, counters & sink scrub",
          "Mechanized floor scrubbing with neutral bio-detergents"
        ],
        image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80",
        duration: "3 - 5 hrs",
        rating: 4.94,
        reviewCount: 310,
        price: 2899,
        originalPrice: 3400
      },
      {
        id: "company-cleaning",
        spaceId: "company",
        space: "Company & Offices",
        tier: "Standard",
        title: "Company Cleaning",
        tagline: "Partitions, Ergonomic Chairs & Boardroom",
        text: "Includes all Basic cleaning PLUS conference room glass partitions, ergonomic chair vacuuming, presentation screen polish, and woodwork care.",
        highlights: [
          "Glass cubicle partitions & window detailing",
          "Ergonomic mesh chair HEPA vacuuming"
        ],
        amenities: [
          "Everything in Basic Office Cleaning",
          "Glass cubicle partitions & external window detailing",
          "Ergonomic mesh/fabric chair HEPA dry vacuuming",
          "Conference room audio-visual console & table polish"
        ],
        image: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=80",
        duration: "5 - 7 hrs",
        rating: 4.97,
        reviewCount: 388,
        price: 3499,
        originalPrice: 4200,
        popular: true
      },
      {
        id: "company-premium",
        spaceId: "company",
        space: "Company & Offices",
        tier: "Enterprise",
        title: "Premium Corporate Overhaul",
        tagline: "Commercial Carpet Shampoo & High-Rise Facade",
        text: "Enterprise whole-facility deep overhaul: commercial carpet wet extraction shampoo, high-rise facade glass washing, and complete HVAC grille sanitization.",
        highlights: [
          "Full corporate carpet shampoo & wet extraction",
          "High-rise facade glass streak-free wash"
        ],
        amenities: [
          "Everything in Basic & Standard Office Cleaning",
          "Full corporate carpet shampoo & high-power extraction",
          "High-rise facade glass streak-free wash with safety rigging",
          "HVAC ceiling diffuser vents & return grille degreasing"
        ],
        image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=800&q=80",
        duration: "Full Facility",
        rating: 4.99,
        reviewCount: 425,
        price: 6499,
        originalPrice: 7800
      }
    ]
  },
  {
    id: "ac",
    name: "A/C Services",
    badge: "HVAC Engineering",
    description: "High-precision pressure jet washing, gas replenishment, and micro-diagnostics for all air conditioner makes.",
    packages: [
      {
        id: "ac-cleaning",
        spaceId: "ac",
        space: "A/C Services",
        tier: "Power Wash",
        title: "A/C Services",
        tagline: "Indoor + Outdoor High-Pressure Flush",
        text: "Deep mechanized power jet wash for indoor cooling coils, blower fan drum, drain pipe flush, and outdoor condenser wash with water catchment jacket.",
        highlights: [
          "Indoor evaporator coil & blower fan drum jet spray",
          "Outdoor condenser flush with waterproof jacket"
        ],
        amenities: [
          "Indoor evaporator coil high-pressure wash",
          "Blower roller drum scrub & drain tray flush",
          "Outdoor condenser unit power jet spray",
          "Antimicrobial coil shield application"
        ],
        image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80",
        duration: "45 mins / unit",
        rating: 4.98,
        reviewCount: 620,
        price: 499,
        originalPrice: 650,
        popular: true
      },
      {
        id: "ac-complaint-diagnostics",
        spaceId: "ac",
        space: "A/C Services",
        tier: "Diagnostic",
        title: "A/C Problem & Diagnostics",
        tagline: "Inverter Logic Board, Gas & Sensor Check",
        text: "Complete troubleshooting for cooling failure, water leakage, strange noises, error codes, and compressor tripping.",
        highlights: [
          "Diagnostic readout for inverter IPM & error codes",
          "Ampere, voltage & refrigerant pressure test"
        ],
        amenities: [
          "Diagnostic code readout & electrical probe",
          "Inverter IPM & capacitor load testing",
          "Thermistor sensor calibration & replacement check",
          "Transparent fault report with zero hidden costs"
        ],
        image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80",
        duration: "45 - 60 mins",
        rating: 4.99,
        reviewCount: 350,
        price: 299,
        originalPrice: 399
      },
      {
        id: "ac-gas-refill",
        spaceId: "ac",
        space: "A/C Services",
        tier: "Gas Refill",
        title: "Gas Leak Detection & Refrigerant Refill",
        tagline: "100% Genuine R32 / R410A / R22 Refill",
        text: "Precision nitrogen pressure testing to locate micro leaks, brazing repair, vacuum pump moisture purge, and digital gauge refrigerant refill.",
        highlights: [
          "Nitrogen pressure testing & leak location",
          "Deep vacuum purge & genuine weighed gas refill"
        ],
        amenities: [
          "Digital manifold gauge pressure testing",
          "Copper joint soap-bubble / nitrogen leak check",
          "Vacuum pump deep moisture evacuation",
          "Genuine weighed refrigerant replenishment"
        ],
        image: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=800&q=80",
        duration: "60 - 90 mins",
        rating: 4.97,
        reviewCount: 410,
        price: 1499,
        originalPrice: 1899
      }
    ]
  }
];

// Flat SERVICES list derived from SPACES
const SERVICES = [];
SPACES.forEach((space) => {
  space.packages.forEach((pkg) => {
    SERVICES.push({
      ...pkg,
      category: space.name,
      filterCategory: space.name,
      guideCategory: space.id === "ac" ? "ac" : space.id === "hotel" ? "dining" : space.id === "company" ? "commercial" : "home"
    });
  });
});

// Map legacy IDs to packages for seamless routing
const SERVICE_ID_MAP = {
  "home-deep-cleaning": "home-premium",
  "home-cleaning": "home-standard",
  "home-basic": "home-basic",
  "home-standard": "home-standard",
  "home-premium": "home-premium",
  "bathroom-cleaning": "home-basic",
  "bathroom-single": "home-basic",
  "bathroom-premium": "home-premium",
  "sofa-carpet-clean": "home-standard",
  "sofa-3seater": "home-basic",
  "sofa-full-living": "home-premium",
  "kitchen-cleaning": "home-standard",
  "chimney-cleaning": "home-basic",
  "kitchen-premium": "home-premium",
  "window-cleaning": "home-standard",
  "hotel-cleaning": "hotel-cleaning",
  "hotel-basic": "hotel-basic",
  "hotel-standard": "hotel-cleaning",
  "hotel-premium": "hotel-premium",
  "restaurant-cleaning": "hotel-cleaning",
  "restaurant-dining": "hotel-basic",
  "restaurant-premium": "hotel-premium",
  "company-cleaning": "company-cleaning",
  "company-basic": "company-basic",
  "company-standard": "company-cleaning",
  "company-premium": "company-premium",
  "ac-cleaning": "ac-cleaning",
  "ac-jet-wash": "ac-cleaning",
  "ac-complaint-diagnostics": "ac-complaint-diagnostics",
  "ac-pcb-diagnostics": "ac-complaint-diagnostics",
  "ac-gas-refill": "ac-gas-refill",
  "solar-panel-cleaning": "home-premium",
  "water-tank-cleaning": "home-standard",
  "sump-cleaning": "home-premium"
};

// ─── CLEANING GUIDES BLUEPRINTS (PORTED FROM APP) ────────────────────
const CLEANING_GUIDES = {
  home: {
    categoryBadge: "HOME CARE GUIDE",
    title: "Home Cleaning: Area-by-Area Protocol",
    subtitle: "Complete room-by-room breakdown detailing tasks, non-toxic bio formulations, and mechanized equipment.",
    equipment: ["Industrial HEPA Vacuum", "Rotary Floor Scrubber", "High-Pressure Steam Machine", "Microfiber Glass Applicators", "Organic Citrus Degreasers"],
    areas: [
      {
        name: "Hall & Living Area",
        badge: "High-Touch Zone",
        tasks: [
          "Ceiling fan blades, light fixtures, and decorative cornices high-dusted",
          "Sofa and fabric upholstery dry vacuumed with micro-particle HEPA suction",
          "TV console, audio systems, display cabinets, and glass shelves buffed",
          "Switchboards, door handles, skirting boards sanitized with bio-wipes",
          "Mechanized floor scrubbing with rotary buffer & aromatic neutral mopping"
        ]
      },
      {
        name: "Bedrooms & Sleep Zones",
        badge: "Allergen Free",
        tasks: [
          "Mattress dust-mite dry vacuuming and sanitization treatment",
          "Wardrobe exteriors, dressing mirrors, and bedside tables wiped streak-free",
          "Under-bed and heavy furniture perimeter vacuumed and cleaned",
          "Curtain rods, window grilles, and sliding glass tracks detailed",
          "Antibacterial floor scrub with baby & pet-safe solution"
        ]
      },
      {
        name: "Kitchen Detailing",
        badge: "Deep Degrease",
        tasks: [
          "Countertops scrubbed to remove hardened spice, sauce, and oil stains",
          "Tile backsplash washed with citrus-based food-safe degreasing solution",
          "Exhaust fan and chimney exterior mesh cleaned of grease buildup",
          "Stainless steel sink, drain rim, and faucets descaled and polished",
          "Cabinet door faces, handles, and kitchen floor wet scrubbed"
        ]
      },
      {
        name: "Bathrooms & Washrooms",
        badge: "Germ Sanitized",
        tasks: [
          "Hard-water limescale and calcium removal on wall and floor tiles",
          "Toilet bowl, seat, hinge base, and tank acid-free sanitized",
          "Shower partition glass buffed to remove cloudy water spots",
          "Washbasin, vanity mirrors, and chrome fixtures polished to high shine",
          "Floor drain traps cleared and flushed with odor-neutralizer"
        ]
      },
      {
        name: "Balcony & Utility Area",
        badge: "Pressure Washed",
        tasks: [
          "Balcony floor pressure washed to lift moss, algae, and outdoor dirt",
          "Railing bars, glass balcony panels, and window exteriors cleaned",
          "Washing machine exterior wipe and utility drain trap clearance"
        ]
      }
    ]
  },
  commercial: {
    categoryBadge: "COMMERCIAL & CORPORATE GUIDE",
    title: "Corporate Facility & Office Protocol",
    subtitle: "Enterprise-grade sanitation standards for corporate headquarters, client reception, and shared facilities.",
    equipment: ["Dual-Motor Carpet Extractor", "Hospital-Grade Disinfectant Fogger", "Streak-Free Squeegees", "Antistatic Surface Wipes"],
    areas: [
      {
        name: "Workstations & Cubicles",
        badge: "Disinfected",
        tasks: [
          "Desktops, monitor backs, and cable organizers wiped with antistatic cleaner",
          "Ergonomic mesh/leather office chairs vacuumed and spot-treated",
          "Under-desk carpet dry vacuumed to eliminate accumulated dust and debris",
          "Partition screens and divider glass buffed streak-free"
        ]
      },
      {
        name: "Boardrooms & Executive Suites",
        badge: "Client-Ready",
        tasks: [
          "Conference table buffed and polished to pristine reflective shine",
          "Audio-visual equipment perimeter and presentation screens detailed",
          "Full floor vacuuming and deodorizing with fresh corporate scent"
        ]
      },
      {
        name: "Pantry & Restroom Blocks",
        badge: "Food & Bio-Safe",
        tasks: [
          "Coffee machine stations, sinks, and microwave interiors sanitized",
          "High-traffic commercial restroom fixtures and urinal traps sterilized",
          "Waste bin enclosures disinfected and trash chute areas deodorized"
        ]
      }
    ]
  },
  dining: {
    categoryBadge: "HOSPITALITY & DINING GUIDE",
    title: "Restaurant Kitchen & Hotel Turnover Protocol",
    subtitle: "Stringent food-safety certified commercial degreasing and 5-star hotel room turnover hygiene.",
    equipment: ["High-Temp Steam Sterilizer", "Heavy-Duty Alkaline Degreaser", "Industrial Floor Jet Scrubber", "Linen Refresh Steamer"],
    areas: [
      {
        name: "Commercial Kitchen Hot Line",
        badge: "Fire & Health Safe",
        tasks: [
          "Commercial exhaust hoods and baffle filters soaked and degreased",
          "Prep counters, cutting table bases, and stainless steel walls steam-sanitized",
          "Deep fryer splash zones and range burner surrounds scrubbed",
          "Quarry tile kitchen floors rotary scrubbed with non-slip safety detergent"
        ]
      },
      {
        name: "Dining Hall & Guest Rooms",
        badge: "Turnover Grade",
        tasks: [
          "Dining tables, booth upholstery, and bar counters disinfected",
          "Hotel mattresses, headboards, and linens steam-refreshed",
          "Guest room bathrooms descaled, mirrors buffed, and fixtures sterilized"
        ]
      }
    ]
  },
  ac: {
    categoryBadge: "A/C ENGINEERING GUIDE",
    title: "A/C Jet Wash & Diagnostics Protocol",
    subtitle: "Restoring optimal airflow thermodynamics, removing mold, and reducing electrical consumption.",
    equipment: ["Waterproof A/C Service Jacket", "Variable Pressure Jet Pump", "Antibacterial Coil Foam", "Digital Refrigerant Gauges"],
    areas: [
      {
        name: "Indoor Evaporator Unit",
        badge: "Air Purity",
        tasks: [
          "High-pressure water jet flush through cooling coil fins to remove lodged slime",
          "Blower roller fan washed clean of mold spores and heavy lint",
          "Drain pan and condensation pipe flushed to eliminate water dripping",
          "Antibacterial bio-spray applied to prevent microbial odors"
        ]
      },
      {
        name: "Outdoor Condenser & Diagnostics",
        badge: "Cooling Efficiency",
        tasks: [
          "Outdoor condenser coil flushed clear of road dust and atmospheric grime",
          "Refrigerant gas pressure check (R32 / R410A) with digital manifold gauge",
          "Compressor amp load and electrical terminal tightness verification"
        ]
      }
    ]
  }
};

let app;
let auth;
let db;
let currentUser = null;
let currentGuideCategory = "home";

try {
  app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.log("[Zero Spot Web] Firebase running in standalone mode.");
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function toast(message) {
  const existing = document.querySelector(".zs-toast");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = "zs-toast";
  el.style.cssText = `
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 2000;
    background: #090d16;
    color: #ffffff;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 700;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    border: 1px solid rgba(141, 223, 0, 0.4);
    display: flex;
    align-items: center;
    gap: 8px;
    animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;
  el.innerHTML = `<span>✨</span><span>${message}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ─── LOCAL STORAGE PERSISTENCE ───────────────────────────────────────
function getRecentBookings() {
  try {
    const raw = localStorage.getItem("zs_customer_bookings");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentBooking(b) {
  try {
    const list = getRecentBookings();
    list.unshift(b);
    localStorage.setItem("zs_customer_bookings", JSON.stringify(list.slice(0, 10)));
  } catch (err) {
    console.warn("Could not save to localStorage:", err);
  }
}

// ─── APPOINTMENT-MATCHED SQUARE SERVICES CATALOG ─────────────────────
const SQUARE_SERVICES = [
  {
    slug: "home-cleaning",
    title: "Home Cleaning",
    category: "home",
    theme: "sky",
    tag: "Residential",
    desc: "1 to 5 BHK full deep clean, living areas, rooms, floors & bathrooms.",
    price: "From ₹1,899",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
  },
  {
    slug: "bathroom-cleaning",
    title: "Bathroom Cleaning",
    category: "home",
    theme: "emerald",
    tag: "Sanitization",
    desc: "Deep tile descaling, hard-water stain removal, fittings & mirror polish.",
    price: "From ₹499",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16a1 1 0 0 1 1 1v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3a1 1 0 0 1 1-1Z"/><path d="M6 12V5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v1"/><path d="M4 21v1"/><path d="M20 21v1"/></svg>`
  },
  {
    slug: "sofa-carpet-cleaning",
    title: "Sofa & Carpet Cleaning",
    category: "home",
    theme: "fuchsia",
    tag: "Upholstery",
    desc: "Deep injection extraction shampooing, allergen purge & stain removal.",
    price: "From ₹699",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M4 18v2"/><path d="M20 18v2"/></svg>`
  },
  {
    slug: "kitchen-cleaning",
    title: "Kitchen Cleaning",
    category: "home",
    theme: "amber",
    tag: "Degrease",
    desc: "Heavy oil & grease removal, countertops, tile backsplash & cabinets.",
    price: "From ₹999",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v20"/><path d="M6 2v7a3 3 0 0 0 6 0V2"/><path d="M9 9v13"/></svg>`
  },
  {
    slug: "office-company-cleaning",
    title: "Office & Company Cleaning",
    category: "company",
    theme: "slate",
    tag: "Corporate",
    desc: "Workstations, glass partitions, executive cabins, floors & restrooms.",
    price: "Quote on Inspection",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`
  },
  {
    slug: "restaurant-cleaning",
    title: "Restaurant Cleaning",
    category: "hotel",
    theme: "orange",
    tag: "Commercial Kitchen",
    desc: "Dine-in area scrub, commercial kitchen degreasing, grease traps & dining.",
    price: "Quote on Inspection",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`
  },
  {
    slug: "hotel-cleaning",
    title: "Hotel Cleaning",
    category: "hotel",
    theme: "teal",
    tag: "Hospitality",
    desc: "Turnover protocol, suite detailing, lobby glass, banquet halls & steam.",
    price: "Quote on Inspection",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>`
  },
  {
    slug: "ac-problem-wash",
    title: "A/C Problem & Wash",
    category: "ac",
    theme: "indigo",
    tag: "HVAC Precision",
    desc: "High-pressure power jet wash, diagnostics, gas check & leak resolution.",
    price: "From ₹499",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>`
  },
  {
    slug: "retails-shops-cleaning",
    title: "Retails & Shops Cleaning",
    category: "company",
    theme: "rose",
    tag: "Storefront",
    desc: "Storefront glass, display racks, trial rooms, floor buffing & lighting.",
    price: "Quote on Inspection",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`
  },
  {
    slug: "window-glass-cleaning",
    title: "Window & Glass",
    category: "home",
    theme: "sky",
    tag: "Streak-Free",
    desc: "Streak-free exterior & interior pane wash, slider track detailing.",
    price: "From ₹399",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/><path d="M3 12h18"/></svg>`
  },
  {
    slug: "solar-panel-cleaning",
    title: "Solar Panel Cleaning",
    category: "home",
    theme: "amber",
    tag: "Solar Efficiency",
    desc: "Deionized soft water wash, removes dust, soot & bird lime to restore yield.",
    price: "From ₹599",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
  },
  {
    slug: "water-tank-cleaning",
    title: "Water Tank Cleaning",
    category: "home",
    theme: "teal",
    tag: "Sediment Removal",
    desc: "Sludge drainage, high-pressure rotary scrub, vacuuming & UV disinfection.",
    price: "From ₹799",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`
  },
  {
    slug: "sump-cleaning",
    title: "Sump Cleaning",
    category: "home",
    theme: "emerald",
    tag: "Underground Sump",
    desc: "De-watering, deep floor & wall silt removal, vacuum & antibacterial flush.",
    price: "From ₹899",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`
  },
  {
    slug: "chimney-cleaning",
    title: "Chimney & Hob",
    category: "home",
    theme: "orange",
    tag: "Kitchen Extraction",
    desc: "Baffle filter degreasing, carbon removal, blower fan & hob detailing.",
    price: "From ₹549",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.1.2-2.2.5-3.2 1.5 1.5 2.5 3.2 3 3.7Z"/></svg>`
  }
];

function renderServices(filter = "all") {
  const grid = $("#serviceGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const query = (filter || "all").toLowerCase().trim();
  const list = query === "all"
    ? SQUARE_SERVICES
    : SQUARE_SERVICES.filter((s) => s.category === query);

  grid.innerHTML = list.map((s) => `
    <a href="appointment.html?service=${encodeURIComponent(s.slug)}" class="service-square-card card-${s.theme}">
      <div class="square-card-header">
        <div class="square-card-icon-wrap">
          ${s.icon}
        </div>
        <span class="square-card-tag">${s.tag}</span>
      </div>
      <div class="square-card-body">
        <h3 class="square-card-title">${s.title}</h3>
        <p class="square-card-desc">${s.desc}</p>
      </div>
      <div class="square-card-footer">
        <span class="square-card-price-hint">${s.price}</span>
        <span class="square-card-action-btn">
          <span>Book Now</span>
          <svg viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </div>
    </a>
  `).join("");
}

// ─── WIRE UP ALL EVENT LISTENERS ──────────────────────────────────────
function wireEvents() {
  // Sticky Topbar Expand/Shrink
  const topbar = $("#topbar");
  if (topbar) {
    const updateTopbar = () => {
      topbar.classList.toggle("scrolled", window.scrollY > 20);
    };
    window.addEventListener("scroll", updateTopbar, { passive: true });
    updateTopbar();
  }

  // Mobile Menu Button
  const menuBtn = $("#menuBtn");
  if (menuBtn) {
    menuBtn.addEventListener("click", () => {
      const nav = $("#nav");
      if (nav) nav.classList.toggle("open");
      menuBtn.classList.toggle("open");
    });
  }

  // Category Filter Bar
  const filterBar = $("#serviceFilterBar");
  if (filterBar) {
    filterBar.querySelectorAll(".filter-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        filterBar.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        renderServices(pill.dataset.filter || "all");
      });
    });
  }

  // Guide Section Buttons
  $$(".open-guide-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openCleaningGuideModal(btn.dataset.guideCategory || "home");
    });
  });

  // Modal Closers
  $("#closeGuideModalBtn")?.addEventListener("click", closeCleaningGuideModal);
  $("#guideCloseFooterBtn")?.addEventListener("click", closeCleaningGuideModal);
  $("#successDoneBtn")?.addEventListener("click", closeBookingSuccessModal);

  // Guide "Book This Service" Button
  $("#guideBookServiceBtn")?.addEventListener("click", () => {
    closeCleaningGuideModal();
    window.location.href = "appointment.html";
  });

  // Esc key closes modals
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCleaningGuideModal();
      closeBookingSuccessModal();
    }
  });

  // Spotlight and Featured Deal Cards click handling
  $$("[data-select-service]").forEach((el) => {
    el.addEventListener("click", () => {
      const serviceId = el.dataset.selectService;
      if (!serviceId) return;
      window.location.href = `appointment.html?service=${encodeURIComponent(serviceId)}`;
    });
  });
}

// ─── INITIALIZATION ──────────────────────────────────────────────────
renderServices();
wireEvents();

// ─── REAL-TIME CUSTOMER SUPPORT CHAT CONTROLLER ──────────────────────
(function initCustomerSupportChat() {
  const openChatBtn = document.getElementById("openLiveChatBtn");
  const closeChatBtn = document.getElementById("closeLiveChatBtn");
  const chatCard = document.getElementById("liveSupportChatCard");
  const identityBox = document.getElementById("chatIdentityBox");
  const inputName = document.getElementById("chatInputName");
  const inputContact = document.getElementById("chatInputContact");
  const messagesContainer = document.getElementById("chatMessagesContainer");
  const sendForm = document.getElementById("liveChatSendForm");
  const inputText = document.getElementById("liveChatInputText");

  if (!openChatBtn || !chatCard) return;

  // Retrieve or generate persistent conversation ID
  let convId = localStorage.getItem("zs_customer_conv_id");
  if (!convId) {
    convId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    localStorage.setItem("zs_customer_conv_id", convId);
  }

  // Pre-fill user details if logged in
  try {
    const sessionUser = JSON.parse(sessionStorage.getItem("zs_user") || "null");
    if (sessionUser) {
      if (inputName) inputName.value = sessionUser.name || "";
      if (inputContact) inputContact.value = sessionUser.email || sessionUser.phone || "";
      if (identityBox) identityBox.style.display = "none";
    }
  } catch (e) {}

  let pollInterval = null;

  function openChat() {
    chatCard.style.display = "flex";
    fetchMessages();
    if (!pollInterval) {
      pollInterval = setInterval(fetchMessages, 3000);
    }
    setTimeout(() => inputText?.focus(), 150);
  }

  function closeChat() {
    chatCard.style.display = "none";
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  openChatBtn.addEventListener("click", openChat);
  closeChatBtn?.addEventListener("click", closeChat);

  async function fetchMessages() {
    if (!convId || !messagesContainer) return;
    try {
      const res = await fetch(`/api/support/messages?conversationId=${encodeURIComponent(convId)}`);
      const data = await res.json();
      if (!data.success || !data.data) return;

      const msgs = data.data;
      if (!msgs.length) return;

      // Keep bot welcome bubble if it exists
      const existingBubbles = messagesContainer.querySelectorAll(".chat-bubble:not(.bot)");
      if (existingBubbles.length === msgs.length) {
        return; // No new messages
      }

      // Rebuild message stream
      const botWelcome = `
        <div class="chat-bubble bot">
          <span class="chat-bubble-sender">Zero Spot Concierge</span>
          <p style="margin:0;">👋 Hello! Welcome to Zero Spot. How can our operations team assist with your home care, cleaning quote, or specialist booking today?</p>
        </div>`;

      const msgHtml = msgs.map(m => {
        const isCustomer = m.sender === "customer";
        const isBot = m.sender === "bot";
        const bubbleClass = isCustomer ? "customer" : (isBot ? "bot" : "agent");
        const senderLabel = isCustomer ? "You" : (isBot ? "Zero Spot Concierge" : "Operations Desk");
        const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

        return `
          <div class="chat-bubble ${bubbleClass}">
            <span class="chat-bubble-sender" style="color:${isCustomer ? '#93c5fd' : '#10b981'}; font-size:0.68rem; font-weight:700; display:block; margin-bottom:2px;">
              ${senderLabel} · ${timeStr}
            </span>
            <p style="margin:0;">${escapeHtml(m.text)}</p>
          </div>`;
      }).join("");

      messagesContainer.innerHTML = botWelcome + msgHtml;
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (err) {
      // Offline / network failure handled silently
    }
  }

  sendForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = inputText.value.trim();
    if (!text) return;

    let customerName = inputName?.value.trim() || "";
    let contact = inputContact?.value.trim() || "";

    try {
      const sessionUser = JSON.parse(sessionStorage.getItem("zs_user") || "null");
      if (sessionUser) {
        if (!customerName) customerName = sessionUser.name || "";
        if (!contact) contact = sessionUser.email || sessionUser.phone || "";
      }
    } catch (err) {}

    const isEmail = contact.includes("@");
    const customerEmail = isEmail ? contact : "";
    const customerPhone = !isEmail ? contact : "";

    inputText.value = "";

    try {
      const res = await fetch("/api/support/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          sender: "customer",
          senderName: customerName || "Customer",
          customerName,
          customerEmail,
          customerPhone,
          text,
        }),
      });

      const data = await res.json();
      if (data.success) {
        fetchMessages();
      }
    } catch (err) {
      console.warn("[Live Chat Send Error]:", err.message);
    }
  });

  // Handle Quick Chips
  messagesContainer?.addEventListener("click", (e) => {
    const chip = e.target.closest(".chat-chip");
    if (chip && inputText) {
      inputText.value = chip.dataset.text || "";
      sendForm?.dispatchEvent(new Event("submit"));
    }
  });

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();

console.log("✨ Zero Spot Web Experience Initialized — Real-Time Support Chat & Cloud Sync Active.");

