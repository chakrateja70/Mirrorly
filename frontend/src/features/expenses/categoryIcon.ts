import {
  Baby, BedDouble, BookOpen, Bus, Car, CarTaxiFront, Clapperboard, Coffee, Cookie, Dumbbell, Fuel, Gamepad2, Gift,
  GraduationCap, HandHeart, HeartPulse, House, Landmark, Music, PawPrint, PiggyBank, Pill, Plane, Receipt, Repeat,
  Scissors, Shirt, ShieldCheck, ShoppingBag, ShoppingCart, Smartphone, Tag, TrainFront, Utensils, Wifi, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react'

// Categories are user-named, so the icon comes from the name: the first row with a matching word wins.
// A stem matches a word that starts with it ("grocer" -> "Groceries"); stems of 3 letters or less must be the
// whole word or its plural, so "bus" doesn't catch "business".
const ICONS: [LucideIcon, string[]][] = [
  [ShoppingCart, ['grocer', 'supermarket', 'vegetable', 'fruit']],
  [Coffee, ['coffee', 'cafe', 'tea']],
  [Cookie, ['snack', 'sweet', 'dessert']],
  [Utensils, ['food', 'dining', 'restaurant', 'meal', 'lunch', 'dinner', 'breakfast', 'eat']],
  [Plane, ['travel', 'trip', 'flight', 'vacation', 'holiday']],
  [BedDouble, ['hotel', 'stay']],
  [CarTaxiFront, ['taxi', 'cab', 'uber', 'ola', 'auto']],
  [TrainFront, ['train', 'metro', 'rail']],
  [Bus, ['bus', 'commute', 'transport']],
  [Fuel, ['fuel', 'petrol', 'diesel', 'gas']],
  [Car, ['car', 'vehicle', 'parking', 'toll']],
  [ShoppingBag, ['shop', 'amazon', 'flipkart']],
  [Shirt, ['cloth', 'fashion', 'apparel', 'shoe']],
  [Zap, ['electric', 'power', 'utilit']],
  [Wifi, ['internet', 'wifi', 'broadband']],
  [Smartphone, ['phone', 'mobile', 'recharge']],
  [Repeat, ['subscri', 'stream', 'netflix', 'spotify', 'ott']],
  [Receipt, ['bill', 'tax']],
  [House, ['rent', 'house', 'home', 'household']],
  [Wrench, ['repair', 'maintenance', 'service']],
  [Pill, ['medic', 'pharma', 'pill']],
  [HeartPulse, ['health', 'doctor', 'hospital', 'clinic']],
  [Dumbbell, ['gym', 'fitness', 'sport', 'yoga']],
  [Scissors, ['salon', 'beauty', 'haircut', 'grooming']],
  [Clapperboard, ['entertain', 'movie', 'film', 'cinema', 'show']],
  [Gamepad2, ['game', 'gaming']],
  [Music, ['music', 'concert']],
  [GraduationCap, ['education', 'school', 'college', 'course', 'tuition', 'fee']],
  [BookOpen, ['book']],
  [Gift, ['gift', 'present']],
  [HandHeart, ['charit', 'donat']],
  [PawPrint, ['pet']],
  [Baby, ['kid', 'child', 'baby']],
  [ShieldCheck, ['insur']],
  [PiggyBank, ['saving', 'invest', 'sip']],
  [Landmark, ['loan', 'emi', 'bank']],
]

/** Icon for a category name; a plain tag when no word matches (e.g. "Other"). */
export function categoryIcon(name = ''): LucideIcon {
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  const hit = (stem: string) => words.some((w) => (stem.length > 3 ? w.startsWith(stem) : w === stem || w === `${stem}s` || w === `${stem}es`))
  return ICONS.find(([, stems]) => stems.some(hit))?.[0] ?? Tag
}
