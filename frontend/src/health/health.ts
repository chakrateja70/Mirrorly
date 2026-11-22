import {
  Apple, BookOpen, Building2, CircleCheck, Coffee, Footprints, GlassWater, House, Info, Laptop, MonitorOff, MoonStar,
  PersonStanding, Soup, Sunrise, Sunset, TreeDeciduous, TriangleAlert, UtensilsCrossed, type LucideIcon,
} from 'lucide-react'
import type { Insight, Slot, StopKind, Unit } from '../api'
import { iso, parseDay } from '../features/expenses/filters'
import { mins } from './road'

export const addDays = (s: string, n: number) => { const d = parseDay(s); d.setDate(d.getDate() + n); return iso(d) }
export const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
/** 1250 -> "1.25 L", 800 -> "800 ml" */
export const liters = (ml: number) => (ml >= 1000 ? `${+(ml / 1000).toFixed(2)} L` : `${ml} ml`)

export const STOP: Record<StopKind, { Icon: LucideIcon; tint: string; label: string }> = {
  wake: { Icon: Sunrise, tint: 'bg-amber-500', label: 'Wake up' },
  hydrate: { Icon: GlassWater, tint: 'bg-sky-500', label: 'Water' },
  meal: { Icon: UtensilsCrossed, tint: 'bg-emerald-500', label: 'Meal' },
  snack: { Icon: Apple, tint: 'bg-lime-600', label: 'Snack' },
  exercise: { Icon: Footprints, tint: 'bg-orange-500', label: 'Move' },
  work: { Icon: Laptop, tint: 'bg-slate-500', label: 'Work' },
  break: { Icon: PersonStanding, tint: 'bg-teal-500', label: 'Break' },
  screen: { Icon: MonitorOff, tint: 'bg-rose-500', label: 'Screens off' },
  wind_down: { Icon: BookOpen, tint: 'bg-indigo-400', label: 'Wind down' },
  sleep: { Icon: MoonStar, tint: 'bg-indigo-600', label: 'Sleep' },
}

export const SLOTS: { value: Slot; label: string; Icon: LucideIcon }[] = [
  { value: 'breakfast', label: 'Breakfast', Icon: Coffee },
  { value: 'lunch', label: 'Lunch', Icon: UtensilsCrossed },
  { value: 'snack', label: 'Snack', Icon: Apple },
  { value: 'dinner', label: 'Dinner', Icon: Soup },
]
/** The meal you're probably logging right now. */
export const slotFor = (hour: number): Slot => (hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 19 ? 'snack' : 'dinner')

export const UNITS: { value: Unit; label: string }[] = [
  { value: 'cup', label: 'cup' }, { value: 'bowl', label: 'bowl' }, { value: 'plate', label: 'plate' }, { value: 'piece', label: 'piece' },
  { value: 'slice', label: 'slice' }, { value: 'g', label: 'grams' }, { value: 'ml', label: 'ml' }, { value: 'glass', label: 'glass' },
  { value: 'tbsp', label: 'tbsp' }, { value: 'tsp', label: 'tsp' }, { value: 'serving', label: 'serving' },
]
// The usual way each food is measured, so "rice" starts as 1 cup and "milk" as 250 ml.
const UNIT_HINTS: [RegExp, Unit, number][] = [
  [/\b(tea|coffee|chai)\b/, 'cup', 1],
  [/\b(milk|juice|buttermilk|chaas|lassi|water|smoothie|shake|soda|coke|beer)\b/, 'ml', 250],
  [/\b(rice|biryani|pulao|khichdi|upma|poha|oats|pongal|daliya|noodles|pasta|maggi)\b/, 'cup', 1],
  [/\b(roti|chapati|phulka|idli)\b/, 'piece', 2],
  [/\b(paratha|naan|dosa|uttapam|pesarattu|vada|puri|egg|eggs|banana|apple|orange|samosa|bread|biscuit|cookie|dhokla|laddu|cutlet)\b/, 'piece', 1],
  [/\b(dal|sambar|rasam|curry|sabzi|sabji|curd|dahi|raita|kheer|soup|chana|rajma|salad|fruit|kurma|gravy)\b/, 'bowl', 1],
  [/\b(paneer|chicken|mutton|fish|prawn|prawns|tofu|nuts|almonds|cashews|peanuts|chana dal)\b/, 'g', 100],
  [/\b(ghee|oil|butter|honey|sugar|jam|chutney|pickle)\b/, 'tbsp', 1],
]
export function unitFor(name: string): { unit: Unit; qty: number } {
  const n = name.toLowerCase()
  const hit = UNIT_HINTS.find(([re]) => re.test(n))
  return hit ? { unit: hit[1], qty: hit[2] } : { unit: 'serving', qty: 1 }
}
export const FOODS = [
  'Rice', 'Jeera rice', 'Curd rice', 'Lemon rice', 'Veg biryani', 'Chicken biryani', 'Pulao', 'Khichdi', 'Roti', 'Chapati', 'Phulka', 'Paratha',
  'Naan', 'Idli', 'Dosa', 'Masala dosa', 'Pesarattu', 'Uttapam', 'Upma', 'Poha', 'Vada', 'Puri', 'Pongal', 'Oats', 'Bread', 'Sambar', 'Rasam',
  'Dal', 'Dal tadka', 'Rajma', 'Chole', 'Mixed veg sabzi', 'Palak paneer', 'Paneer curry', 'Chicken curry', 'Fish curry', 'Egg curry', 'Boiled egg',
  'Omelette', 'Curd', 'Raita', 'Salad', 'Sprouts', 'Fruit bowl', 'Banana', 'Apple', 'Papaya', 'Tea', 'Coffee', 'Filter coffee', 'Milk',
  'Buttermilk', 'Lassi', 'Coconut water', 'Juice', 'Samosa', 'Biscuits', 'Roasted chana', 'Almonds', 'Peanuts', 'Ghee', 'Chutney', 'Pickle',
]

