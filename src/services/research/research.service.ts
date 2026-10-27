export interface TempleInfo {
  id: string
  name: string
  deity: string
  location: string
  state: string
  description: string
  darshanTimings: string
  dressCode: string
  majorFestivals: string[]
  nearestTransit: {
    railway?: string
    airport?: string
    bus?: string
  }
  rituals: { name: string; time: string; fee?: string }[]
  accommodationTips: string
}

export const TEMPLE_KNOWLEDGE_BASE: Record<string, TempleInfo> = {
  yadadri: {
    id: "yadadri",
    name: "Sri Lakshmi Narasimha Swamy Temple",
    deity: "Lord Narasimha (Pancha Narasimha Kshetram)",
    location: "Yadagirigutta, Yadadri Bhuvanagiri district",
    state: "Telangana",
    description:
      "A renowned Vaishnavite cave temple atop a hillock, reconstructed with Dravidian Krishna Shila granite architecture.",
    darshanTimings: "04:00 AM – 09:30 PM (except during specific nivedana pauses)",
    dressCode:
      "Traditional Indian attire: Dhoti/Kurta for men, Saree/Salwar Kameez for women.",
    majorFestivals: ["Brahmotsavam (Phalguna)", "Narasimha Jayanti", "Vaikuntha Ekadashi"],
    nearestTransit: {
      railway: "Raigir / Yadadri (approx. 5 km), Bhongir (13 km)",
      airport: "Rajiv Gandhi International Airport, Hyderabad (approx. 85 km)",
      bus: "Direct TSRTC buses from MGBS and Jubilee Bus Station, Hyderabad",
    },
    rituals: [
      { name: "Suprabhata Seva", time: "04:00 AM – 04:30 AM" },
      { name: "Nijabhishekam", time: "05:00 AM – 06:30 AM" },
      { name: "Nitya Kalyanam", time: "09:30 AM – 11:30 AM", fee: "₹1,500" },
      { name: "Sahasranamarchana", time: "07:30 PM – 08:30 PM" },
    ],
    accommodationTips:
      "TTD guest houses and Yadadri Temple Devastanam cottages on downhill/uphill. Prior online booking is recommended on weekends.",
  },
  vemulawada: {
    id: "vemulawada",
    name: "Sri Raja Rajeshwara Swamy Temple",
    deity: "Lord Shiva (Rajanna)",
    location: "Vemulawada, Rajanna Sircilla district",
    state: "Telangana",
    description:
      "Known as Dakshina Kashi, famous for the sacred tank Dharmagundam and the unique Kode Mokku (ritual tying of an ox).",
    darshanTimings: "04:00 AM – 10:00 PM",
    dressCode: "Traditional attire required for sanctum darshan and special pujas.",
    majorFestivals: ["Maha Shivaratri", "Sri Rama Navami"],
    nearestTransit: {
      railway: "Karimnagar (approx. 34 km)",
      airport: "Hyderabad (approx. 180 km)",
      bus: "Frequent TSRTC buses connecting Karimnagar, Warangal, and Hyderabad",
    },
    rituals: [
      { name: "Kode Mokku (Ox Offering Puja)", time: "06:00 AM – 06:00 PM" },
      { name: "Maha Puja", time: "10:30 AM – 12:00 PM" },
      { name: "Nishikalam Puja", time: "09:00 PM – 10:00 PM" },
    ],
    accommodationTips:
      "Devasthanam guest houses and private choultries are available around the temple complex.",
  },
  bhadrachalam: {
    id: "bhadrachalam",
    name: "Sri Sita Ramachandraswamy Temple",
    deity: "Lord Rama, Sita Devi, and Lakshmana",
    location: "Bhadrachalam, Bhadradri Kothagudem district",
    state: "Telangana",
    description:
      "Historic Vaishnavite temple nestled beside the Godavari river, deeply associated with Bhakta Ramadasu.",
    darshanTimings: "04:30 AM – 09:00 PM",
    dressCode: "Traditional dress is strictly adhered to for Antaralaya Darshanam.",
    majorFestivals: ["Sri Rama Navami (Kalyanotsavam)", "Vaikuntha Ekadashi"],
    nearestTransit: {
      railway: "Bhadrachalam Road / Kothagudem (approx. 40 km)",
      airport: "Vijayawada (approx. 185 km), Hyderabad (approx. 310 km)",
      bus: "Extensive overnight deluxe bus services from Hyderabad, Vijayawada, and Rajahmundry",
    },
    rituals: [
      { name: "Suprabhatam", time: "04:30 AM – 05:00 AM" },
      { name: "Abhishekam", time: "07:00 AM – 08:30 AM" },
      { name: "Nitya Kalyanam", time: "09:30 AM – 11:30 AM", fee: "₹1,000" },
    ],
    accommodationTips:
      "Devasthanam choultries (Sita Nilayam, Rama Nilayam) and tourism cottages near the Godavari ghats.",
  },
  basar: {
    id: "basar",
    name: "Sri Gnana Saraswathi Temple",
    deity: "Goddess Saraswathi",
    location: "Basar, Nirmal district",
    state: "Telangana",
    description:
      "One of the two prominent Saraswathi shrines in India, located on the banks of Godavari; famous for Aksharabhyasam (children's initiation into education).",
    darshanTimings: "04:00 AM – 09:00 PM",
    dressCode: "Traditional Indian clothing.",
    majorFestivals: ["Vasant Panchami", "Navratri", "Vyasa Purnima"],
    nearestTransit: {
      railway: "Basar Railway Station (approx. 2 km, on Secunderabad-Manmad line)",
      airport: "Nanded (approx. 100 km), Hyderabad (approx. 210 km)",
      bus: "Direct buses from Nizamabad, Nirmal, and Hyderabad",
    },
    rituals: [
      { name: "Aksharabhyasam Puja", time: "07:30 AM – 01:00 PM, 02:00 PM – 05:00 PM" },
      { name: "Kumkumarchana", time: "08:00 AM – 12:00 PM" },
    ],
    accommodationTips:
      "Temple dormitories and private lodges near the station and ghats.",
  },
  tirupati: {
    id: "tirupati",
    name: "Sri Venkateswara Swamy Temple (Tirumala)",
    deity: "Lord Venkateswara (Balaji)",
    location: "Tirumala, Tirupati district",
    state: "Andhra Pradesh",
    description:
      "The world-renowned Kaliyuga Vaikuntham atop the Seven Hills of Seshachalam range.",
    darshanTimings: "24 hours with scheduled breaks for naivedyam & arjitha sevas",
    dressCode:
      "Men must wear white Dhoti/Pancha with Uttariyam or Kurta-Pyjama. Women must wear Saree or Half-Saree or Chudidar with Dupatta.",
    majorFestivals: ["Salakatla Brahmotsavam", "Vaikuntha Dwara Darshanam", "Rathasapthami"],
    nearestTransit: {
      railway: "Tirupati Main (TPTY) / Renigunta (RU)",
      airport: "Tirupati Airport, Renigunta (approx. 40 km from hills)",
      bus: "Non-stop ghat road electric and express buses from Tirupati bus stand",
    },
    rituals: [
      { name: "Suprabhata Seva", time: "03:00 AM – 03:30 AM" },
      { name: "Thomala Seva", time: "03:45 AM – 04:30 AM" },
      { name: "Archana", time: "04:45 AM – 05:30 AM" },
    ],
    accommodationTips:
      "TTD advance booking (CRMS) online is essential. Tirupati downhill has numerous hotels for backup.",
  },
}

export class ResearchService {
  findTemple(query: string): TempleInfo | null {
    const q = query.toLowerCase()
    for (const [key, temple] of Object.entries(TEMPLE_KNOWLEDGE_BASE)) {
      if (
        q.includes(key) ||
        temple.name.toLowerCase().includes(q) ||
        temple.location.toLowerCase().includes(q)
      ) {
        return temple
      }
    }
    return null
  }

  listTemples(): TempleInfo[] {
    return Object.values(TEMPLE_KNOWLEDGE_BASE)
  }

  search(query: string): TempleInfo[] {
    const q = query.toLowerCase()
    return Object.values(TEMPLE_KNOWLEDGE_BASE).filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.deity.toLowerCase().includes(q) ||
        t.location.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    )
  }
}

export const researchService = new ResearchService()
