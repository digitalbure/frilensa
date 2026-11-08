// Industries and categories for the marketplace (gear and services), shared by the app and the server.
// Add to these freely; ids are stored on listings, so don't rename or remove an id that's in use.

export type ListingKind = 'gear' | 'service';

export interface Industry {
  id: string;
  name: string;
  gear: { id: string; name: string }[];
  services: { id: string; name: string }[];
}

const c = (pairs: string[]) => pairs.map(p => { const [id, name] = p.split('|'); return { id, name }; });

export const INDUSTRIES: Industry[] = [
  {
    id: 'film_photo', name: 'Film, video and photography',
    gear: c(['cameras|Cameras', 'lenses|Lenses', 'lighting|Lighting', 'grip|Grip and support', 'stabilisers|Gimbals and stabilisers', 'drones|Drones', 'monitors|Monitors and recorders', 'camera_accessories|Batteries, media and accessories', 'studio|Studio space and backdrops']),
    services: c(['videography|Videography', 'photography|Photography', 'editing|Video editing', 'colour|Colour grading', 'drone_ops|Drone operation', 'livestream|Live streaming', 'crew|Crew hire'])
  },
  {
    id: 'audio_events', name: 'Audio, AV and event hire',
    gear: c(['pa|PA and speakers', 'mixers|Mixers', 'microphones|Microphones', 'instruments|Instruments', 'dj|DJ equipment', 'stage|Staging and trussing', 'event_lighting|Event lighting', 'tents|Tents and marquees', 'furniture|Event furniture', 'av_hire|AV equipment', 'led_screens|LED screens and projectors', 'event_power|Event power and generators', 'decor_hire|Decor and tableware']),
    services: c(['sound|Sound engineering', 'mc|MC and hosting', 'dj_services|DJ', 'live_music|Live music', 'event_planning|Event planning', 'decor|Decor and styling', 'catering|Catering'])
  },
  {
    id: 'construction', name: 'Construction and trades',
    gear: c(['power_tools|Power tools', 'heavy|Heavy machinery', 'generators|Generators', 'scaffolding|Scaffolding and ladders', 'concrete|Concrete and masonry', 'safety|Safety gear']),
    services: c(['building|Building', 'electrical|Electrical', 'plumbing|Plumbing', 'carpentry|Carpentry', 'painting|Painting', 'landscaping|Landscaping', 'welding|Welding and fabrication'])
  },
  {
    id: 'it_digital', name: 'IT and digital',
    gear: c(['computers|Computers and laptops', 'networking|Networking', 'displays|Screens and projectors', 'printers|Printers', 'av|AV and conferencing']),
    services: c(['web|Websites', 'apps|Apps and software', 'it_support|IT support', 'marketing|Digital marketing', 'social|Social media', 'data|Data and analytics'])
  },
  {
    id: 'creative', name: 'Design and creative',
    gear: c(['print_gear|Printing and signage', 'craft|Craft and art supplies']),
    services: c(['graphic_design|Graphic design', 'branding|Branding', 'illustration|Illustration', 'writing|Writing and translation', 'fashion|Fashion and tailoring'])
  },
  {
    id: 'tourism', name: 'Tourism and hospitality',
    gear: c(['water_sports|Water sports gear', 'dive|Dive gear', 'camping|Camping', 'bikes|Bikes and e-bikes', 'kitchen|Commercial kitchen']),
    services: c(['tours|Tours and guiding', 'accommodation|Accommodation', 'transfers|Transfers', 'hospitality_staff|Hospitality staff'])
  },
  {
    id: 'transport_marine', name: 'Vehicles, transport and marine',
    gear: c(['vehicles|Vehicles', 'cars|Rental cars', 'vans|Vans and minibuses', 'trucks|Trucks and utes', 'motorbikes|Motorbikes and scooters', 'trailers|Trailers', 'boats|Boats', 'outboards|Outboard motors', 'marine_gear|Marine equipment']),
    services: c(['delivery|Delivery and courier', 'moving|Moving', 'charter|Boat charter', 'drivers|Drivers and chauffeurs', 'mechanics|Mechanics'])
  },
  {
    id: 'agriculture', name: 'Agriculture and fishing',
    gear: c(['farm_machinery|Farm machinery', 'irrigation|Irrigation', 'fishing_gear|Fishing gear', 'cold_storage|Cold storage']),
    services: c(['farm_labour|Farm work', 'agronomy|Agronomy advice', 'processing|Processing and packing'])
  },
  {
    id: 'health_wellness', name: 'Health, beauty and fitness',
    gear: c(['fitness_gear|Fitness equipment', 'salon|Salon equipment', 'medical|Medical equipment']),
    services: c(['fitness|Personal training', 'beauty|Hair and beauty', 'massage|Massage and spa', 'health|Health care'])
  },
  {
    id: 'professional', name: 'Professional services',
    gear: c(['office|Office equipment']),
    services: c(['accounting|Accounting and tax', 'legal|Legal', 'consulting|Consulting', 'training|Training and tutoring', 'admin|Admin and virtual assistance'])
  },
  {
    id: 'other', name: 'Other',
    gear: c(['other_gear|Other gear']),
    services: c(['other_service|Other services'])
  }
];

export const RENT_UNITS = ['hour', 'day', 'week', 'month'] as const;
export const SERVICE_UNITS = ['hour', 'day', 'job', 'session'] as const;
export const CONDITIONS = [
  { id: 'new', name: 'New' }, { id: 'like_new', name: 'Like new' }, { id: 'good', name: 'Good' }, { id: 'fair', name: 'Fair' }
] as const;

export function categoriesFor(kind: ListingKind, industryId?: string) {
  const list = industryId ? INDUSTRIES.filter(i => i.id === industryId) : INDUSTRIES;
  return list.flatMap(i => (kind === 'gear' ? i.gear : i.services).map(cat => ({ ...cat, industryId: i.id })));
}

export function isValidCategory(kind: ListingKind, industryId: string, categoryId: string) {
  return categoriesFor(kind, industryId).some(cat => cat.id === categoryId);
}

export const industryName = (id: string) => INDUSTRIES.find(i => i.id === id)?.name || 'Other';
export const categoryName = (kind: ListingKind, id: string) => categoriesFor(kind).find(cat => cat.id === id)?.name || 'Other';
