require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Medicine = require('./models/Medicine');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not set.');
  process.exit(1);
}

const pharmacies = [
  {
    username: 'healthplus',
    password: 'pharmacy123',
    pharmacyName: 'HealthPlus Pharmacy',
    address: '123 Jalan Bukit Bintang, Kuala Lumpur',
    lat: 3.1478,
    lng: 101.7101
  },
  {
    username: 'medicarekl',
    password: 'pharmacy123',
    pharmacyName: 'MediCare Store KL',
    address: '456 Jalan Ampang, Kuala Lumpur',
    lat: 3.1590,
    lng: 101.7447
  },
  {
    username: 'citypharmacy',
    password: 'pharmacy123',
    pharmacyName: 'City Pharmacy KLCC',
    address: '789 Jalan P. Ramlee, Kuala Lumpur',
    lat: 3.1579,
    lng: 101.7122
  },
  {
    username: 'quickmeds',
    password: 'pharmacy123',
    pharmacyName: 'QuickMeds Chow Kit',
    address: '321 Jalan Chow Kit, Kuala Lumpur',
    lat: 3.1627,
    lng: 101.6959
  },
  {
    username: 'sunrisepharm',
    password: 'pharmacy123',
    pharmacyName: 'Sunrise Pharmacy Bangsar',
    address: '654 Jalan Bangsar, Kuala Lumpur',
    lat: 3.1310,
    lng: 101.6773
  }
];

const medicineTemplates = [
  { name: 'Paracetamol', category: 'pain relief',    basePrice: 2.50 },
  { name: 'Ibuprofen',   category: 'pain relief',    basePrice: 4.00 },
  { name: 'Cetirizine',  category: 'antihistamine',  basePrice: 5.50 },
  { name: 'Crocin',      category: 'fever reducer',  basePrice: 3.00 },
  { name: 'Disprin',     category: 'pain relief',    basePrice: 2.00 }
];

function randBetween(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  for (const p of pharmacies) {
    const existing = await User.findOne({ username: p.username });
    if (existing) {
      console.log(`  Skipping ${p.username} (already exists)`);
      continue;
    }

    const user = await User.create({
      username: p.username,
      password: p.password,
      pharmacyName: p.pharmacyName,
      role: 'pharmacist'
    });

    console.log(`\n[+] Created pharmacist: ${p.username} (${p.pharmacyName})`);

    for (const med of medicineTemplates) {
      const alreadyHas = await Medicine.findOne({
        name: med.name,
        pharmacistId: user._id
      });
      if (alreadyHas) {
        console.log(`    Skipping ${med.name} (already exists for this pharmacy)`);
        continue;
      }

      const priceVariation = (Math.random() * 0.4 - 0.2);
      const price = parseFloat((med.basePrice * (1 + priceVariation)).toFixed(2));
      const stock = randBetween(10, 100);

      await Medicine.create({
        name: med.name,
        price,
        stock,
        category: med.category,
        pharmacyName: p.pharmacyName,
        pharmacistId: user._id,
        location: { lat: p.lat, lng: p.lng },
        address: p.address
      });

      console.log(`    -> ${med.name}: $${price}, stock: ${stock}`);
    }
  }

  console.log('\nSeed complete!');
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
