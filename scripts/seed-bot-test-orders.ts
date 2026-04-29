/**
 * Seed PROCESSING orders for testing the Playwright bot.
 *
 * Each order is "ready to process" — full traveler data, status=PROCESSING.
 * The variety covers edge cases that have historically tripped the bot:
 *   - missing employment / "Housewife" / "Student"
 *   - no hotel booking (bookedHotel: 'no' branch)
 *   - no parents known (skips father + mother sections entirely)
 *   - only one parent known (father unknown, mother known)
 *   - holds a second passport
 *   - couple (2 travelers)
 *   - family of 4 (2 adults + 2 kids — kids have minimal employment)
 *
 * Idempotent by `billingEmail` so re-running just creates the missing ones.
 *
 * Usage:
 *   pnpm tsx scripts/seed-bot-test-orders.ts        # uses .env (production)
 *   DATABASE_URL=... pnpm tsx scripts/seed-bot-test-orders.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Sensible defaults for every traveler field the bot looks at. Override by spread. */
function fullTraveler(overrides: Record<string, any> = {}) {
  return {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    dob: 'January 15, 1990',
    gender: 'Female',
    maritalStatus: 'Single',
    religion: 'Christianity',
    countryOfBirth: 'United States',
    cityOfBirth: 'New York',
    citizenshipId: 'NA',
    nationalityByBirth: 'birth',
    livedTwoYears: 'yes',
    parentsFromPakistan: 'no',
    visibleMarks: '',
    educationalQualification: 'Graduate',
    phoneNumber: '12125551234',
    address: '123 Main Street',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    residenceCountry: 'United States',
    employmentStatus: 'Employed',
    employerName: 'Acme Corp',
    employerAddress: '456 Business Ave',
    employerCity: 'New York',
    employerState: 'NY',
    employerCountry: 'United States',
    employerZip: '10002',
    servedMilitary: 'no',
    knowParents: 'yes',
    fatherName: 'John Doe',
    fatherNationality: 'United States',
    fatherPlaceOfBirth: 'Boston',
    fatherCountryOfBirth: 'United States',
    motherName: 'Mary Doe',
    motherNationality: 'United States',
    motherPlaceOfBirth: 'Chicago',
    motherCountryOfBirth: 'United States',
    passportCountry: 'United States',
    passportNumber: 'P12345678',
    passportPlaceOfIssue: 'New York',
    passportCountryOfIssue: 'United States',
    passportIssued: 'January 15, 2020',
    passportExpiry: 'January 15, 2030',
    hasOtherPassport: 'no',
    arrivalDate: 'June 10, 2026',
    arrivalPoint: 'Delhi (Airport)',
    hasConfirmedTravel: 'yes',
    placesToVisit: 'Delhi, Agra, Mumbai',
    bookedHotel: 'yes',
    hotelName: 'Taj Palace',
    hotelPlace: 'New Delhi',
    tourOperatorName: '',
    tourOperatorAddress: '',
    exitPort: 'Delhi (Airport)',
    visitedIndiaBefore: 'no',
    visaRefusedBefore: 'no',
    refNameIndia: 'Delhi Tours',
    refAddressIndia: 'Connaught Place',
    refStateIndia: 'DELHI',
    refDistrictIndia: 'NEW DELHI',
    refPhoneIndia: '919876543210',
    refNameHome: 'Sarah Smith',
    refAddressHome: '789 Oak Ave',
    refStateHome: 'NY',
    refDistrictHome: '10003',
    refPhoneHome: '12125555678',
    everArrested: 'no',
    everRefusedEntry: 'no',
    soughtAsylum: 'no',
    hasCriminalRecord: 'no',
    finishStep: 'complete',
    photoUrl: '/uploads/dummy-photo.jpg',
    passportBioUrl: '/uploads/dummy-passport.pdf',
    ...overrides,
  };
}

interface BotTestOrder {
  label: string;        // Human-readable description for the console summary
  visaType: string;
  totalUSD: number;
  billingEmail: string;
  travelers: Array<Record<string, any>>;
}