const WATCH = new Set(['fried', 'heavy', 'sugary', 'refined_carb', 'processed', 'alcohol', 'caffeine'])
const GOOD = new Set(['protein', 'veg', 'fruit', 'whole_grain', 'nuts_seeds', 'cooling', 'dairy'])
export const TAG_LABEL: Record<string, string> = {
  fried: 'Fried', heavy: 'Heavy', spicy: 'Spicy', sugary: 'Sugary', refined_carb: 'Refined', processed: 'Processed',
  caffeine: 'Caffeine', alcohol: 'Alcohol', protein: 'Protein', veg: 'Veggies', fruit: 'Fruit', whole_grain: 'Whole grain',
  dairy: 'Dairy', nuts_seeds: 'Nuts & seeds', cooling: 'Cooling',
}
/** Tags read as "go easy" (amber) or "good for you" (green); the label always says which. */
export const tagTone = (t: string) =>
  WATCH.has(t) ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
    : GOOD.has(t) ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
      : 'bg-muted text-muted-foreground'

export const INSIGHT: Record<Insight['level'], { Icon: LucideIcon; tone: string; label: string }> = {
  warn: { Icon: TriangleAlert, tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', label: 'Heads up' },
  info: { Icon: Info, tone: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', label: 'Tip' },
  good: { Icon: CircleCheck, tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', label: 'Nice' },
}

/** Five-step scales (sleep quality, energy): a label and a color per level, worst to best. */
export const LEVELS = [
  { label: 'Poor', color: 'var(--critical)' }, { label: 'Low', color: '#f97316' }, { label: 'Okay', color: '#eab308' },
  { label: 'Good', color: '#84cc16' }, { label: 'Great', color: 'var(--good)' },
]

// ---- the day-sky road: the sky behind each stop follows its time of day (each color has a light and a dark step) ----
const SKY: [number, string, LucideIcon][] = [ // [from hour, sky, scenery beside the card]
  [5, 'light-dark(#ffe1c2, #3d2a4f)', Sunrise], // dawn
  [8, 'light-dark(#d9eeff, #1b2a44)', Building2], // morning
  [12, 'light-dark(#c2e4ff, #172f4e)', TreeDeciduous], // midday
  [16, 'light-dark(#ffd0ad, #47283a)', Sunset], // golden hour
  [19, 'light-dark(#c7b5ff, #291f52)', House], // dusk
  [21, 'light-dark(#25205b, #0c0a22)', MoonStar], // night
]
const skyFor = (hhmm: string) => {
  const h = mins(hhmm) / 60
  return SKY.findLast(([from]) => h >= from) ?? SKY[SKY.length - 1] // before 5 AM it's still night
}
export const skyAt = (hhmm: string) => skyFor(hhmm)[1]
export const sceneryAt = (hhmm: string) => skyFor(hhmm)[2]
export const isNight = (hhmm: string) => { const h = mins(hhmm) / 60; return h >= 21 || h < 5 }

export const pill = 'h-9 rounded-full bg-muted px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground'