const ORDERS: BotTestOrder[] = [
  // 1. Control — full data, single traveler. Should sail through the bot end-to-end.
  {
    label: 'Control (full data, single traveler)',
    visaType: 'TOURIST_30',
    totalUSD: 51.25,
    billingEmail: 'bot-test-1@example.com',
    travelers: [
      fullTraveler({
        firstName: 'Eleanor',
        lastName: 'Whitcombe',
        email: 'bot-test-1@example.com',
        phoneNumber: '14155551001',
        passportNumber: 'BOT0000001',
      }),
    ],
  },

  // 2. Unemployed — exercises the "no employer fields" branch on the gov form.
  {
    label: 'Unemployed (no employer fields)',
    visaType: 'TOURIST_30',
    totalUSD: 51.25,
    billingEmail: 'bot-test-2@example.com',
    travelers: [
      fullTraveler({
        firstName: 'Marcus',
        lastName: 'Holloway',
        email: 'bot-test-2@example.com',
        phoneNumber: '14155551002',
        passportNumber: 'BOT0000002',
        employmentStatus: 'Unemployed',
        employerName: '',
        employerAddress: '',
        employerCity: '',
        employerState: '',
        employerCountry: '',
        employerZip: '',
      }),
    ],
  },

  // 3. Housewife — different non-employed status that the gov site treats separately.
  {
    label: 'Housewife',
    visaType: 'TOURIST_1Y',
    totalUSD: 99.0,
    billingEmail: 'bot-test-3@example.com',
    travelers: [
      fullTraveler({
        firstName: 'Anneliese',
        lastName: 'Vogel',
        email: 'bot-test-3@example.com',
        phoneNumber: '14155551003',
        passportNumber: 'BOT0000003',
        gender: 'Female',
        maritalStatus: 'Married',
        employmentStatus: 'Housewife',
        employerName: '',
        employerAddress: '',
        employerCity: '',
        employerState: '',
        employerCountry: '',
        employerZip: '',
      }),
    ],
  },

  // 4. Student — exercises the studentProvider field (school name instead of employer).
  {
    label: 'Student',
    visaType: 'TOURIST_30',
    totalUSD: 51.25,
    billingEmail: 'bot-test-4@example.com',
    travelers: [
      fullTraveler({
        firstName: 'Léa',
        lastName: 'Moreau',
        email: 'bot-test-4@example.com',
        phoneNumber: '14155551004',
        passportNumber: 'BOT0000004',
        dob: 'June 5, 2003',
        employmentStatus: 'Student',
        employerName: '',
        employerAddress: '',
        studentProvider: 'NYU',
      }),
    ],
  },

  // 5. No hotel booking — bookedHotel: 'no' should skip the hotel-info branch entirely.
  {
    label: 'No hotel info (bookedHotel=no)',
    visaType: 'TOURIST_30',
    totalUSD: 51.25,
    billingEmail: 'bot-test-5@example.com',
    travelers: [
      fullTraveler({
        firstName: 'Hiroshi',
        lastName: 'Tanaka',
        email: 'bot-test-5@example.com',
        phoneNumber: '14155551005',
        passportNumber: 'BOT0000005',
        passportCountry: 'Japan',
        bookedHotel: 'no',
        hotelName: '',
        hotelPlace: '',
        tourOperatorName: '',
        tourOperatorAddress: '',
      }),
    ],
  },

  // 6. No parents known — knowParents: 'no'. Bot should skip both parent sections.
  {
    label: 'No parents known (knowParents=no)',
    visaType: 'TOURIST_30',
    totalUSD: 51.25,
    billingEmail: 'bot-test-6@example.com',
    travelers: [
      fullTraveler({
        firstName: 'Ji-won',
        lastName: 'Park',
        email: 'bot-test-6@example.com',
        phoneNumber: '14155551006',
        passportNumber: 'BOT0000006',
        passportCountry: 'Republic of Korea',
        knowParents: 'no',
        fatherName: '',
        fatherNationality: '',
        fatherPlaceOfBirth: '',
        fatherCountryOfBirth: '',
        motherName: '',
        motherNationality: '',
        motherPlaceOfBirth: '',
        motherCountryOfBirth: '',
      }),
    ],
  },

  // 7. Only mother known — exercises the partial-parent branch (father empty, mother filled).
  {
    label: 'Only mother known (father unknown)',
    visaType: 'TOURIST_30',
    totalUSD: 51.25,
    billingEmail: 'bot-test-7@example.com',
    travelers: [
      fullTraveler({
        firstName: 'Priya',
        lastName: 'Raman',
        email: 'bot-test-7@example.com',
        phoneNumber: '14155551007',
        passportNumber: 'BOT0000007',
        passportCountry: 'United Kingdom',
        knowParents: 'yes',
        fatherName: '',
        fatherNationality: '',
        fatherPlaceOfBirth: '',
        fatherCountryOfBirth: '',
        motherName: 'Lakshmi Raman',
        motherNationality: 'India',
        motherPlaceOfBirth: 'Chennai',
        motherCountryOfBirth: 'India',
      }),
    ],
  },

  // 8. Holds a second passport — exercises hasOtherPassport='yes' branch.
  {
    label: 'Holds a second passport',
    visaType: 'BUSINESS_1Y',
    totalUSD: 199.0,
    billingEmail: 'bot-test-8@example.com',
    travelers: [
      fullTraveler({
        firstName: 'Sofia',
        lastName: 'Almeida',
        email: 'bot-test-8@example.com',
        phoneNumber: '14155551008',
        passportNumber: 'BOT0000008',
        passportCountry: 'Brazil',
        hasOtherPassport: 'yes',
        otherPassportNumber: 'BR1234567',
        otherPassportDateOfIssue: 'March 12, 2018',
        otherPassportPlaceOfIssue: 'São Paulo',
        passportCountryOfIssue: 'Portugal',
      }),
    ],
  },

  // 9. Couple — 2 travelers, same trip, both full data. Tests bot's loop over travelers.
  {
    label: 'Couple (2 travelers)',
    visaType: 'TOURIST_1Y',
    totalUSD: 99.0 * 2,
    billingEmail: 'bot-test-9@example.com',
    travelers: [
      fullTraveler({
        firstName: 'Antoine',
        lastName: 'Moreau',
        email: 'bot-test-9@example.com',
        phoneNumber: '14155551009',
        passportNumber: 'BOT0000009A',
        passportCountry: 'France',
        gender: 'Male',
        maritalStatus: 'Married',
        spouseName: 'Camille Moreau',
        spouseNationality: 'France',
      }),
      fullTraveler({
        firstName: 'Camille',
        lastName: 'Moreau',
        email: 'bot-test-9@example.com',  // shared contact email
        phoneNumber: '14155551009',
        passportNumber: 'BOT0000009B',
        passportCountry: 'France',
        gender: 'Female',
        maritalStatus: 'Married',
        spouseName: 'Antoine Moreau',
        spouseNationality: 'France',
        dob: 'August 22, 1989',
      }),
    ],
  },

  // 10. Tourist 5-year visa — exercises the longest tourist visa option and
  //     ensures the visa-type select on Step 1 + the visa-purpose dropdown
  //     map TOURIST_5Y correctly.
  {
    label: 'Tourist 5-year visa',
    visaType: 'TOURIST_5Y',
    totalUSD: 159.99,
    billingEmail: 'bot-test-11@example.com',
    travelers: [
      fullTraveler({
        firstName: 'Olivier',
        lastName: 'Dubois',
        email: 'bot-test-11@example.com',
        phoneNumber: '14155551011',
        passportNumber: 'BOT0000011',
        passportCountry: 'France',
        // Long-stay tourists usually have repeat-visit history
        visitedIndiaBefore: 'yes',
        placesToVisit: 'Delhi, Goa, Kerala, Rajasthan',
      }),
    ],
  },

  // 11. Medical 60-day visa — exercises the MEDICAL_60 visa-type branch and
  //     the (typically required) sponsor-hospital fields on Step 4.
  {
    label: 'Medical 60-day visa',
    visaType: 'MEDICAL_60',
    totalUSD: 84.5,
    billingEmail: 'bot-test-12@example.com',
    travelers: [
      fullTraveler({
        firstName: 'Beatrice',
        lastName: 'Okafor',
        email: 'bot-test-12@example.com',
        phoneNumber: '14155551012',
        passportNumber: 'BOT0000012',
        passportCountry: 'Nigeria',
        // Medical visas typically have a hospital/sponsor in India
        bookedHotel: 'no',
        refNameIndia: 'Apollo Hospitals Chennai',
        refAddressIndia: '21 Greams Lane',
        refStateIndia: 'TAMIL NADU',
        refDistrictIndia: 'CHENNAI',
        refPhoneIndia: '914428290200',
        placesToVisit: 'Chennai (medical treatment)',
        arrivalPoint: 'Chennai (Airport)',
        exitPort: 'Chennai (Airport)',
      }),
    ],
  },

  // 12. Family of 4 — adults + 2 kids. Stress-tests the bot's per-traveler iteration
  //     and the gov-site multi-applicant flow.
  {
    label: 'Family of 4 (2 adults + 2 children)',
    visaType: 'TOURIST_30',
    totalUSD: 51.25 * 4,
    billingEmail: 'bot-test-10@example.com',
    travelers: [
      // Adults
      fullTraveler({
        firstName: 'David',
        lastName: 'Schultz',
        email: 'bot-test-10@example.com',
        phoneNumber: '14155551010',
        passportNumber: 'BOT0000010A',
        gender: 'Male',
        maritalStatus: 'Married',
        spouseName: 'Rebecca Schultz',
      }),
      fullTraveler({
        firstName: 'Rebecca',
        lastName: 'Schultz',
        email: 'bot-test-10@example.com',
        phoneNumber: '14155551010',
        passportNumber: 'BOT0000010B',
        gender: 'Female',
        maritalStatus: 'Married',
        spouseName: 'David Schultz',
        dob: 'March 18, 1985',
        employmentStatus: 'Self-employed',
      }),
      // Kid 1 — minor, no employment, parents = adults above
      fullTraveler({
        firstName: 'Sam',
        lastName: 'Schultz',
        email: 'bot-test-10@example.com',
        phoneNumber: '14155551010',
        passportNumber: 'BOT0000010C',
        dob: 'September 4, 2014',  // ~12 yrs old
        gender: 'Male',
        maritalStatus: 'Single',
        employmentStatus: 'Student',
        employerName: '',
        employerAddress: '',
        studentProvider: 'PS 102 Brooklyn',
        fatherName: 'David Schultz',
        motherName: 'Rebecca Schultz',
      }),
      // Kid 2
      fullTraveler({
        firstName: 'Mia',
        lastName: 'Schultz',
        email: 'bot-test-10@example.com',
        phoneNumber: '14155551010',
        passportNumber: 'BOT0000010D',
        dob: 'July 11, 2017',  // ~9 yrs old
        gender: 'Female',
        maritalStatus: 'Single',
        employmentStatus: 'Student',
        employerName: '',
        employerAddress: '',
        studentProvider: 'PS 102 Brooklyn',
        fatherName: 'David Schultz',
        motherName: 'Rebecca Schultz',
      }),
    ],
  },
];

async function main() {
  const summary: Array<{ orderNumber: number; label: string; travelers: number; created: boolean }> = [];

  for (const ord of ORDERS) {
    const existing = await prisma.order.findFirst({ where: { billingEmail: ord.billingEmail } });
    if (existing) {
      console.log(`↩︎  Skip ${ord.billingEmail} — already exists as #${existing.orderNumber}`);
      summary.push({
        orderNumber: existing.orderNumber,
        label: ord.label,
        travelers: ord.travelers.length,
        created: false,
      });
      continue;
    }
    const created = await prisma.order.create({
      data: {
        destination: 'India',
        visaType: ord.visaType,
        totalUSD: ord.totalUSD,
        status: 'PROCESSING',
        billingEmail: ord.billingEmail,
        travelers: JSON.stringify(ord.travelers),
        processingSpeed: 'standard',
        cardLast4: '4242',
      },
    });
    console.log(`✅ #${created.orderNumber} — ${ord.label} (${ord.travelers.length} traveler${ord.travelers.length !== 1 ? 's' : ''})`);
    summary.push({
      orderNumber: created.orderNumber,
      label: ord.label,
      travelers: ord.travelers.length,
      created: true,
    });
  }

  console.log('\nSummary:');
  console.table(summary);
}

main()
  .catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
